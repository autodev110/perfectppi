// Permission-checked notification deep links (plan 22.1). The intent comes
// from the stored type/data; every destination is re-checked against the
// current visibility rules before a client is sent there, so a post that was
// hidden, a member who blocked the viewer, or a conversation the viewer left
// resolves to "unavailable" rather than stale content.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getFeatureFlags } from "@/lib/feature-flags";
import {
  notificationDestinationIntent,
  notificationWebPath,
  type NotificationDestinationIntent,
} from "@/lib/notifications/routing";
import type { Database } from "@/types/database";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export type ResolvedNotificationDestination = NotificationDestinationIntent & {
  available: boolean;
  /** Neutral explanation for the unavailable screen; never says why. */
  message: string | null;
  webPath: string | null;
};

const UNAVAILABLE = "This content is no longer available.";

async function intentAvailable(intent: NotificationDestinationIntent, viewerId: string): Promise<boolean> {
  const admin = createAdminClient();
  switch (intent.kind) {
    case "post": {
      if (!intent.id) return false;
      const { data } = await admin.rpc("social_can_view_community_post", {
        p_viewer_id: viewerId,
        p_post_id: intent.id,
        p_include_muted: true,
      });
      if (!data) return false;
      const { data: post } = await admin.from("community_posts").select("group_id").eq("id", intent.id).maybeSingle();
      if (post?.group_id && !(await getFeatureFlags()).flags.groups) return false;
      return true;
    }
    case "group": {
      if (!intent.id) return false;
      if (!(await getFeatureFlags()).flags.groups) return false;
      const { data } = await admin
        .from("community_groups")
        .select("id")
        .eq("slug", intent.id.toLowerCase())
        .maybeSingle();
      if (!data) return false;
      // Shell visibility: public and private groups, unlisted only for
      // members, invitees, and requesters (plan 13.3).
      const { data: visible } = await admin.rpc("community_group_shell_visible", {
        p_viewer_id: viewerId,
        p_group_id: data.id,
      });
      return visible === true;
    }
    case "profile": {
      if (!intent.id) return false;
      const { data: target } = await admin
        .from("profiles")
        .select("id, allow_exact_username_lookup")
        .eq("username_normalized", intent.id.toLowerCase())
        .eq("username_state", "claimed")
        .maybeSingle();
      if (!target) return false;
      if (target.id !== viewerId && !target.allow_exact_username_lookup) return false;
      const { data: canView } = await admin.rpc("social_can_view_profile", {
        p_viewer_id: viewerId,
        p_profile_id: target.id,
      });
      return Boolean(canView);
    }
    case "conversation": {
      if (!intent.id) return false;
      const { data } = await admin
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", intent.id)
        .eq("profile_id", viewerId)
        .maybeSingle();
      return Boolean(data);
    }
    case "inspection_request": {
      if (!intent.id) return false;
      const { data } = await admin
        .from("ppi_requests")
        .select("id, requester_id, assigned_tech_id")
        .eq("id", intent.id)
        .maybeSingle();
      return Boolean(data && (data.requester_id === viewerId || data.assigned_tech_id === viewerId));
    }
    case "listing_vehicle": {
      if (!intent.id) return false;
      const { data } = await admin
        .from("vehicles")
        .select("id, owner_id, visibility")
        .eq("id", intent.id)
        .maybeSingle();
      return Boolean(data && (data.owner_id === viewerId || data.visibility === "public"));
    }
    case "marketplace_search": {
      if (!intent.id) return true;
      const { data } = await admin
        .from("marketplace_saved_searches")
        .select("id")
        .eq("id", intent.id)
        .eq("profile_id", viewerId)
        .maybeSingle();
      return Boolean(data);
    }
    case "vehicle_build": {
      if (!intent.id) return false;
      const { data: canView } = await admin.rpc("social_can_view_vehicle", {
        p_viewer_id: viewerId,
        p_vehicle_id: intent.id,
      });
      if (!canView) return false;
      if (!intent.secondaryId) return true;
      const { data } = await admin.from("vehicle_build_entries")
        .select("id")
        .eq("id", intent.secondaryId)
        .eq("vehicle_id", intent.id)
        .eq("is_public", true)
        .maybeSingle();
      return !!data;
    }
    case "moderation_case": {
      const { data } = await admin.rpc("moderation_has_capability", {
        p_profile_id: viewerId,
        p_capability: "queue_read",
      });
      return Boolean(data);
    }
    case "friends":
    case "my_posts":
    case "organization":
      return true;
    case "none":
      return false;
  }
}

export async function resolveNotificationDestination(
  notification: Pick<NotificationRow, "type" | "data">,
  viewerId: string,
  messagesBase = "/dashboard/messages",
): Promise<ResolvedNotificationDestination> {
  const intent = notificationDestinationIntent(
    notification.type,
    notification.data && typeof notification.data === "object" && !Array.isArray(notification.data)
      ? (notification.data as Record<string, unknown>)
      : null,
  );
  if (intent.kind === "none") {
    return { ...intent, available: false, message: null, webPath: null };
  }
  const available = await intentAvailable(intent, viewerId);
  return {
    ...intent,
    available,
    message: available ? null : UNAVAILABLE,
    webPath: available ? notificationWebPath(intent, messagesBase) : null,
  };
}
