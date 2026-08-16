import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// ============================================================================
// Authentication for the internal worker endpoints.
//
// These routes drain durable queues, so they are reachable from the public
// internet and must not be callable by anyone else. Two accepted callers:
//
//   Vercel Cron          Authorization: Bearer $CRON_SECRET
//   Manual / self-invoke x-worker-secret: $WORKER_SECRET (falls back to CRON_SECRET)
//
// If neither secret is configured the endpoints refuse to run at all, rather
// than defaulting to open.
// ============================================================================

export function authorizeWorkerRequest(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  const workerSecret = process.env.WORKER_SECRET ?? cronSecret;

  if (!cronSecret && !workerSecret) {
    return NextResponse.json(
      {
        error: "worker_not_configured",
        message: "Set CRON_SECRET (and optionally WORKER_SECRET) to enable the workers.",
      },
      { status: 503 },
    );
  }

  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();
  const headerSecret = request.headers.get("x-worker-secret")?.trim();

  const accepted =
    (cronSecret && bearer && constantTimeEquals(bearer, cronSecret)) ||
    (workerSecret && headerSecret && constantTimeEquals(headerSecret, workerSecret));

  if (!accepted) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
