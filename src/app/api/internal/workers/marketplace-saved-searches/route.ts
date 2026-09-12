import { NextResponse } from "next/server";
import { authorizeWorkerRequest } from "@/features/partner/worker-auth";
import { runSavedSearchNotifications } from "@/features/marketplace/saved-searches";
import { runTrackedWorker } from "@/features/operations/worker-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily (vercel.json): one aggregated notice per saved search with new
// matching listings (plan 25.1 "sensible notification frequency").
async function handle(request: Request) {
  const unauthorized = authorizeWorkerRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const result = await runTrackedWorker("marketplace_saved_searches", runSavedSearchNotifications);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("saved search worker failed", error);
    return NextResponse.json({ error: "worker_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
