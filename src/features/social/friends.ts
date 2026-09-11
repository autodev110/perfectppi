// Friend requests and people search (plan sections 10 and 12).
//
// Server-only, like ./relationships.ts: the transitions are service-only
// SECURITY DEFINER RPCs. This module authenticates the session, supplies the
// actor ID, checks the `friends_discovery` capability, and maps outcomes.
// Push delivery is best-effort on top of the durable in-app notice the
// database already wrote.
import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isFeatureEnabled, FEATURE_UNAVAILABLE_MESSAGE } from "@/lib/feature-flags";
import { pushToProfile } from "@/lib/push/dispatch";
import { notificationLink, pushAllowed } from "@/features/notifications/preferences";
import type { Json } from "@/types/database";

export const FRIEND_RELATIONSHIP_STATES = [
  "self",
  "blocked",
  "friends",
  "outgoing_request",
  "incoming_request",
  "none",
] as const;
export type FriendRelationshipState = (typeof FRIEND_RELATIONSHIP_STATES)[number];

export const FRIEND_REQUEST_POLICIES = ["everyone", "friends_of_friends", "nobody"] as const;
export type FriendRequestPolicy = (typeof FRIEND_REQUEST_POLICIES)[number];

export const FRIEND_ACTIONS = ["request", "accept", "decline", "cancel", "remove"] as const;
export type FriendAction = (typeof FRIEND_ACTIONS)[number];

export type FriendActionOutcome =
  | "feature_unavailable"
  | "profile_unavailable"
  | "request_unavailable"
  | "not_accepted"
  | "rate_limited"
  | "invalid";

export const FRIEND_ACTION_MESSAGES: Record<FriendActionOutcome, string> = {
  feature_unavailable: FEATURE_UNAVAILABLE_MESSAGE.friends_discovery ?? "Friend requests are not available yet.",
  profile_unavailable: "This member is not available.",
  request_unavailable: "This request is no longer open.",
  not_accepted: "This member is not accepting friend requests right now.",
  rate_limited: "You have sent a lot of requests recently. Please try again later.",
  invalid: "That request could not be understood.",
};

export type FriendMutationResult =
  | { ok: true; state: FriendRelationshipState; changed: boolean }
  | { ok: false; outcome: FriendActionOutcome; message: string };

export type PersonSummary = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type PeopleSearchResult = PersonSummary & {
  is_public: boolean;
  exact_match: boolean;
  relationship_state: FriendRelationshipState;
  mutual_friend_count: number;
};

export type FriendRequestSummary = PersonSummary & {
  direction: "incoming" | "outgoing";
  created_at: string;
};

export type FriendSummary = PersonSummary & {
  is_public: boolean;
  friends_since: string;
};

const mutationSchema = z.object({
  profileId: z.string().uuid(),
  action: z.enum(FRIEND_ACTIONS),
});

const SEARCH_MAX_QUERY = 64;
const SEARCH_PAGE_SIZE = 20;

async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username_state")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return profile?.username_state === "claimed" ? { profileId: profile.id } : null;
}

function toState(value: unknown): FriendRelationshipState {
  return (FRIEND_RELATIONSHIP_STATES as readonly string[]).includes(String(value))
    ? (value as FriendRelationshipState)
    : "none";
}

function rejected(outcome: FriendActionOutcome): FriendMutationResult {
  return { ok: false, outcome, message: FRIEND_ACTION_MESSAGES[outcome] };
}

// Maps the RPC's error contract (message + SQLSTATE) to a stable outcome.
function classifyError(error: { code?: string; message?: string }): FriendActionOutcome {
  const message = error.message ?? "";
  if (message.includes("friend_request_not_accepted")) return "not_accepted";
  if (message.includes("friend_request_rate_limited")) return "rate_limited";
  if (message.includes("request unavailable")) return "request_unavailable";
  return "profile_unavailable";
}

export async function friendsDiscoveryEnabled() {
  return isFeatureEnabled("friends_discovery");
}

