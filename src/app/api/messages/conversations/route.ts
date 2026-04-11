import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getConversations } from "@/features/messages/queries";
import { createConversation } from "@/features/messages/actions";
import { z } from "zod";

const createConversationSchema = z.object({
  participantId: z.string().uuid(),
});

// GET /api/messages/conversations — list conversations for authenticated user
export async function GET() {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const data = await getConversations();
  return NextResponse.json({ data });
}

// POST /api/messages/conversations — create conversation with another profile
export async function POST(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await createConversation(parsed.data);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
