import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroupPosts } from "@/features/community/queries";
import { getCommunityGroup } from "@/features/social/groups";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const requestedPage = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const posts = await getCommunityGroupPosts(group.id, page, 20);
  return NextResponse.json(
    { data: { group, posts, page, hasMore: posts.length === 20 } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
