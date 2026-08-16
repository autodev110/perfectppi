import { NextResponse } from "next/server";
import { authorizeWorkerRequest } from "@/features/partner/worker-auth";
import { runOutputWorkerTick } from "@/features/outputs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Report generation calls Gemini twice and renders two PDFs, so give the tick
// room to finish rather than have the platform cut it off mid-upload.
export const maxDuration = 300;

// ============================================================================
// GET|POST /api/internal/workers/outputs
//
// The guaranteed execution mechanism for output generation. Vercel Cron calls
// this on a schedule; the submit route also kicks it once for latency. Neither
// path is load-bearing on its own — the queue is.
// ============================================================================

async function handle(request: Request) {
  const unauthorized = authorizeWorkerRequest(request);
  if (unauthorized) return unauthorized;

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 3);

  try {
    const result = await runOutputWorkerTick({
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 10) : 3,
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("outputs worker: tick failed", error);
    return NextResponse.json(
      { error: "worker_failed", message: String(error) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
