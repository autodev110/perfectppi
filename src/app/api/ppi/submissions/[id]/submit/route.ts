import { NextResponse, after } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { submitPpi } from "@/features/ppi/actions";
import { APP_UPDATE_REQUIRED, clientSupportsCatalog } from "@/features/ppi/client-capability";
import { V2_CATALOG_VERSION } from "@/features/ppi/inspection-schema";
import { z } from "zod";
import { enqueueOutputGeneration, runOutputWorkerTick } from "@/features/outputs/worker";

export const runtime = "nodejs";
// The inline kick below runs report generation in the same invocation when it
// can, so this handler needs the same headroom as the cron worker.
export const maxDuration = 300;

// The inspector's accuracy certification travels with the submit. The server
// derives the signer and time; the client only states that it agreed, to which
// wording, and which reviewed revision it agreed to.
const submitBodySchema = z.object({
  certification: z.object({
    accepted: z.literal(true),
    text_version: z.string().min(1).max(64),
    expected_revision: z.number().int().min(0),
    locale: z.string().max(35).optional(),
  }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  const parsed = submitBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Builds that predate certification send an empty body; tell them to
    // update rather than showing a generic validation error.
    if (!(await clientSupportsCatalog(V2_CATALOG_VERSION))) {
      return NextResponse.json(APP_UPDATE_REQUIRED, { status: 426 });
    }
    return NextResponse.json(
      { error: "Confirm the accuracy certification to submit.", code: "certification_required" },
      { status: 400 },
    );
  }

  const result = await submitPpi(id, {
    accepted: parsed.data.certification.accepted,
    textVersion: parsed.data.certification.text_version,
    expectedRevision: parsed.data.certification.expected_revision,
    locale: parsed.data.certification.locale,
  });
  if ("error" in result) {
    const code = (result as { code?: string }).code;
    // Photo verification is a transient storage condition: retry, not a fix.
    if (code === "media_unverified") {
      return NextResponse.json({ error: result.error, code }, { status: 503, headers: { "Retry-After": "5" } });
    }
    return NextResponse.json(
      { error: result.error, code, missingAnswerIds: (result as { missingAnswerIds?: string[] }).missingAnswerIds },
      { status: code === "stale_revision" ? 409 : 400 }
    );
  }

  // Durable first: the job row is what guarantees the report gets built, even
  // if this serverless invocation is torn down a millisecond from now.
  const job = await enqueueOutputGeneration({
    submissionId: id,
    trigger: "submission",
    requestedBy: auth.profile.id,
  });

  if ("error" in job) {
    // Submission still succeeded — outputs are recoverable via the cron worker
    // or the Retry control, so this must not fail the request.
    console.error("submit: failed to enqueue output generation", job.error);
  }

  // Then latency: `after` runs once the response has been sent but keeps the
  // function alive, unlike a floating promise which the platform may kill.
  after(async () => {
    try {
      await runOutputWorkerTick({ limit: 1 });
    } catch (error) {
      console.error("submit: inline output tick failed", error);
    }
  });

  return NextResponse.json({
    success: true,
    requestId: result.requestId,
    certification: result.certification,
    outputJob: "error" in job ? null : job,
  });
}
