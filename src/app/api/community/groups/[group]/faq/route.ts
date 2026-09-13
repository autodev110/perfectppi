import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroup } from "@/features/social/groups";
import { deleteGroupFaq, getGroupFaqEntries, saveGroupFaq } from "@/features/social/group-tools";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;
const STATUS = { invalid: 400, feature_unavailable: 503, forbidden: 403, not_found: 404, conflict: 409 } as const;

async function resolveGroup(slug: string) {
  return getCommunityGroup(slug);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await resolveGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (!group.can_view_content) return NextResponse.json({ error: "Join this group to view its FAQ." }, { status: 403 });
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const entries = await getGroupFaqEntries(group.id, query, page, 50);
  return NextResponse.json({ data: { entries, query, page, hasMore: entries.length === 50 } }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await resolveGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await saveGroupFaq({ ...(body ?? {}), groupId: group.id });
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.outcome }, { status: STATUS[result.outcome] });
  return NextResponse.json({ data: result.data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await resolveGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const entryId = request.nextUrl.searchParams.get("entry") ?? "";
  const result = await deleteGroupFaq(group.id, entryId);
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.outcome }, { status: STATUS[result.outcome] });
  return NextResponse.json({ data: { deleted: true } });
}
