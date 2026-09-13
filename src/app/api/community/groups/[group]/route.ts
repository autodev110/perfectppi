import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { updateCommunityGroupSettings, type GroupCreateOutcome } from "@/features/social/group-create";
import { getCommunityGroupPinnedPosts, getCommunityGroupPosts, getCommunityGroupPostsPage } from "@/features/community/queries";
import { getCommunityGroup } from "@/features/social/groups";
import { decodeGroupDirectoryCursor } from "@/features/community/group-cursor";

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

  const searchParams = new URL(request.url).searchParams;
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const cursorMode = searchParams.get("pagination") === "cursor";
  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor ? decodeGroupDirectoryCursor(rawCursor, "posts", group.id) : null;
  if (cursorMode && rawCursor && !cursor) {
    return NextResponse.json({ error: "This group-posts page link is invalid." }, { status: 400 });
  }
  // Private/unlisted content stays locked until the viewer is a member; the
  // post RPCs enforce this too, so skipping them is only a shortcut.
  let postResult;
  let pinned;
  try {
    [postResult, pinned] = group.can_view_content
      ? await Promise.all([
        cursorMode
          ? getCommunityGroupPostsPage(group.id, cursor, 20)
          : getCommunityGroupPosts(group.id, page, 20).then((items) => ({ items, nextCursor: null })),
        cursorMode ? (!rawCursor ? getCommunityGroupPinnedPosts(group.id) : Promise.resolve([]))
          : page === 1 ? getCommunityGroupPinnedPosts(group.id) : Promise.resolve([]),
      ])
      : [{ items: [], nextCursor: null }, []];
  } catch {
    return NextResponse.json(
      { error: "Group posts are temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json(
    {
      data: {
        group, pinned, posts: postResult.items, page,
        hasMore: cursorMode ? Boolean(postResult.nextCursor) : postResult.items.length === 20,
        nextCursor: postResult.nextCursor,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

const SETTINGS_STATUS: Record<GroupCreateOutcome, number> = {
  invalid: 400, feature_unavailable: 503, account_too_new: 403, restricted: 403,
  rate_limited: 429, slug_taken: 409, policy_not_allowed: 400, policy_owner_only: 403, forbidden: 403, failed: 500,
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
