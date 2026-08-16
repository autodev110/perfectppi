import { NextResponse, after } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { submitPpi } from "@/features/ppi/actions";
import { enqueueOutputGeneration, runOutputWorkerTick } from "@/features/outputs/worker";

export const runtime = "nodejs";
// The inline kick below runs report generation in the same invocation when it
// can, so this handler needs the same headroom as the cron worker.
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  const result = await submitPpi(id);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, missingAnswerIds: (result as { missingAnswerIds?: string[] }).missingAnswerIds },
      { status: 400 }
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
    outputJob: "error" in job ? null : job,
  });
}
