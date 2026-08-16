import { NextResponse } from "next/server";
import { authorizeWorkerRequest } from "@/features/partner/worker-auth";
import { runDeliveryWorkerTick } from "@/features/partner/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ============================================================================
// GET|POST /api/internal/workers/deliveries
//
// Drains the outbound webhook outbox. Same shape as the outputs worker: the
// cron is the guarantee, the inline kick after a Send click is just latency.
// ============================================================================

async function handle(request: Request) {
  const unauthorized = authorizeWorkerRequest(request);
  if (unauthorized) return unauthorized;

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 10);

  try {
    const result = await runDeliveryWorkerTick({
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10,
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("delivery worker: tick failed", error);
    return NextResponse.json(
      { error: "worker_failed", message: String(error) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
