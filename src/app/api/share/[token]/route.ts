import { NextResponse } from "next/server";

// GET /api/share/[token] — resolve a share link token to its target resource
// Public read-only access, no auth required
// TODO Phase E: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase E" }, { status: 501 });
}
