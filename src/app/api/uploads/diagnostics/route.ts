import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { logUploadEvent } from "@/features/uploads/diagnostics";

// POST /api/uploads/diagnostics — client-side upload outcome (Renditions doc,
// "Add logging for diagnostics"). Only metadata is accepted: stage, status,
// content type, size, duration, browser family. No file names, no ids.
const bodySchema = z.object({
  entity: z.enum(["ppi_media", "vehicle_media"]),
  stage: z.enum(["preparing", "uploading", "processing", "done", "failed"]),
  outcome: z.enum(["failed", "fallback"]),
  status: z.number().int().min(0).max(999).optional(),
  contentType: z.string().max(80),
  sizeBytes: z.number().int().nonnegative().max(1_000_000_000),
  durationMs: z.number().int().nonnegative().max(3_600_000),
  browser: z.string().max(40).optional(),
  online: z.boolean().optional(),
  message: z.string().max(200).optional(),
}).strict();

export async function POST(request: Request) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid diagnostic" }, { status: 400 });
  logUploadEvent({ source: "client", ...parsed.data });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
