import { NextResponse } from "next/server";
import { authorizeWorkerRequest } from "@/features/partner/worker-auth";
import { runRetentionPurge } from "@/features/moderation/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Controlled retention purge (plan 19.3): closed cases past their approved
// period and 30-day-old unreported archived posts. Idempotent and safe to
// re-run; declined candidates are reported with their reason.
async function handle(request: Request) {
  const unauthorized = authorizeWorkerRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await runRetentionPurge();
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("retention purge worker failed", error);
    return NextResponse.json({ error: "worker_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
