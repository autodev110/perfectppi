import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEATURE_UNAVAILABLE_MESSAGE, getFeatureFlags } from "@/lib/feature-flags";
import { createCommunityCommentFromInput, createCommunityPostFromInput } from "@/features/community/actions";
import { getCommunityPostsForViewer, getCommunityViewerId, type CommunityFeedPost } from "@/features/community/queries";
import {
  COMMUNITY_EVENT_TYPES,
  buildEventAnnouncement,
  eventSafetyRule,
  type CommunityEventType,
} from "@/features/social/events-policy";

export type CommunityEventStatus = "scheduled" | "cancelled" | "completed" | "removed";
export type CommunityEventRsvpStatus = "going" | "interested" | "not_going";

type EventProfile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
type EventGroup = { id: string; slug: string; name: string };

export type CommunityEventSummary = {
  id: string;
  announcement_post_id: string;
  group_id: string | null;
  event_type: CommunityEventType;
  title: string;
  starts_at: string;
  ends_at: string;
  general_location: string;
  exact_location: string | null;
  capacity: number | null;
  requirements: string | null;
  status: CommunityEventStatus;
  cancellation_reason: string | null;
  organizer: EventProfile;
  group: EventGroup | null;
  going_count: number;
  interested_count: number;
  viewer_rsvp: CommunityEventRsvpStatus | null;
  is_organizer: boolean;
};

export type CommunityEventDetail = CommunityEventSummary & {
  announcement: CommunityFeedPost;
  official_update_comment_ids: string[];
};

export const createEventSchema = z.object({
  clientRequestId: z.string().uuid(),
  title: z.string().trim().min(3, "Add an event title").max(120),
  description: z.string().trim().min(10, "Add a short event description").max(500),
  eventType: z.enum(COMMUNITY_EVENT_TYPES),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  generalLocation: z.string().trim().min(2, "Add a general area").max(120),
  exactLocation: z.string().trim().min(2, "Add attendee instructions").max(500),
  capacity: z.number().int().min(2).max(1000).nullable().optional(),
  requirements: z.string().trim().max(300).nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
}).superRefine((value, ctx) => {
  const starts = new Date(value.startsAt);
  const ends = new Date(value.endsAt);
  if (ends <= starts) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "The end time must be after the start time" });
  }
  if (ends.getTime() - starts.getTime() > 7 * 24 * 60 * 60 * 1000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Events can last up to seven days" });
  }
});

type EventMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; retryAfterSeconds?: number };

const eventSelect = `
  id, organizer_id, announcement_post_id, group_id, event_type, title,
  starts_at, ends_at, general_location, capacity, requirements, status,
  cancellation_reason,
  organizer:profiles!community_events_organizer_id_fkey(id, username, display_name, avatar_url),
  group:community_groups!community_events_group_id_fkey(id, slug, name)
`;

async function eventFlagsAllow(groupId?: string | null) {
  const flags = await getFeatureFlags();
  return flags.flags.events && (!groupId || flags.flags.groups);
}

function classifyEventError(error: { code?: string; message?: string }): EventMutationResult<never> {
  const raw = error.message ?? "";
  if (raw.includes("event_creation_rate_limited")) {
    return { ok: false, code: "rate_limited", message: "You can create up to three events per day and organize ten upcoming events." };
  }
  if (raw.includes("event_creation_restricted") || error.code === "42501") {
    return { ok: false, code: "restricted", message: "Event creation is unavailable for this account." };
  }
  if (raw.includes("event_invalid_schedule")) {
    return { ok: false, code: "invalid_schedule", message: "Choose a start at least 30 minutes away and an end within seven days." };
  }
  if (raw.includes("event_at_capacity")) {
    return { ok: false, code: "at_capacity", message: "This event is at capacity. You can still mark Interested." };
  }
  if (raw.includes("event_organizer_is_going")) {
    return { ok: false, code: "organizer_required", message: "The organizer stays marked Going while the event is scheduled." };
  }
  if (raw.includes("event_group_unavailable")) {
    return { ok: false, code: "group_unavailable", message: "You can only organize an event in a group where you can post." };
  }
  console.warn("community event operation failed", { code: error.code, message: raw.slice(0, 300) });
  return { ok: false, code: "failed", message: "The event could not be updated. Please try again." };
}

