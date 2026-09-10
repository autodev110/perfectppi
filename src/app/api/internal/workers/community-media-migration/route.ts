import { NextResponse } from "next/server";
import { authorizeWorkerRequest } from "@/features/partner/worker-auth";
import { migrateLegacyCommunityMedia } from "@/features/community/media-migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Retires permanent public Community media URLs in small idempotent batches
// (plan 19.2). Safe to run repeatedly; the social beta stays closed until the
// reported remainingLegacy count reaches zero.
async function handle(request: Request) {
  const unauthorized = authorizeWorkerRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const report = await migrateLegacyCommunityMedia(10);
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("community media migration worker failed", error);
    return NextResponse.json({ error: "worker_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
