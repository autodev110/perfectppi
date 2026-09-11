import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { resolveNotificationDestination } from "@/features/notifications/destinations";
import { getMessagesBasePath } from "@/features/auth/routing";

// POST /api/notifications/<id>/destination — marks the notice read and
// returns the permission-checked place to open (plan 22.1). An unavailable
// destination answers { available: false, message } for a neutral screen.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

  const { supabase, profile } = auth;
  const { data: notification } = await supabase
    .from("notifications")
    .select("id, type, data, read_at")
    .eq("id", id.data)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!notification) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

  if (!notification.read_at) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notification.id)
      .eq("user_id", profile.id);
  }

  const destination = await resolveNotificationDestination(notification, profile.id, getMessagesBasePath(profile.role));
  return NextResponse.json({ data: destination }, { headers: { "Cache-Control": "private, no-store" } });
}
