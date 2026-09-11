import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroup } from "@/features/social/groups";
import { clearCommunityGroupImage, GROUP_IMAGE_KINDS, setCommunityGroupImage, type GroupImageResult } from "@/features/social/group-images";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;
const STATUS: Record<Exclude<GroupImageResult, { ok: true }>["outcome"], number> = {
  invalid: 400, feature_unavailable: 503, forbidden: 403, restricted: 403,
  upload_invalid: 400, not_allowed: 422, held: 409, failed: 500,
};

// POST /api/community/groups/<slug>/images { kind: avatar|cover, url, contentType }
// The url is a quarantine reference from /api/upload/presigned-url with
// entity "community_group" and recordId = group id (plan 13.5).
export async function POST(request: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await setCommunityGroupImage({ ...(body ?? {}), groupId: group.id });
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.outcome }, { status: STATUS[result.outcome] });
  return NextResponse.json({ data: { kind: result.kind, url: result.url } });
}

// DELETE /api/community/groups/<slug>/images?kind=avatar|cover
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const kind = z.enum(GROUP_IMAGE_KINDS).safeParse(request.nextUrl.searchParams.get("kind"));
  if (!kind.success) return NextResponse.json({ error: "Invalid image" }, { status: 400 });
  const result = await clearCommunityGroupImage(group.id, kind.data);
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.outcome }, { status: STATUS[result.outcome] });
  return NextResponse.json({ data: { kind: result.kind, url: null } });
}