async function hydrateEvents(viewerId: string, eventIds: string[]): Promise<CommunityEventSummary[]> {
  if (eventIds.length === 0) return [];
  const admin = createAdminClient();
  const [{ data: rows, error }, { data: summaries, error: summaryError }] = await Promise.all([
    admin.from("community_events").select(eventSelect).in("id", eventIds),
    admin.rpc("community_event_rsvp_summaries", { p_viewer_id: viewerId, p_event_ids: eventIds }),
  ]);
  if (error || summaryError) {
    console.error("community event hydration failed", error?.message ?? summaryError?.message);
    return [];
  }
  const summaryByEvent = new Map((summaries ?? []).map((summary) => [summary.event_id, summary]));
  const byId = new Map(eventIds.map((id, index) => [id, index]));
  return (rows ?? []).map((row) => {
    const rsvp = summaryByEvent.get(row.id);
    const organizer = row.organizer as unknown as EventProfile;
    const group = row.group as unknown as EventGroup | null;
    return {
      id: row.id,
      announcement_post_id: row.announcement_post_id,
      group_id: row.group_id,
      event_type: row.event_type,
      title: row.title,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      general_location: row.general_location,
      exact_location: null,
      capacity: row.capacity,
      requirements: row.requirements,
      status: row.status,
      cancellation_reason: row.cancellation_reason,
      organizer,
      group,
      going_count: rsvp?.going_count ?? 0,
      interested_count: rsvp?.interested_count ?? 0,
      viewer_rsvp: rsvp?.viewer_status ?? null,
      is_organizer: row.organizer_id === viewerId,
    };
  }).sort((a, b) => (byId.get(a.id) ?? 0) - (byId.get(b.id) ?? 0));
}

export async function eventsEnabled() {
  return (await getFeatureFlags()).flags.events;
}

export async function getCommunityEvents(options?: { groupId?: string | null; includePast?: boolean }) {
  if (!(await eventFlagsAllow(options?.groupId))) return [];
  const viewerId = await getCommunityViewerId();
  if (!viewerId) return [];
  const { data, error } = await createAdminClient().rpc("list_visible_community_event_ids", {
    p_viewer_id: viewerId,
    p_group_id: options?.groupId ?? null,
    p_include_past: options?.includePast ?? false,
  });
  if (error) {
    console.error("community event directory failed", error.message);
    return [];
  }
  return hydrateEvents(viewerId, (data ?? []).map((row) => row.event_id));
}

export async function searchCommunityEvents(query: string, page = 1, perPage = 20) {
  if (!(await eventsEnabled())) return { events: [], hasMore: false };
  const viewerId = await getCommunityViewerId();
  if (!viewerId) return { events: [], hasMore: false };
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const { data, error } = await createAdminClient().rpc("search_community_events", {
    p_viewer_id: viewerId,
    p_query: query.trim().slice(0, 100),
    p_limit: perPage + 1,
    p_offset: (safePage - 1) * perPage,
  });
  if (error) {
    console.error("search_community_events failed", error.message);
    return { events: [], hasMore: false };
  }
  const ids = (data ?? []).map((row) => row.event_id);
  return { events: await hydrateEvents(viewerId, ids.slice(0, perPage)), hasMore: ids.length > perPage };
}

export async function getCommunityEvent(id: string): Promise<CommunityEventDetail | null> {
  if (!(await eventsEnabled())) return null;
  const viewerId = await getCommunityViewerId();
  if (!viewerId) return null;
  const { data: canView } = await createAdminClient().rpc("social_can_view_community_event", {
    p_viewer_id: viewerId,
    p_event_id: id,
    p_include_cancelled: true,
  });
  if (!canView) return null;
  const [summary] = await hydrateEvents(viewerId, [id]);
  if (!summary) return null;
  if (!(await eventFlagsAllow(summary.group_id))) return null;
  const [posts, exactResult, updatesResult] = await Promise.all([
    getCommunityPostsForViewer(viewerId, [summary.announcement_post_id]),
    createAdminClient().rpc("community_event_exact_location", { p_viewer_id: viewerId, p_event_id: id }),
    createAdminClient().from("community_event_updates").select("comment_id").eq("event_id", id),
  ]);
  const announcement = posts[0];
  if (!announcement) return null;
  return {
    ...summary,
    exact_location: exactResult.data ?? null,
    announcement,
    official_update_comment_ids: (updatesResult.data ?? []).map((row) => row.comment_id),
  };
}

