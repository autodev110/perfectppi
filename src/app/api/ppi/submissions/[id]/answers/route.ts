import { NextResponse } from "next/server";

// GET /api/ppi/submissions/[id]/answers — list all answers for a submission
// POST /api/ppi/submissions/[id]/answers — save an answer
// TODO Phase B: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}
