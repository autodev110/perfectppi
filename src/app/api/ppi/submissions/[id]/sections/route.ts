import { NextResponse } from "next/server";

// GET /api/ppi/submissions/[id]/sections — list all sections for a submission
// POST /api/ppi/submissions/[id]/sections — create or upsert a section
// TODO Phase B: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}
