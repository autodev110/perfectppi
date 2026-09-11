import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { updateCommunityGroupSettings, type GroupCreateOutcome } from "@/features/social/group-create";
import { getCommunityGroupPinnedPosts, getCommunityGroupPosts } from "@/features/community/queries";
import { getCommunityGroup } from "@/features/social/groups";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ group: string }> },
) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const requestedPage = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  // Private/unlisted content stays locked until the viewer is a member; the
  // post RPCs enforce this too, so skipping them is only a shortcut.
  const [posts, pinned] = group.can_view_content
    ? await Promise.all([
      getCommunityGroupPosts(group.id, page, 20),
      page === 1 ? getCommunityGroupPinnedPosts(group.id) : Promise.resolve([]),
    ])
    : [[], []];
  return NextResponse.json(
    { data: { group, pinned, posts, page, hasMore: posts.length === 20 } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

const SETTINGS_STATUS: Record<GroupCreateOutcome, number> = {
  invalid: 400, feature_unavailable: 503, account_too_new: 403, restricted: 403,
  rate_limited: 429, slug_taken: 409, policy_not_allowed: 400, forbidden: 403, failed: 500,
};

// PATCH /api/community/groups/<slug> — owner-only settings (plan 13.4).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const result = await updateCommunityGroupSettings(group.id, await request.json().catch(() => null));
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.outcome }, { status: SETTINGS_STATUS[result.outcome] });
  }
  return NextResponse.json({ data: { id: result.id, slug: result.slug } });
}
