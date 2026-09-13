import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getAdminTechnicianReviews } from "@/features/reviews/queries";
import { getAdminPpiServiceDisputes, resolvePpiServiceDispute } from "@/features/reviews/disputes";

const statusSchema = z.enum(["active", "hidden", "all"]);

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const perPage = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("perPage") ?? 50)));
  const status = statusSchema.safeParse(req.nextUrl.searchParams.get("status"));

  const [data, disputes] = await Promise.all([
    getAdminTechnicianReviews(page, perPage, status.success ? status.data : undefined),
    getAdminPpiServiceDisputes("open"),
  ]);

  return NextResponse.json({ data: { ...data, disputes }, page, perPage });
}

const resolutionSchema = z.object({
  disputeId: z.string().uuid(),
  status: z.enum(["resolved", "dismissed"]),
  outcome: z.enum(["customer_supported", "technician_supported", "partial_resolution", "no_finding"]),
  resolutionNote: z.string().trim().min(10).max(2000),
  restoreReview: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;
  const parsed = resolutionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid dispute resolution", code: "invalid" }, { status: 400 });
  const result = await resolvePpiServiceDispute(parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
