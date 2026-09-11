import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createCommunityPostFromInput } from "@/features/community/actions";
import { getCommunityPosts, getVehicleDiscussionPosts } from "@/features/community/queries";
import { PUBLICATION_OUTCOME_STATUS } from "@/lib/moderation/launch-policy";
import { z } from "zod";

const feedQuerySchema = z.object({
  filter: z.enum(["all", "friends", "my_cars"]).default("all"),
  page: z.coerce.number().int().positive().max(10_000).default(1),
  /** Posts tagged to one public vehicle (Garage ↔ Community cross-navigation). */
  vehicle: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const parsed = feedQuerySchema.safeParse({
    filter: req.nextUrl.searchParams.get("filter") ?? undefined,
    page: req.nextUrl.searchParams.get("page") ?? undefined,
    vehicle: req.nextUrl.searchParams.get("vehicle") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feed filter" }, { status: 400 });
  }
  const data = parsed.data.vehicle
    ? await getVehicleDiscussionPosts(parsed.data.vehicle)
    : await getCommunityPosts(parsed.data.page, 20, parsed.data.filter);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const result = await createCommunityPostFromInput(body);

  if (result.error !== undefined) {
    const response = NextResponse.json(
      {
        error: result.error,
        code: result.code ?? null,
        retryAfterSeconds: result.retryAfterSeconds ?? null,
      },
      { status: result.code ? PUBLICATION_OUTCOME_STATUS[result.code] : 400 },
    );
    if (result.retryAfterSeconds) {
      response.headers.set("Retry-After", String(result.retryAfterSeconds));
    }
    return response;
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
