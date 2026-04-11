import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { sendMessage } from "@/features/messages/actions";
import { z } from "zod";

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  attachmentUrl: z.string().url().optional(),
  attachmentType: z.string().trim().min(1).max(255).optional(),
});

// POST /api/messages/conversations/[id]/messages — send a message in a conversation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await sendMessage({
    conversationId: id,
    content: parsed.data.content,
    attachmentUrl: parsed.data.attachmentUrl,
    attachmentType: parsed.data.attachmentType,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
