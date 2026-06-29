import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import {
  getReviewEligibilityForRequest,
  getMyReviewForRequest,
} from "@/features/reviews/queries";
import { upsertTechnicianReviewFromInput } from "@/features/reviews/actions";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().nullable(),
  content: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const [eligibility, review] = await Promise.all([
    getReviewEligibilityForRequest(id),
    getMyReviewForRequest(id),
  ]);

  return NextResponse.json({ data: { eligibility, review } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review payload" }, { status: 400 });
  }

  const { id } = await params;
  const result = await upsertTechnicianReviewFromInput({
    ppiRequestId: id,
    rating: parsed.data.rating,
    title: parsed.data.title,
    content: parsed.data.content,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
