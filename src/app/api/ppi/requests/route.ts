import { NextResponse } from "next/server";

// GET /api/ppi/requests — list PPI requests for the authenticated user
// POST /api/ppi/requests — create a new PPI request from the intake wizard
// TODO Phase B: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}