/** Relationship between the signed-in member and a profile (server DTOs). */
export async function getFriendRelationshipState(targetProfileId: string): Promise<{
  state: FriendRelationshipState;
  mutualFriendCount: number;
} | null> {
  const auth = await getCurrentProfile();
  if (!auth) return null;
  const admin = createAdminClient();
  const [{ data: state }, { data: mutual }] = await Promise.all([
    admin.rpc("friend_relationship_state", { p_viewer_id: auth.profileId, p_target_id: targetProfileId }),
    admin.rpc("friend_mutual_ids", { p_first_id: auth.profileId, p_second_id: targetProfileId }),
  ]);
  return { state: toState(state), mutualFriendCount: (mutual ?? []).length };
}

export async function mutateFriendship(input: unknown): Promise<FriendMutationResult> {
  const parsed = mutationSchema.safeParse(input);
  if (!parsed.success) return rejected("invalid");
  // A kill switch stops relationship expansion, but never traps a member in
  // an existing request or friendship. Decline/cancel/remove remain available.
  if (
    (parsed.data.action === "request" || parsed.data.action === "accept")
    && !(await friendsDiscoveryEnabled())
  ) return rejected("feature_unavailable");

  const auth = await getCurrentProfile();
  if (!auth || auth.profileId === parsed.data.profileId) return rejected("profile_unavailable");

  const { profileId, action } = parsed.data;
  const admin = createAdminClient();
  const call = (() => {
    switch (action) {
      case "request":
        return admin.rpc("send_friend_request", {
          p_actor_profile_id: auth.profileId,
          p_target_profile_id: profileId,
        });
      case "accept":
        return admin.rpc("respond_friend_request", {
          p_actor_profile_id: auth.profileId,
          p_requester_profile_id: profileId,
          p_accept: true,
        });
      case "decline":
        return admin.rpc("respond_friend_request", {
          p_actor_profile_id: auth.profileId,
          p_requester_profile_id: profileId,
          p_accept: false,
        });
      case "cancel":
        return admin.rpc("cancel_friend_request", {
          p_actor_profile_id: auth.profileId,
          p_target_profile_id: profileId,
        });
      case "remove":
        return admin.rpc("remove_friend", {
          p_actor_profile_id: auth.profileId,
          p_target_profile_id: profileId,
        });
    }
  })();
  const { data, error } = await call;
  if (error) return rejected(classifyError(error));

  const result = (data ?? {}) as { state?: Json; changed?: Json };
  const state = toState(result.state);
  const changed = result.changed === true;

  if (changed && (action === "request" || action === "accept")) {
    await pushFriendNotice(profileId, auth.profileId, state === "friends" ? "accepted" : "request");
  }

  revalidatePath("/community");
  revalidatePath("/community/people");
  revalidatePath("/dashboard/friends");
  return { ok: true, state, changed };
}

