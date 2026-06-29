import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";

export async function GET(request: Request) {
  const auth = await requireApiRole([
    "consumer",
    "technician",
    "org_manager",
    "admin",
  ]);
  if ("response" in auth) return auth.response;

  const { supabase, profile } = auth;
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? 50) || 50,
    200,
  );

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
