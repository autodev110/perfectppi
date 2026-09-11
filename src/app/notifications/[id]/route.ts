import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { resolveNotificationDestination } from "@/features/notifications/destinations";
import { getMessagesBasePath } from "@/features/auth/routing";

// /notifications/<id>: the web deep link behind every bell item. Marks the
// notice read and redirects to the permission-checked destination, or to a
// neutral unavailable page (plan 22.1).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return NextResponse.redirect(new URL("/login", request.url));

  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.redirect(new URL("/notifications/unavailable", request.url));

  const { supabase, profile } = auth;
  const { data: notification } = await supabase
    .from("notifications")
    .select("id, type, data, read_at")
    .eq("id", id.data)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!notification) return NextResponse.redirect(new URL("/notifications/unavailable", request.url));

  if (!notification.read_at) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notification.id)
      .eq("user_id", profile.id);
  }

  const destination = await resolveNotificationDestination(notification, profile.id, getMessagesBasePath(profile.role));
  const target = destination.available && destination.webPath ? destination.webPath : "/notifications/unavailable";
  return NextResponse.redirect(new URL(target, request.url));
}
