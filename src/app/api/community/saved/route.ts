import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getSavedCommunityPosts, getSavedCommunityPostsPage } from "@/features/community/queries";
import { decodeSavedCursor } from "@/features/saved/cursor";

const querySchema = z.object({
  page: z.coerce.number().int().positive().max(10_000).default(1),
  pagination: z.literal("cursor").optional(),
  cursor: z.string().max(256).optional(),
});

// GET /api/community/saved — the caller's saved posts, newest save first.
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const parsed = querySchema.safeParse({
    page: req.nextUrl.searchParams.get("page") ?? undefined,
    pagination: req.nextUrl.searchParams.get("pagination") ?? undefined,
    cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  const cursor = parsed.data.cursor ? decodeSavedCursor(parsed.data.cursor, "posts") : null;
  if (parsed.data.pagination === "cursor" && parsed.data.cursor && !cursor) {
    return NextResponse.json({ error: "This saved-posts page link is invalid." }, { status: 400 });
  }

  try {
    const data = parsed.data.pagination === "cursor"
      ? await getSavedCommunityPostsPage(cursor, 20)
      : await getSavedCommunityPosts(parsed.data.page, 20);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Saved posts are temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
