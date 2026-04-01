import { NextResponse } from "next/server";

// GET /api/media-packages — list media packages for the authenticated user
// POST /api/media-packages — create a new media package
// TODO Phase E: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase E" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ message: "Phase E" }, { status: 501 });
}
