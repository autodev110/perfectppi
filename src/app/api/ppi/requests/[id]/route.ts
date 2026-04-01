import { NextResponse } from "next/server";

// GET /api/ppi/requests/[id] — get a single PPI request
// PATCH /api/ppi/requests/[id] — update status (e.g. accept, start)
// TODO Phase B: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}

export async function PATCH() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}
