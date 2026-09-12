import { NextResponse } from "next/server";
import { authorizeWorkerRequest } from "@/features/partner/worker-auth";
import { processModerationOutbox } from "@/features/moderation/outbox";
import { runTrackedWorker } from "@/features/operations/worker-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Generates SLA alerts, then drains the moderation outbox (plan 18.5, 22.1,
// 29.8). Safe to run concurrently: claims use SKIP LOCKED and every delivery
// is idempotent per (recipient, job).
async function handle(request: Request) {
  const unauthorized = authorizeWorkerRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await runTrackedWorker("moderation_outbox", () => processModerationOutbox());
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("moderation outbox worker failed", error);
    return NextResponse.json({ error: "worker_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
