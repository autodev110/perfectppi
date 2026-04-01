import { NextResponse } from "next/server";

// POST /api/warranty/orders — create a warranty order (plan selection)
// Strict order: offer → select → contract → sign → pay
// TODO Phase D: implement full logic
export async function POST() {
  return NextResponse.json({ message: "Phase D" }, { status: 501 });
}