export async function createCommunityEvent(input: unknown): Promise<EventMutationResult<{ id: string; announcementPostId: string; moderationStatus: string }>> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.errors[0]?.message ?? "Check the event details." };
  if (!(await eventFlagsAllow(parsed.data.groupId))) {
    return { ok: false, code: "feature_unavailable", message: FEATURE_UNAVAILABLE_MESSAGE.events ?? "Events are unavailable." };
  }
  const actorId = await getCommunityViewerId();
  if (!actorId) return { ok: false, code: "forbidden", message: "Sign in to create an event." };

  const { data: existing } = await createAdminClient()
    .from("community_events")
    .select("id, announcement_post_id")
    .eq("organizer_id", actorId)
    .eq("client_request_id", parsed.data.clientRequestId)
    .maybeSingle();
  if (existing) {
    const { data: announcementPost } = await createAdminClient()
      .from("community_posts")
      .select("moderation_status")
      .eq("id", existing.announcement_post_id)
      .maybeSingle();
    return { ok: true, data: {
      id: existing.id,
      announcementPostId: existing.announcement_post_id,
      moderationStatus: announcementPost?.moderation_status ?? "pending_review",
    } };
  }

  const safetyText = [parsed.data.title, parsed.data.description, parsed.data.requirements ?? ""].join("\n");
  if (eventSafetyRule(safetyText)) {
    return { ok: false, code: "content_not_allowed", message: "Events cannot coordinate unsafe racing or illegal driving." };
  }
  const startsAt = new Date(parsed.data.startsAt);
  const announcement = buildEventAnnouncement({
    title: parsed.data.title,
    description: parsed.data.description,
    eventType: parsed.data.eventType,
    startsAt,
    generalLocation: parsed.data.generalLocation,
    requirements: parsed.data.requirements,
  });
  const post = await createCommunityPostFromInput({
    content: announcement,
    postType: "general",
    audience: "public",
    groupId: parsed.data.groupId ?? null,
    expectedMediaCount: 0,
  });
  if (post.error !== undefined) {
    return { ok: false, code: post.code ?? "announcement_failed", message: post.error, retryAfterSeconds: post.retryAfterSeconds };
  }

  const { data, error } = await createAdminClient().rpc("create_community_event", {
    p_actor_profile_id: actorId,
    p_announcement_post_id: post.data.id,
    p_client_request_id: parsed.data.clientRequestId,
    p_group_id: parsed.data.groupId ?? null,
    p_event_type: parsed.data.eventType,
    p_title: parsed.data.title,
    p_starts_at: parsed.data.startsAt,
    p_ends_at: parsed.data.endsAt,
    p_general_location: parsed.data.generalLocation,
    p_exact_location: parsed.data.exactLocation,
    p_capacity: parsed.data.capacity ?? null,
    p_requirements: parsed.data.requirements || null,
  });
  if (error || !data) {
    await createAdminClient().from("community_posts").update({ status: "archived" }).eq("id", post.data.id).eq("author_id", actorId);
    return classifyEventError(error ?? { message: "event create returned no row" });
  }
  let moderationStatus: string = post.data.moderationStatus;
  if (data.announcement_post_id !== post.data.id) {
    // A concurrent retry won the idempotency lock. Remove this request's
    // announcement and return the canonical event instead of leaking an orphan.
    await createAdminClient().from("community_posts").update({ status: "archived" }).eq("id", post.data.id).eq("author_id", actorId);
    const { data: canonicalPost } = await createAdminClient()
      .from("community_posts")
      .select("moderation_status")
      .eq("id", data.announcement_post_id)
      .maybeSingle();
    moderationStatus = canonicalPost?.moderation_status ?? "pending_review";
  }
  revalidatePath("/community");
  revalidatePath("/community/events");
  if (parsed.data.groupId) revalidatePath("/community/groups");
  return { ok: true, data: { id: data.id, announcementPostId: data.announcement_post_id, moderationStatus } };
}

