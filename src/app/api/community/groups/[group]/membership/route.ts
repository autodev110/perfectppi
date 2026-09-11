import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { GROUP_MEMBERSHIP_ACTIONS, setCommunityGroupMembership, type GroupMembershipOutcome } from "@/features/social/groups";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;
const bodySchema = z.object({
  joined: z.boolean().optional(),
  action: z.enum(GROUP_MEMBERSHIP_ACTIONS).optional(),
  message: z.string().trim().max(300).optional(),
}).strict();

const STATUS: Record<Exclude<GroupMembershipOutcome, "ok">, number> = {
  invalid: 400, feature_unavailable: 503, group_unavailable: 404, requires_request: 403, invite_only: 403, cooldown: 429,
};

// POST /api/community/groups/<id>/membership
// { action: join|leave|request|cancel_request|accept_invite|decline_invite, message? }
// (`{ joined: boolean }` is still accepted for older clients.)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ group: string }> },
) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: groupId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const result = await setCommunityGroupMembership({
    groupId,
    joined: parsed.success ? parsed.data.joined ?? null : null,
    action: parsed.success ? parsed.data.action : undefined,
    message: parsed.success ? parsed.data.message : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.outcome }, { status: STATUS[result.outcome] });
  }
  return NextResponse.json({ data: result });
}
