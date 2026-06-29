import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getAdminCommunityPosts } from "@/features/community/queries";

const statusSchema = z.enum(["active", "archived", "all"]);

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const perPage = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("perPage") ?? 50)));
  const status = statusSchema.safeParse(req.nextUrl.searchParams.get("status"));

  const data = await getAdminCommunityPosts(
    page,
    perPage,
    status.success ? status.data : undefined,
  );

  return NextResponse.json({ data, page, perPage });
}
