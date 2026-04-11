import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getConversation } from "@/features/messages/queries";
import { markConversationRead } from "@/features/messages/actions";

// GET /api/messages/conversations/[id] — get conversation + messages
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await markConversationRead(id);

  return NextResponse.json({ data: conversation });
}
