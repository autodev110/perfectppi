import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { retryOutputGeneration } from "@/features/outputs/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================================
// POST /api/ppi/outputs/retry
//
// Resumes generation for a submission whose report has not appeared yet. The
// *same* output version is retried, so work that already succeeded is reused
// and no second version is minted.
//
// This is what the "still generating" UI calls. /outputs/regenerate is the
// different, deliberate action: throw away nothing, but produce a new
// immutable version of a report that already exists.
// ============================================================================

const bodySchema = z.object({ submissionId: z.string().uuid() });

export async function POST(request: Request) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const result = await retryOutputGeneration(parsed.data.submissionId);
  if ("error" in result) {
    const message = result.error ?? "Failed to retry output generation";
    const status =
      message === "Not authenticated"
        ? 401
        : message.toLowerCase().includes("not authorized")
          ? 403
          : 400;

    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ data: result.data });
}
