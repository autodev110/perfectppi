import { NextResponse } from "next/server";
import { authorizeWorkerRequest } from "@/features/partner/worker-auth";
import { runStorageCleanup } from "@/features/uploads/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const unauthorized = authorizeWorkerRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const result = await runStorageCleanup();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("storage cleanup worker failed", error);
    return NextResponse.json({ error: "worker_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
