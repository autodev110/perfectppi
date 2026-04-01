import { NextResponse } from "next/server";

// GET /api/ppi/submissions/[id] — get a single submission with sections + answers
// PATCH /api/ppi/submissions/[id] — update submission (draft save)
// TODO Phase B: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}

export async function PATCH() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}
