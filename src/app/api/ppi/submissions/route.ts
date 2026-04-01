import { NextResponse } from "next/server";

// POST /api/ppi/submissions — create a new submission for a PPI request
// TODO Phase B: implement full logic
export async function POST() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}
