import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createCommunityPostFromInput } from "@/features/community/actions";
import { getCommunityPosts } from "@/features/community/queries";
import { PUBLICATION_OUTCOME_STATUS } from "@/lib/moderation/launch-policy";
import { z } from "zod";

const feedQuerySchema = z.object({
  filter: z.enum(["all", "friends", "my_cars"]).default("all"),
  page: z.coerce.number().int().positive().max(10_000).default(1),
});

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const parsed = feedQuerySchema.safeParse({
    filter: req.nextUrl.searchParams.get("filter") ?? undefined,
    page: req.nextUrl.searchParams.get("page") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feed filter" }, { status: 400 });
  }
  const data = await getCommunityPosts(parsed.data.page, 20, parsed.data.filter);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const result = await createCommunityPostFromInput(body);

  if (result.error !== undefined) {
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.code ? PUBLICATION_OUTCOME_STATUS[result.code] : 400 },
    );
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
