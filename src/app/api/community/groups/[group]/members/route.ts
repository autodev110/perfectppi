import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroup } from "@/features/social/groups";
import { getGroupMembers, getGroupMembersPage } from "@/features/social/group-tools";
import { decodeGroupDirectoryCursor } from "@/features/community/group-cursor";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

// GET /api/community/groups/<slug>/members?page= — owner, moderators, then
// members; blocked and unavailable profiles are omitted server-side.
export async function GET(request: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const cursorMode = request.nextUrl.searchParams.get("pagination") === "cursor";
  const rawCursor = request.nextUrl.searchParams.get("cursor");
  const cursor = rawCursor ? decodeGroupDirectoryCursor(rawCursor, "members", group.id) : null;
  if (cursorMode && rawCursor && !cursor) {
    return NextResponse.json({ error: "This group-members page link is invalid." }, { status: 400 });
  }
  let result;
  try {
    result = cursorMode
      ? await getGroupMembersPage(group.id, cursor, 50)
      : { items: await getGroupMembers(group.id, page, 50), nextCursor: null };
  } catch {
    return NextResponse.json(
      { error: "Group members are temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json(
    {
      data: {
        members: result.items, page,
        hasMore: cursorMode ? Boolean(result.nextCursor) : result.items.length === 50,
        nextCursor: result.nextCursor,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
