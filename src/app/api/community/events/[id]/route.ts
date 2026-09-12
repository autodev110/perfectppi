import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityEvent } from "@/features/social/events";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const parsed = z.string().uuid().safeParse((await params).id);
  if (!parsed.success) return NextResponse.json({ error: "Event not found", code: "not_found" }, { status: 404 });
  const event = await getCommunityEvent(parsed.data);
  if (!event) return NextResponse.json({ error: "Event not found", code: "not_found" }, { status: 404 });
  return NextResponse.json({ data: event }, { headers: { "Cache-Control": "private, no-store" } });
}