export async function setCommunityEventRsvp(input: unknown): Promise<EventMutationResult<{ eventId: string; status: CommunityEventRsvpStatus; goingCount: number; interestedCount: number; exactLocation: string | null }>> {
  const parsed = z.object({ eventId: z.string().uuid(), status: z.enum(["going", "interested", "not_going"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: "Choose a valid RSVP response." };
  if (!(await eventsEnabled())) return { ok: false, code: "feature_unavailable", message: FEATURE_UNAVAILABLE_MESSAGE.events ?? "Events are unavailable." };
  const actorId = await getCommunityViewerId();
  if (!actorId) return { ok: false, code: "forbidden", message: "Sign in to RSVP." };
  const { data, error } = await createAdminClient().rpc("set_community_event_rsvp", {
    p_actor_profile_id: actorId,
    p_event_id: parsed.data.eventId,
    p_status: parsed.data.status,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return classifyEventError(error ?? { message: "invalid RSVP response" });
  revalidatePath(`/community/events/${parsed.data.eventId}`);
  revalidatePath("/community/events");
  return { ok: true, data: data as { eventId: string; status: CommunityEventRsvpStatus; goingCount: number; interestedCount: number; exactLocation: string | null } };
}

export async function cancelCommunityEvent(input: unknown): Promise<EventMutationResult<{ cancelled: boolean }>> {
  const parsed = z.object({ eventId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: "Add a short cancellation reason." };
  const actorId = await getCommunityViewerId();
  if (!actorId) return { ok: false, code: "forbidden", message: "Sign in to manage this event." };
  const { data, error } = await createAdminClient().rpc("cancel_community_event", {
    p_actor_profile_id: actorId,
    p_event_id: parsed.data.eventId,
    p_reason: parsed.data.reason,
  });
  if (error) return classifyEventError(error);
  revalidatePath(`/community/events/${parsed.data.eventId}`);
  revalidatePath("/community/events");
  return { ok: true, data: { cancelled: data === true } };
}

export async function addCommunityEventUpdate(input: unknown): Promise<EventMutationResult<{ id: string; commentId: string; moderationStatus: string }>> {
  const parsed = z.object({ eventId: z.string().uuid(), content: z.string().trim().min(1).max(600) }).safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: "Add an update of up to 600 characters." };
  const actorId = await getCommunityViewerId();
  if (!actorId) return { ok: false, code: "forbidden", message: "Sign in to update this event." };
  const { data: event } = await createAdminClient().from("community_events").select("announcement_post_id, organizer_id").eq("id", parsed.data.eventId).maybeSingle();
  if (!event || event.organizer_id !== actorId) return { ok: false, code: "not_found", message: "This event is unavailable." };
  if (eventSafetyRule(parsed.data.content)) {
    return { ok: false, code: "content_not_allowed", message: "Event updates cannot coordinate unsafe racing or illegal driving." };
  }
  const comment = await createCommunityCommentFromInput({ postId: event.announcement_post_id, content: parsed.data.content });
  if (comment.error !== undefined) return { ok: false, code: comment.code ?? "update_failed", message: comment.error, retryAfterSeconds: comment.retryAfterSeconds };
  const { data, error } = await createAdminClient().rpc("add_community_event_update", {
    p_actor_profile_id: actorId,
    p_event_id: parsed.data.eventId,
    p_comment_id: comment.data.id,
  });
  if (error || !data) {
    await createAdminClient().from("community_comments").update({ status: "archived" }).eq("id", comment.data.id).eq("author_id", actorId);
    return classifyEventError(error ?? { message: "event update returned no id" });
  }
  revalidatePath(`/community/events/${parsed.data.eventId}`);
  return { ok: true, data: { id: data, commentId: comment.data.id, moderationStatus: comment.data.moderationStatus } };
}
