import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { setCommunityGroupMembership } from "@/features/social/groups";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;
const bodySchema = z.object({ joined: z.boolean() }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const result = await setCommunityGroupMembership({
    groupId: id,
    joined: parsed.success ? parsed.data.joined : null,
  });
  if (!result.ok) {
    const status = result.outcome === "invalid" ? 400
      : result.outcome === "feature_unavailable" ? 503
        : 404;
    return NextResponse.json({ error: result.message, code: result.outcome }, { status });
  }
  return NextResponse.json({ data: result });
}
