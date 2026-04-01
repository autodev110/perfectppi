import { NextResponse } from "next/server";

// POST /api/messages/conversations/[id]/messages — send a message in a conversation
// TODO Phase E: implement full logic
export async function POST() {
  return NextResponse.json({ message: "Phase E" }, { status: 501 });
}
