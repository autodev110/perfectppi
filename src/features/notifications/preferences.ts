import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationCategory,
} from "@/lib/notifications/routing";
import type { Database } from "@/types/database";

type NotificationType = Database["public"]["Enums"]["notification_type"];

export type NotificationPreference = {
  category: NotificationCategory;
  label: string;
  description: string;
  in_app: boolean;
  push: boolean;
  locked: boolean;
};

const updateSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORIES),
  inApp: z.boolean(),
  push: z.boolean(),
});

export async function getNotificationPreferences(profileId: string): Promise<NotificationPreference[]> {
  const { data, error } = await createAdminClient().rpc("list_notification_preferences", {
    p_actor_profile_id: profileId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    const category = row.category as NotificationCategory;
    const meta = NOTIFICATION_CATEGORY_LABELS[category];
    return meta ? [{ category, label: meta.label, description: meta.description, in_app: row.in_app, push: row.push, locked: row.locked }] : [];
  });
}

export async function setNotificationPreference(profileId: string, input: unknown) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid preference" as const };
  if (NOTIFICATION_CATEGORY_LABELS[parsed.data.category].locked) {
    return { error: "This category is always delivered" as const };
  }
  const { error } = await createAdminClient().rpc("set_notification_preference", {
    p_actor_profile_id: profileId,
    p_category: parsed.data.category,
    p_in_app: parsed.data.inApp,
    p_push: parsed.data.push,
  });
  if (error) return { error: "The preference could not be saved" as const };
  return { data: parsed.data };
}

/** Universal link a push carries so a tap resolves through /notifications/<id>. */
export function notificationLink(notificationId: string) {
  return `${CANONICAL_ORIGIN}/notifications/${notificationId}`;
}

/** Whether a push for this type should be sent to the member (plan 22.1). */
export async function pushAllowed(profileId: string, type: NotificationType): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("notification_allowed", {
    p_profile_id: profileId,
    p_type: type,
    p_channel: "push",
  });
  if (error) {
    console.warn("notification_allowed failed", error.message);
    return true;
  }
  return data !== false;
}
