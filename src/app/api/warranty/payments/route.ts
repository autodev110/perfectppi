import { NextResponse } from "next/server";

// POST /api/warranty/payments — initiate Stripe payment for a signed contract
// Contract must be signed before this endpoint is reachable
// TODO Phase D: implement full logic
export async function POST() {
  return NextResponse.json({ message: "Phase D" }, { status: 501 });
}
