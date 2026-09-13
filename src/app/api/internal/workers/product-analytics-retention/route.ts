import { NextResponse } from "next/server";
import { pruneProductAnalyticsEvents } from "@/features/analytics/product-events";
import { runTrackedWorker } from "@/features/operations/worker-runs";
import { authorizeWorkerRequest } from "@/features/partner/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const unauthorized = authorizeWorkerRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await runTrackedWorker("product_analytics_retention", pruneProductAnalyticsEvents);
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "worker_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
