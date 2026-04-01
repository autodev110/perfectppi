import { NextResponse } from "next/server";

// GET /api/warranty/orders/[id] — get a single warranty order and its status
// TODO Phase D: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase D" }, { status: 501 });
}
