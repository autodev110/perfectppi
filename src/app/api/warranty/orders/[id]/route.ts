import { NextRequest, NextResponse } from "next/server";
import { getWarrantyOrder } from "@/features/warranty/queries";

// GET /api/warranty/orders/[id] — order status polling
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const order = await getWarrantyOrder(id);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(order);
}
