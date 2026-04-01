import { NextResponse } from "next/server";

// GET /api/warranty/options/[vscOutputId] — get warranty options generated from a VSC output
// TODO Phase D: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase D" }, { status: 501 });
}
