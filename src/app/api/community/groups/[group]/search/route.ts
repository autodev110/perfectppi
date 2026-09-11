import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroup } from "@/features/social/groups";
import { searchCommunityGroupPosts } from "@/features/community/queries";

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
  const posts = query.length >= 2 ? await searchCommunityGroupPosts(group.id, query, page, 20) : [];
  return NextResponse.json(
    { data: { query, posts, page, hasMore: posts.length === 20 } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
