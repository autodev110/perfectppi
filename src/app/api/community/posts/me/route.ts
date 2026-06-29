import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getMyCommunityPosts } from "@/features/community/queries";

const statusSchema = z.enum(["active", "archived"]);

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const parsed = statusSchema.safeParse(req.nextUrl.searchParams.get("status"));
  const data = await getMyCommunityPosts(parsed.success ? parsed.data : "active");
  return NextResponse.json({ data });
}
