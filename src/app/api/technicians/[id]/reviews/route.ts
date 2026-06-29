import { NextRequest, NextResponse } from "next/server";
import {
  getPublicTechnicianReviews,
  getTechnicianReviewSummary,
} from "@/features/reviews/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("limit") ?? 20)));

  const [summary, reviews] = await Promise.all([
    getTechnicianReviewSummary(id),
    getPublicTechnicianReviews(id, limit),
  ]);

  return NextResponse.json({ data: { summary, reviews } });
}
