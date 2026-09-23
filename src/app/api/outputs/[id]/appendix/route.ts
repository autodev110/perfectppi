import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePresignedGetUrl, isStoredObjectConfigured } from "@/lib/storage/r2";
import {
  APPENDIX_LOCALE,
  requestEvidenceAppendix,
  runEvidenceAppendixTick,
  statusView,
} from "@/features/outputs/evidence-appendix";
import { APPENDIX_TEMPLATE_VERSION } from "@/lib/pdf/inspection-report/appendix";

export const runtime = "nodejs";
export const maxDuration = 300;

// ============================================================================
// /api/outputs/[id]/appendix — optional photo evidence appendix.
//
//   POST  request (or retry) the separate appendix PDF for this report version
//   GET   status; ?download=1 redirects to a short-lived private download
//
// Access follows the same consumer/performer/organization/admin boundary as
// the report and its photos. Share links, partners and the marketplace never
// reach this route.
// ============================================================================

async function authorizedOutput(outputId: string) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return { response: auth.response };
  if (!z.string().uuid().safeParse(outputId).success) {
    return { response: NextResponse.json({ error: "Report not found" }, { status: 404 }) };
  }
  // RLS decides visibility for app users; admins read through the service role.
  const client = auth.profile.role === "admin" ? createAdminClient() : auth.supabase;
  const { data: output } = await client
    .from("standardized_outputs")
    .select("id, ppi_submission_id, version")
    .eq("id", outputId)
    .maybeSingle();
  if (!output) return { response: NextResponse.json({ error: "Report not found" }, { status: 404 }) };
  return { auth, output };
}

async function currentExport(submissionId: string, version: number) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("inspection_output_exports")
    .select("*")
    .match({
      ppi_submission_id: submissionId,
      output_version: version,
      export_type: "evidence_appendix",
      template_version: APPENDIX_TEMPLATE_VERSION,
      locale: APPENDIX_LOCALE,
    })
    .maybeSingle();
  return data;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await authorizedOutput(id);
  if ("response" in resolved) return resolved.response;

  const body = (await request.json().catch(() => ({}))) as { retry?: boolean };
  try {
    const { row } = await requestEvidenceAppendix({
      outputId: resolved.output.id,
      requesterId: resolved.auth.profile.id,
      retry: body.retry === true,
    });
    if (row.status === "queued" || row.status === "retryable_failure") {
      // Latency only; the worker cron is the guaranteed path.
      after(async () => {
        try {
          await runEvidenceAppendixTick({ limit: 1 });
        } catch (error) {
          console.error("appendix: inline tick failed", error);
        }
      });
    }
    return NextResponse.json({ data: statusView(row) }, { status: 202 });
  } catch (error) {
    console.error("appendix: request failed", error);
    return NextResponse.json({ error: "Could not request the photo evidence appendix." }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await authorizedOutput(id);
  if ("response" in resolved) return resolved.response;

  const row = await currentExport(resolved.output.ppi_submission_id, resolved.output.version);
  const download = new URL(request.url).searchParams.get("download") === "1";
  if (!download) {
    return NextResponse.json({ data: statusView(row) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!row?.storage_key || !["ready", "incomplete"].includes(row.status)) {
    return NextResponse.json({ error: "The appendix is not ready yet." }, { status: 409 });
  }
  if (!isStoredObjectConfigured(row.storage_key)) {
    return NextResponse.json({ error: "Private document storage is not configured." }, { status: 503 });
  }
  const url = await generatePresignedGetUrl(row.storage_key, 300, {
    downloadName: row.status === "ready" ? "photo-evidence-appendix.pdf" : "photo-evidence-appendix-INCOMPLETE.pdf",
  });
  return NextResponse.redirect(url);
}
