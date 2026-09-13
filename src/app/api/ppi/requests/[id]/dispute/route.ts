import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { openPpiServiceDispute, withdrawPpiServiceDispute } from "@/features/reviews/disputes";

const openSchema = z.object({
  reasonCode: z.enum([
    "quality_concern",
    "incomplete_inspection",
    "incorrect_information",
    "professional_conduct",
    "billing_or_scope",
    "other",
  ]),
  details: z.string().trim().min(20).max(2000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => null);
  const parsed = openSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Describe the inspection concern in at least 20 characters.", code: "invalid" }, { status: 400 });
  const result = await openPpiServiceDispute({ ppiRequestId: (await params).id, ...parsed.data });
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "forbidden" ? 403 : 409 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => null);
  // The Swift client's standard encoder emits snake_case, while web clients
  // use camelCase. Accept both at this transport boundary.
  const parsed = z.object({
    disputeId: z.string().uuid().optional(),
    dispute_id: z.string().uuid().optional(),
  }).refine((value) => Boolean(value.disputeId ?? value.dispute_id)).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid dispute reference", code: "invalid" }, { status: 400 });
  const result = await withdrawPpiServiceDispute(parsed.data.disputeId ?? parsed.data.dispute_id!);
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "forbidden" ? 403 : 409 });
  return NextResponse.json({ data: result.data });
}
