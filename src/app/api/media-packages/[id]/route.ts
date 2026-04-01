import { NextResponse } from "next/server";

// GET /api/media-packages/[id] — get a single media package
// PATCH /api/media-packages/[id] — update a media package
// DELETE /api/media-packages/[id] — delete a media package
// TODO Phase E: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase E" }, { status: 501 });
}

export async function PATCH() {
  return NextResponse.json({ message: "Phase E" }, { status: 501 });
}

export async function DELETE() {
  return NextResponse.json({ message: "Phase E" }, { status: 501 });
}