// Push mirrors the in-app notice the RPC wrote. Payloads carry only the
// actor's public handle (plan 22.2).
async function pushFriendNotice(recipientId: string, actorId: string, kind: "request" | "accepted") {
  // Per-category push preference (plan 22.1); the in-app row was already
  // filtered by the database.
  if (!(await pushAllowed(recipientId, kind === "request" ? "friend_request" : "friend_request_accepted"))) return;
  const { data: actor } = await createAdminClient()
    .from("profiles")
    .select("display_name, username")
    .eq("id", actorId)
    .maybeSingle();
  const name = actor?.display_name?.trim() || (actor?.username ? `@${actor.username}` : "A member");
  const type = kind === "request" ? "friend_request" : "friend_request_accepted";
  // Tapping the push opens /notifications/<id>, which re-checks permissions.
  const { data: notice } = await createAdminClient()
    .from("notifications")
    .select("id")
    .eq("user_id", recipientId)
    .eq("type", type)
    .contains("data", { profile_id: actorId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  await pushToProfile(recipientId, {
    title: kind === "request" ? "New friend request" : "Friend request accepted",
    body: kind === "request" ? `${name} wants to be friends` : `${name} accepted your friend request`,
    data: {
      type,
      profile_id: actorId,
      ...(notice ? { notification_id: notice.id, link: notificationLink(notice.id) } : {}),
    },
  }).catch((error) => console.warn("[friends] push failed", error instanceof Error ? error.message : error));
}

export type PeopleSearchOutcome = "ok" | "rate_limited" | "unavailable";

export async function searchPeople(query: string, page = 1): Promise<{
  results: PeopleSearchResult[];
  hasMore: boolean;
  outcome: PeopleSearchOutcome;
  retryAfter: number | null;
}> {
  const trimmed = query.trim().slice(0, SEARCH_MAX_QUERY);
  const empty = { results: [], hasMore: false, outcome: "ok" as const, retryAfter: null };
  if (trimmed.replace(/^@/, "").length < 2) return empty;
  if (!(await friendsDiscoveryEnabled())) return empty;
  const auth = await getCurrentProfile();
  if (!auth) return empty;

  // Centralized here rather than only in the route: the web server component
  // and the mobile API must consume the same enumeration budget.
  const windowMs = 60_000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const admin = createAdminClient();
  const { data: searchCount, error: limitError } = await admin.rpc("partner_rate_limit_hit", {
    p_bucket_key: `people-search:${auth.profileId}`,
    p_window_start: windowStart.toISOString(),
  });
  if (limitError) {
    console.error("people search rate limit check failed", limitError.message);
    return { ...empty, outcome: "unavailable" };
  }
  if ((searchCount ?? 0) > 40) {
    return {
      ...empty,
      outcome: "rate_limited",
      retryAfter: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000)),
    };
  }

  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const { data, error } = await admin.rpc("search_profiles", {
    p_viewer_profile_id: auth.profileId,
    p_query: trimmed,
    p_limit: SEARCH_PAGE_SIZE + 1,
    p_offset: (safePage - 1) * SEARCH_PAGE_SIZE,
  });
  if (error) {
    console.error("searchPeople failed", error.message);
    return { ...empty, outcome: "unavailable" };
  }
  const rows = data ?? [];
  return {
    results: rows.slice(0, SEARCH_PAGE_SIZE).map((row) => ({
      id: row.profile_id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      is_public: row.is_public,
      exact_match: row.exact_match,
      relationship_state: toState(row.relationship_state),
      mutual_friend_count: row.mutual_friend_count,
    })),
    hasMore: rows.length > SEARCH_PAGE_SIZE,
    outcome: "ok",
    retryAfter: null,
  };
}

export async function getMyFriendRequests(): Promise<{ incoming: FriendRequestSummary[]; outgoing: FriendRequestSummary[] }> {
  const auth = await getCurrentProfile();
  if (!auth) return { incoming: [], outgoing: [] };
  const { data } = await createAdminClient().rpc("list_friend_requests", {
    p_actor_profile_id: auth.profileId,
  });
  const rows = (data ?? []).map((row) => ({
    id: row.profile_id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    direction: row.direction === "incoming" ? "incoming" as const : "outgoing" as const,
    created_at: row.created_at,
  }));
  return {
    incoming: rows.filter((row) => row.direction === "incoming"),
    outgoing: rows.filter((row) => row.direction === "outgoing"),
  };
}

export async function getMyFriends(): Promise<FriendSummary[]> {
  const auth = await getCurrentProfile();
  if (!auth) return [];
  const { data } = await createAdminClient().rpc("list_my_friends", {
    p_actor_profile_id: auth.profileId,
  });
  return (data ?? []).map((row) => ({
    id: row.profile_id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    is_public: row.is_public,
    friends_since: row.friends_since,
  }));
}

export async function getPendingFriendRequestCount(): Promise<number> {
  const auth = await getCurrentProfile();
  if (!auth) return 0;
  const { data } = await createAdminClient().rpc("list_friend_requests", {
    p_actor_profile_id: auth.profileId,
  });
  return (data ?? []).filter((row) => row.direction === "incoming").length;
}
