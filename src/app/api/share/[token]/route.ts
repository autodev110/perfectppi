import { NextRequest, NextResponse } from "next/server";
import { resolveShareLink } from "@/features/media/queries";

// GET /api/share/[token] — resolve a share link token to its target resource
// Public read-only access, no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const data = await resolveShareLink(token);

  if (!data) {
    return NextResponse.json({ error: "Invalid or expired share link" }, { status: 404 });
  }

  return NextResponse.json({ data });
}
