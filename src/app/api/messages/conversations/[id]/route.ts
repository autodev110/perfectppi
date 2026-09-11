import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getConversation } from "@/features/messages/queries";
import { decideMessageRequest, markConversationRead } from "@/features/messages/actions";
import { z } from "zod";

const decisionSchema = z.object({ decision: z.enum(["accept", "decline"]) });

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  const { id } = await params;
  const result = await decideMessageRequest({ conversationId: id, decision: parsed.data.decision });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ data: result.data });
}
