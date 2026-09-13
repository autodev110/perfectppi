import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroup } from "@/features/social/groups";
import { searchCommunityGroupPosts, searchCommunityGroupPostsPage } from "@/features/community/queries";
import { decodeGroupDirectoryCursor } from "@/features/community/group-cursor";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

// GET /api/community/groups/<slug>/search?q=&page= (plan 13.5).
export async function GET(request: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const cursorMode = request.nextUrl.searchParams.get("pagination") === "cursor";
  const rawCursor = request.nextUrl.searchParams.get("cursor");
  const cursor = rawCursor ? decodeGroupDirectoryCursor(rawCursor, "search", group.id, query) : null;
  if (cursorMode && rawCursor && !cursor) {
    return NextResponse.json({ error: "This group-search page link is invalid or no longer matches the search." }, { status: 400 });
  }
  let result;
  try {
    result = query.length >= 2
      ? cursorMode
        ? await searchCommunityGroupPostsPage(group.id, query, cursor, 20)
        : { items: await searchCommunityGroupPosts(group.id, query, page, 20), nextCursor: null }
      : { items: [], nextCursor: null };
  } catch {
    return NextResponse.json(
      { error: "Group search is temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json(
    {
      data: {
        query, posts: result.items, page,
        hasMore: cursorMode ? Boolean(result.nextCursor) : result.items.length === 20,
        nextCursor: result.nextCursor,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
