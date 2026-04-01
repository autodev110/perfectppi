import { NextResponse } from "next/server";

// GET /api/messages/conversations — list conversations for the authenticated user
// POST /api/messages/conversations — create a new conversation
// TODO Phase E: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase E" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ message: "Phase E" }, { status: 501 });
}
