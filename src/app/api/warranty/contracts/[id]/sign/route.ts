import { NextResponse } from "next/server";

// POST /api/warranty/contracts/[id]/sign — record contract signature via DocuSeal callback
// Must be signed before payment unlocks
// TODO Phase D: implement full logic
export async function POST() {
  return NextResponse.json({ message: "Phase D" }, { status: 501 });
}
