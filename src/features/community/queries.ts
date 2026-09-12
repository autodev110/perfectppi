import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import {
  getFilteredCommunityPostIds,
  getBlockedProfileIds,
  getVisibleCommunityGroupPostIds,
  getVisibleCommunityPostIds,
} from "@/features/social/relationships";
import type { CommunityFeedFilter } from "@/features/social/relationships";
import { createReportContext } from "@/features/moderation/report-context";
import { communityMediaDeliveryPath } from "@/lib/storage/community-media";
import { buildSafetyNotice, type SafetyNotice } from "@/lib/moderation/safety-notice";
import { getFeatureFlags } from "@/lib/feature-flags";

type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "display_name" | "username" | "avatar_url" | "is_public"
>;

type VehicleMedia = Database["public"]["Tables"]["vehicle_media"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"] & {
  vehicle_media: VehicleMedia[];
};
type Listing = Database["public"]["Tables"]["marketplace_listings"]["Row"];
type CommunityPostRow = Database["public"]["Tables"]["community_posts"]["Row"];
type CommunityPostMediaRow = Database["public"]["Tables"]["community_post_media"]["Row"];
type CommunityCommentRow = Database["public"]["Tables"]["community_comments"]["Row"];
type CommunityMentionRow = Database["public"]["Tables"]["community_mentions"]["Row"];
type CommunityGroupRow = Database["public"]["Tables"]["community_groups"]["Row"];

type CommunityFeedProfile = Pick<Profile, "id" | "display_name" | "username" | "avatar_url">;
export type CommunityMention = Pick<
  CommunityMentionRow,
  "id" | "mentioned_profile_id" | "rendered_username"
> & { profile: Pick<Profile, "id" | "username"> | null };
type CommunityFeedVehicleMedia = Pick<
  VehicleMedia,
  "id" | "vehicle_id" | "url" | "media_type" | "is_primary" | "sort_order" | "uploaded_at"
>;
type CommunityFeedVehicle = Pick<
  Database["public"]["Tables"]["vehicles"]["Row"],
  "id" | "year" | "make" | "model" | "trim" | "mileage" | "visibility"
> & { vehicle_media: CommunityFeedVehicleMedia[] };
type CommunityFeedListing = Pick<
  Listing,
  "id" | "vehicle_id" | "seller_id" | "title" | "asking_price_cents" | "location" | "status" | "created_at" | "updated_at"
>;
type CommunityFeedMedia = Pick<
  CommunityPostMediaRow,
  "id" | "post_id" | "url" | "media_type" | "content_type" | "sort_order" | "created_at"
>;
type CommunityFeedComment = Pick<
  CommunityCommentRow,
  "id" | "post_id" | "author_id" | "content" | "status" | "created_at" | "updated_at"
> & {
  author: CommunityFeedProfile | null;
  report_context: string | null;
  helpful_count: number;
  helpful_by_viewer: boolean;
  can_mark_helpful: boolean;
};
type CommunityFeedCommentWithMentions = CommunityFeedComment & { mentions: CommunityMention[] };
type CommunityFeedGroup = Pick<CommunityGroupRow, "id" | "slug" | "name" | "avatar_url">;

/** Poll state for the viewer (plan 14.2): counts only after voting or close. */
export type CommunityPollView = {
  closes_at: string;
  closed: boolean;
  total_votes: number;
  viewer_option_key: string | null;
  options: Array<{ key: string; label: string; votes: number | null }>;
};

/** Redacted inspection card for Inspection Discussion posts: never findings. */
export type CommunityInspectionSummary = {
  id: string;
  ppi_type: string;
  inspection_scope: string;
  status: string;
  completed_at: string | null;
};

export type CommunityFeedPost = Pick<
  CommunityPostRow,
  "id" | "author_id" | "vehicle_id" | "marketplace_listing_id" | "group_id" | "content" | "audience" | "post_type" | "accepted_answer_comment_id" | "question_outcome" | "question_outcome_updated_at" | "status" | "created_at" | "updated_at"
> & {
  /** Structured fields for the post type (plan 14.2). */
  details: Record<string, unknown>;
  poll: CommunityPollView | null;
  inspection: CommunityInspectionSummary | null;
  author: CommunityFeedProfile | null;
  vehicle: CommunityFeedVehicle | null;
  marketplace_listing: CommunityFeedListing | null;
  media: CommunityFeedMedia[];
  comments: CommunityFeedCommentWithMentions[];
  mentions: CommunityMention[];
  group: CommunityFeedGroup | null;
  /** Plan 13.5: pinned by a group moderator; rendered ahead of the timeline. */
  group_pinned: boolean;
  /** Viewer is owner or moderator of the post's group (plan 13.4 tools). */
  can_moderate_group: boolean;
  can_interact: boolean;
  can_like: boolean;
  can_manage_accepted_answer: boolean;
  like_count: number;
  liked_by_viewer: boolean;
  /** Private bookmark (plan Phase 1B); never shown to other members. */
  saved_by_viewer: boolean;
  report_context: string | null;
  /** Plan 15.5: present when the post involves a high-consequence repair topic. */
  safety_notice: SafetyNotice | null;
};

export type CommunityComment = CommunityCommentRow & {
  author: Profile | null;
  mentions: CommunityMention[];
};

export type CommunityPost = CommunityPostRow & {
  author: Profile | null;
  vehicle: Vehicle | null;
  marketplace_listing: Listing | null;
  media: CommunityPostMediaRow[];
  comments: CommunityComment[];
  mentions: CommunityMention[];
  group: CommunityGroupRow | null;
};

export type CommunityPostOptionVehicle = Pick<
  Database["public"]["Tables"]["vehicles"]["Row"],
  "id" | "year" | "make" | "model" | "trim" | "vin"
>;

export type CommunityPostOptionListing = Pick<
  Database["public"]["Tables"]["marketplace_listings"]["Row"],
  "id" | "title" | "vehicle_id" | "asking_price_cents"
> & {
  vehicle: CommunityPostOptionVehicle | null;
};

export type CommunityPostOptionGroup = Pick<CommunityGroupRow, "id" | "slug" | "name" | "avatar_url">;

/** The author's own submitted/completed inspections, for Inspection Discussion posts. */
export type CommunityPostOptionInspection = {
  id: string;
  vehicle_id: string;
  ppi_type: string;
  inspection_scope: string;
  status: string;
  updated_at: string;
};

const COMMUNITY_POST_SELECT = `
  *,
  author:profiles!community_posts_author_id_fkey(id, display_name, username, avatar_url, is_public),
  vehicle:vehicles!community_posts_vehicle_id_fkey(*, vehicle_media(*)),
  marketplace_listing:marketplace_listings!community_posts_marketplace_listing_id_fkey(*),
  group:community_groups!community_posts_group_id_fkey(*),
  mentions:community_mentions!community_mentions_post_id_fkey(
    id, mentioned_profile_id, rendered_username,
    profile:profiles!community_mentions_mentioned_profile_id_fkey(id, username)
  ),
  media:community_post_media!community_post_media_post_id_fkey(*),
  comments:community_comments!community_comments_post_id_fkey(
    *,
    author:profiles!community_comments_author_id_fkey(id, display_name, username, avatar_url, is_public),
    mentions:community_mentions!community_mentions_comment_id_fkey(
      id, mentioned_profile_id, rendered_username,
      profile:profiles!community_mentions_mentioned_profile_id_fkey(id, username)
    )
  )
`;

// Ordinary clients receive a deliberately small projection. Moderation fields
// are selected only where the server needs them to filter nested rows, then
// removed before serialization.
const COMMUNITY_FEED_SELECT = `
  id, author_id, vehicle_id, marketplace_listing_id, group_id, group_status, group_pinned_at, active_revision_id, content, audience, post_type, details, accepted_answer_comment_id, question_outcome, question_outcome_updated_at, status, created_at, updated_at,
  author:profiles!community_posts_author_id_fkey(id, display_name, username, avatar_url, is_public),
  vehicle:vehicles!community_posts_vehicle_id_fkey(
    id, year, make, model, trim, mileage, visibility,
    vehicle_media(id, vehicle_id, url, media_type, is_primary, sort_order, uploaded_at, moderation_status)
  ),
  marketplace_listing:marketplace_listings!community_posts_marketplace_listing_id_fkey(
    id, vehicle_id, seller_id, title, asking_price_cents, location, status, created_at, updated_at
  ),
  group:community_groups!community_posts_group_id_fkey(id, slug, name, avatar_url),
  mentions:community_mentions!community_mentions_post_id_fkey(
    id, mentioned_profile_id, rendered_username,
    profile:profiles!community_mentions_mentioned_profile_id_fkey(id, username)
  ),
  media:community_post_media!community_post_media_post_id_fkey(
    id, post_id, url, media_type, content_type, sort_order, created_at, moderation_status
  ),
  comments:community_comments!community_comments_post_id_fkey(
    id, post_id, author_id, active_revision_id, content, status, created_at, updated_at, moderation_status,
    author:profiles!community_comments_author_id_fkey(id, display_name, username, avatar_url, is_public),
    mentions:community_mentions!community_mentions_comment_id_fkey(
      id, mentioned_profile_id, rendered_username,
      profile:profiles!community_mentions_mentioned_profile_id_fkey(id, username)
    )
  )
`;

function getProfileIdFromAuthUserId(authUserId: string) {
  const admin = createAdminClient();
  return admin
    .from("profiles")
    .select("id, is_public, default_post_audience")
    .eq("auth_user_id", authUserId)
    .single();
}

// Clients never receive a storage reference or object URL for Community
// media (plan 19.2): `url` becomes the status-aware delivery path.
function withDeliveryPath<T extends { id: string; url: string }>(media: T): T {
  return { ...media, url: communityMediaDeliveryPath(media.id) };
}

function cleanPosts(posts: CommunityPost[], includeModerated = false) {
  return posts.map((post) => ({
    ...post,
    vehicle: post.vehicle ? {
      ...post.vehicle,
      vehicle_media: (post.vehicle.vehicle_media ?? []).filter((media) => media.moderation_status === "active"),
    } : null,
    media: [...(post.media ?? [])]
      .filter((media) => includeModerated || media.moderation_status === "active")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(withDeliveryPath),
    comments: (post.comments ?? []).filter((comment) =>
      comment.status === "active" && comment.moderation_status === "active"
    ),
  }));
}

type GroupRole = Database["public"]["Enums"]["community_group_role"];

function toCommunityFeedPost(
  post: CommunityPost,
  viewerId: string,
  memberGroupIds: ReadonlyMap<string, GroupRole> = new Map(),
): CommunityFeedPost {
  const visibleComments = (post.comments ?? [])
    .filter((comment) => comment.status === "active" && comment.moderation_status === "active");
  const acceptedAnswerCommentId = visibleComments.some(
    (comment) => comment.id === post.accepted_answer_comment_id,
  ) ? post.accepted_answer_comment_id : null;
  const vehicle = post.vehicle?.visibility === "public"
    ? {
        id: post.vehicle.id,
        year: post.vehicle.year,
        make: post.vehicle.make,
        model: post.vehicle.model,
        trim: post.vehicle.trim,
        mileage: post.vehicle.mileage,
        visibility: post.vehicle.visibility,
        vehicle_media: (post.vehicle.vehicle_media ?? [])
          .filter((item) => item.moderation_status === "active")
          .map((item) => ({
            id: item.id,
            vehicle_id: item.vehicle_id,
            url: item.url,
            media_type: item.media_type,
            is_primary: item.is_primary,
            sort_order: item.sort_order,
            uploaded_at: item.uploaded_at,
          })),
      }
    : null;

  return {
    id: post.id,
    author_id: post.author_id,
    vehicle_id: vehicle ? post.vehicle_id : null,
    marketplace_listing_id:
      vehicle && post.marketplace_listing?.status === "active"
        ? post.marketplace_listing_id
        : null,
    group_id: post.group_id,
    content: post.content,
    audience: post.audience,
    post_type: post.post_type,
    accepted_answer_comment_id: acceptedAnswerCommentId,
    question_outcome: acceptedAnswerCommentId ? post.question_outcome : null,
    question_outcome_updated_at: acceptedAnswerCommentId ? post.question_outcome_updated_at : null,
    status: post.status,
    created_at: post.created_at,
    updated_at: post.updated_at,
    group_pinned: post.group_pinned_at !== null && post.group_status === "active",
    can_moderate_group: Boolean(post.group_id)
      && ["owner", "moderator"].includes(memberGroupIds.get(post.group_id ?? "") ?? ""),
    can_interact: !post.group_id || memberGroupIds.has(post.group_id),
    can_like: post.author_id !== viewerId,
    can_manage_accepted_answer: post.post_type === "question" && post.author_id === viewerId,
    like_count: 0,
    liked_by_viewer: false,
    saved_by_viewer: false,
    report_context: post.author_id === viewerId ? null : createReportContext({
      viewerId,
      entityType: "community_post",
      entityId: post.id,
      revisionId: post.active_revision_id,
    }),
    safety_notice: buildSafetyNotice(post.content),
    details: (post.details && typeof post.details === "object" && !Array.isArray(post.details) ? post.details : {}) as Record<string, unknown>,
    poll: null,
    inspection: null,
    mentions: post.mentions ?? [],
    author: post.author ? {
      id: post.author.id,
      display_name: post.author.display_name,
      username: post.author.username,
      avatar_url: post.author.avatar_url,
    } : null,
    vehicle,
    marketplace_listing:
      vehicle && post.marketplace_listing?.status === "active"
        ? {
            id: post.marketplace_listing.id,
            vehicle_id: post.marketplace_listing.vehicle_id,
            seller_id: post.marketplace_listing.seller_id,
            title: post.marketplace_listing.title,
            asking_price_cents: post.marketplace_listing.asking_price_cents,
            location: post.marketplace_listing.location,
            status: post.marketplace_listing.status,
            created_at: post.marketplace_listing.created_at,
            updated_at: post.marketplace_listing.updated_at,
          }
        : null,
    group: post.group ? {
      id: post.group.id,
      slug: post.group.slug,
      name: post.group.name,
      avatar_url: post.group.avatar_url,
    } : null,
    media: (post.media ?? [])
      .filter((item) => item.moderation_status === "active")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        id: item.id,
        post_id: item.post_id,
        url: communityMediaDeliveryPath(item.id),
        media_type: item.media_type,
        content_type: item.content_type,
        sort_order: item.sort_order,
        created_at: item.created_at,
      })),
    comments: visibleComments
      .map((comment) => ({
        id: comment.id,
        post_id: comment.post_id,
        author_id: comment.author_id,
        content: comment.content,
        status: comment.status,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        report_context: comment.author_id === viewerId ? null : createReportContext({
          viewerId,
          entityType: "community_comment",
          entityId: comment.id,
          revisionId: comment.active_revision_id,
        }),
        helpful_count: 0,
        helpful_by_viewer: false,
        can_mark_helpful: post.post_type === "question" && comment.author_id !== viewerId,
        mentions: comment.mentions ?? [],
        author: comment.author ? {
          id: comment.author.id,
          display_name: comment.author.display_name,
          username: comment.author.username,
          avatar_url: comment.author.avatar_url,
        } : null,
      })),
  };
}

// Viewer-specific reaction state (likes, private saves) layered onto posts
// that already passed the visibility policy.
function toPollView(row: { closes_at: string; closed: boolean; total_votes: number; viewer_option_key: string | null; options: unknown }): CommunityPollView {
  const options = Array.isArray(row.options) ? row.options as Array<{ key?: unknown; label?: unknown; votes?: unknown }> : [];
  return {
    closes_at: row.closes_at,
    closed: row.closed,
    total_votes: row.total_votes,
    viewer_option_key: row.viewer_option_key,
    options: options.map((option) => ({
      key: String(option.key ?? ""),
      label: String(option.label ?? ""),
      votes: typeof option.votes === "number" ? option.votes : null,
    })),
  };
}

// Viewer-specific state for a page of posts: likes, saves, poll results, and
// the redacted inspection card for Inspection Discussion posts.
async function withPostLikeState(posts: CommunityFeedPost[], viewerId: string) {
  if (posts.length === 0) return posts;
  const admin = createAdminClient();
  const postIds = posts.map((post) => post.id);
  const pollIds = posts.filter((post) => post.post_type === "poll").map((post) => post.id);
  const inspectionIds = posts
    .map((post) => (post.post_type === "inspection_discussion" ? String(post.details.inspection_request_id ?? "") : ""))
    .filter(Boolean);
  const answerIds = posts
    .filter((post) => post.post_type === "question")
    .flatMap((post) => post.comments.map((comment) => comment.id));
  const [
    { data, error },
    { data: saves, error: saveError },
    { data: polls, error: pollError },
    { data: inspections },
    { data: helpful, error: helpfulError },
  ] = await Promise.all([
    admin.rpc("community_post_like_summaries", { p_viewer_id: viewerId, p_post_ids: postIds }),
    admin.rpc("community_post_save_states", { p_viewer_id: viewerId, p_post_ids: postIds }),
    pollIds.length
      ? admin.rpc("community_poll_results", { p_viewer_id: viewerId, p_post_ids: pollIds })
      : Promise.resolve({ data: [], error: null }),
    inspectionIds.length
      ? admin.from("ppi_requests").select("id, ppi_type, inspection_scope, status, updated_at").in("id", inspectionIds)
      : Promise.resolve({ data: [] as Array<{ id: string; ppi_type: string; inspection_scope: string; status: string; updated_at: string }> }),
    answerIds.length
      ? admin.rpc("community_comment_helpful_summaries", { p_viewer_id: viewerId, p_comment_ids: answerIds })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (error) console.error("community_post_like_summaries failed", error);
  if (saveError) console.error("community_post_save_states failed", saveError);
  if (pollError) console.error("community_poll_results failed", pollError);
  if (helpfulError) console.error("community_comment_helpful_summaries failed", helpfulError);
  const summaries = new Map((data ?? []).map((summary) => [summary.post_id, summary]));
  const saved = new Set((saves ?? []).filter((row) => row.saved).map((row) => row.post_id));
  const pollByPost = new Map((polls ?? []).map((row) => [row.post_id, toPollView(row)]));
  const inspectionById = new Map((inspections ?? []).map((row) => [row.id, row]));
  const helpfulByComment = new Map((helpful ?? []).map((row) => [row.comment_id, row]));
  return posts.map((post) => {
    const inspection = post.post_type === "inspection_discussion"
      ? inspectionById.get(String(post.details.inspection_request_id ?? "")) ?? null
      : null;
    return {
      ...post,
      comments: post.comments.map((comment) => ({
        ...comment,
        helpful_count: Number(helpfulByComment.get(comment.id)?.helpful_count ?? 0),
        helpful_by_viewer: helpfulByComment.get(comment.id)?.helpful_by_viewer ?? false,
      })),
      like_count: Number(summaries.get(post.id)?.like_count ?? post.like_count),
      liked_by_viewer: summaries.get(post.id)?.liked_by_viewer ?? post.liked_by_viewer,
      saved_by_viewer: saved.has(post.id),
      poll: pollByPost.get(post.id) ?? post.poll,
      inspection: inspection
        ? {
          id: inspection.id,
          ppi_type: inspection.ppi_type,
          inspection_scope: inspection.inspection_scope,
          status: inspection.status,
          completed_at: inspection.status === "completed" ? inspection.updated_at : null,
        }
        : post.inspection,
    };
  });
}

/** Saved posts in save order; hidden or removed posts drop out silently. */
export async function getSavedCommunityPosts(page = 1, perPage = 20) {
  const viewerId = await getCommunityViewerId();
  if (!viewerId) return [];
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const admin = createAdminClient();
  const { data: savedRows, error } = await admin.rpc("list_saved_community_post_ids", {
    p_viewer_id: viewerId,
    p_limit: perPage,
    p_offset: (safePage - 1) * perPage,
  });
  if (error) {
    console.error("list_saved_community_post_ids failed", error);
    return [];
  }
  const postIds = (savedRows ?? []).map((row) => row.post_id);
  if (postIds.length === 0) return [];

  const { data } = await admin
    .from("community_posts")
    .select(COMMUNITY_FEED_SELECT)
    .in("id", postIds)
    .order("created_at", { ascending: true, referencedTable: "community_comments" });
  const posts = (data ?? []) as unknown as CommunityPost[];
  const [blockedCommentAuthors, memberGroupIds] = await Promise.all([
    getBlockedProfileIds(viewerId, posts.flatMap((post) => (post.comments ?? []).map((comment) => comment.author_id))),
    activeMembershipGroupIds(viewerId, posts),
  ]);
  const byId = new Map(posts.map((post) => [post.id, {
    ...post,
    comments: (post.comments ?? []).filter((comment) => !blockedCommentAuthors.has(comment.author_id)),
  }]));
  const ordered = postIds.flatMap((id) => {
    const post = byId.get(id);
    return post ? [toCommunityFeedPost(post, viewerId, memberGroupIds)] : [];
  });
  return withPostLikeState(ordered, viewerId);
}

// group id → the viewer's active role, for interaction and moderation flags.
async function activeMembershipGroupIds(viewerId: string, posts: CommunityPost[]) {
  const groupIds = [...new Set(posts.flatMap((post) => post.group_id ? [post.group_id] : []))];
  if (groupIds.length === 0) return new Map<string, GroupRole>();
  const { data } = await createAdminClient()
    .from("community_group_memberships")
    .select("group_id, role")
    .eq("profile_id", viewerId)
    .eq("status", "active")
    .in("group_id", groupIds);
  return new Map((data ?? []).map((membership) => [membership.group_id, membership.role]));
}

export async function getCommunityViewerId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username_state")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return profile?.username_state === "claimed" ? profile.id : null;
}

export async function getCommunityPosts(
  page = 1,
  perPage = 20,
  filter: CommunityFeedFilter = "all",
) {
  const viewerId = await getCommunityViewerId();
  if (!viewerId) return [];

  const admin = createAdminClient();
  const flags = await getFeatureFlags();
  const postIds = await getFilteredCommunityPostIds({
    viewerId,
    filter,
    page,
    perPage,
    includeGroupPosts: flags.flags.groups,
  });
  if (postIds.length === 0) return [];
  const { data } = await admin
    .from("community_posts")
    .select(COMMUNITY_FEED_SELECT)
    .in("id", postIds)
    .order("created_at", { ascending: true, referencedTable: "community_comments" })
    .limit(perPage);

  const posts = (data ?? []) as unknown as CommunityPost[];
  const blockedCommentAuthors = await getBlockedProfileIds(
    viewerId,
    posts.flatMap((post) => (post.comments ?? []).map((comment) => comment.author_id)),
  );
  const memberGroupIds = await activeMembershipGroupIds(viewerId, posts);
  const byId = new Map(posts.map((post) => [post.id, {
    ...post,
    comments: (post.comments ?? []).filter((comment) => !blockedCommentAuthors.has(comment.author_id)),
  }]));
  const visiblePosts = postIds.flatMap((id) => {
    const post = byId.get(id);
    return post ? [toCommunityFeedPost(post, viewerId, memberGroupIds)] : [];
  });
  return withPostLikeState(visiblePosts, viewerId);
}

export async function getCommunityPostById(id: string) {
  const viewerId = await getCommunityViewerId();
  if (!viewerId) return null;
  const { data: canView } = await createAdminClient().rpc("social_can_view_community_post", {
    p_viewer_id: viewerId,
    p_post_id: id,
    p_include_muted: false,
  });
  if (!canView) return null;

  const { data } = await createAdminClient()
    .from("community_posts")
    .select(COMMUNITY_FEED_SELECT)
    .eq("id", id)
    .eq("status", "active")
    .eq("moderation_status", "active")
    .maybeSingle();

  const post = data as unknown as CommunityPost | null;
  if (post?.group_id && !(await getFeatureFlags()).flags.groups) return null;
  // Vehicle visibility (public / friends / private) was already applied by
  // social_can_view_community_post for this viewer.
  if (!post) return null;
  const blockedAuthors = await getBlockedProfileIds(
    viewerId,
    (post.comments ?? []).map((comment) => comment.author_id),
  );
  const memberGroupIds = await activeMembershipGroupIds(viewerId, [post]);
  const visiblePost = toCommunityFeedPost({
    ...post,
    comments: (post.comments ?? []).filter((comment) => !blockedAuthors.has(comment.author_id)),
  }, viewerId, memberGroupIds);
  return (await withPostLikeState([visiblePost], viewerId))[0] ?? null;
}

// Posts on a member's social profile (plan 9.1 "Posts" section): the
// author's active general posts, each re-checked against the canonical
// visibility policy for this viewer. Group posts stay under Groups.
export async function getMemberCommunityPosts(profileId: string, page = 1, perPage = 20) {
  const viewerId = await getCommunityViewerId();
  if (!viewerId) return [];
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;

  const admin = createAdminClient();
  const { data: candidates } = await admin
    .from("community_posts")
    .select("id")
    .eq("author_id", profileId)
    .is("group_id", null)
    .eq("status", "active")
    .eq("moderation_status", "active")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((safePage - 1) * perPage, safePage * perPage - 1);
  if (!candidates?.length) return [];

  const visibility = await Promise.all(candidates.map(async (candidate) => {
    const { data: visible } = await admin.rpc("social_can_view_community_post", {
      p_viewer_id: viewerId,
      p_post_id: candidate.id,
      p_include_muted: true,
    });
    return visible ? candidate.id : null;
  }));
  const postIds = visibility.filter((id): id is string => id !== null);
  if (postIds.length === 0) return [];

  const { data } = await admin
    .from("community_posts")
    .select(COMMUNITY_FEED_SELECT)
    .in("id", postIds)
    .order("created_at", { ascending: true, referencedTable: "community_comments" });
  const posts = (data ?? []) as unknown as CommunityPost[];
  const blockedCommentAuthors = await getBlockedProfileIds(
    viewerId,
    posts.flatMap((post) => (post.comments ?? []).map((comment) => comment.author_id)),
  );
  const byId = new Map(posts.map((post) => [post.id, {
    ...post,
    comments: (post.comments ?? []).filter((comment) => !blockedCommentAuthors.has(comment.author_id)),
  }]));
  const ordered = postIds.flatMap((id) => {
    const post = byId.get(id);
    return post ? [toCommunityFeedPost(post, viewerId)] : [];
  });
  return withPostLikeState(ordered, viewerId);
}

const ARCHIVE_EXPIRY_DAYS = 30;

export function archiveExpiresAt(updatedAt: string): Date {
  const d = new Date(updatedAt);
  d.setDate(d.getDate() + ARCHIVE_EXPIRY_DAYS);
  return d;
}

export function archiveDaysRemaining(updatedAt: string): number {
  const expires = archiveExpiresAt(updatedAt);
  const diff = expires.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export async function getMyCommunityPosts(status: "active" | "archived" | "review" = "active") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: profile } = await getProfileIdFromAuthUserId(user.id);
  if (!profile) return [];

  const admin = createAdminClient();
  const { data: submittedAssemblies } = status === "review"
    ? await admin
        .from("community_post_assemblies")
        .select("post_id")
        .eq("owner_id", profile.id)
        .eq("state", "submitted")
    : { data: [] as Array<{ post_id: string }> };
  const submittedPostIds = (submittedAssemblies ?? []).map((assembly) => assembly.post_id);
  let query = admin
    .from("community_posts")
    .select(COMMUNITY_POST_SELECT)
    .eq("author_id", profile.id)
    .order("created_at", { ascending: false })
    .order("created_at", { ascending: true, referencedTable: "community_comments" });

  // For archived posts, only show those within the 30-day window
  if (status === "review") {
    query = submittedPostIds.length > 0
      ? query
          .or(`moderation_status.neq.active,id.in.(${submittedPostIds.join(",")})`)
          .neq("status", "archived")
      : query.neq("moderation_status", "active").neq("status", "archived");
  } else {
    query = query.eq("status", status);
  }

  if (status === "archived") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ARCHIVE_EXPIRY_DAYS);
    query = query.gte("updated_at", cutoff.toISOString());
  }

  const { data } = await query;
  return cleanPosts((data ?? []) as CommunityPost[], true);
}

/**
 * Admin listing. "review" is what the author sees as "in review": posts held
 * by moderation, or hidden while their photos wait for the media queue
 * (decide those in /admin/moderation?tab=media).
 */
export async function getAdminCommunityPosts(page = 1, perPage = 50, status?: "active" | "archived" | "review" | "all") {
  const admin = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = admin
    .from("community_posts")
    .select(COMMUNITY_POST_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("created_at", { ascending: true, referencedTable: "community_comments" })
    .range(from, to);

  if (status === "review") {
    const { data: held } = await admin
      .from("community_post_assemblies")
      .select("post_id")
      .in("state", ["submitted", "assembling"]);
    const heldIds = (held ?? []).map((assembly) => assembly.post_id);
    query = query.neq("status", "archived");
    query = heldIds.length > 0
      ? query.or(`moderation_status.neq.active,id.in.(${heldIds.join(",")})`)
      : query.neq("moderation_status", "active");
  } else if (status && status !== "all") {
    query = query.eq("status", status);
  } else {
    // Default: only active + archived (not hidden legacy)
    query = query.in("status", ["active", "archived"]);
  }

  const { data, count } = await query;

  return {
    posts: cleanPosts((data ?? []) as CommunityPost[], true),
    total: count ?? 0,
  };
}

export async function getCommunityPostOptions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { vehicles: [], listings: [], groups: [], inspections: [], defaultAudience: "friends" as const, canPostPublic: false };

  const { data: profile } = await getProfileIdFromAuthUserId(user.id);
  if (!profile) return { vehicles: [], listings: [], groups: [], inspections: [], defaultAudience: "friends" as const, canPostPublic: false };

  const admin = createAdminClient();
  const flags = await getFeatureFlags();
  const [{ data: vehicles }, { data: listings }, { data: memberships }, { data: inspections }] = await Promise.all([
    admin
      .from("vehicles")
      .select("id, year, make, model, trim, vin")
      .eq("owner_id", profile.id)
      .eq("visibility", "public")
      .order("created_at", { ascending: false }),
    admin
      .from("marketplace_listings")
      .select("id, title, vehicle_id, asking_price_cents, vehicle:vehicles!marketplace_listings_vehicle_id_fkey(id, year, make, model, trim, vin)")
      .eq("seller_id", profile.id)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    flags.flags.groups
      ? admin
          .from("community_group_memberships")
          .select("group:community_groups!community_group_memberships_group_id_fkey(id, slug, name, avatar_url)")
          .eq("profile_id", profile.id)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),
    admin
      .from("ppi_requests")
      .select("id, vehicle_id, ppi_type, inspection_scope, status, updated_at")
      .eq("requester_id", profile.id)
      .in("status", ["submitted", "completed"])
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  const publicVehicleIds = new Set((vehicles ?? []).map((vehicle) => vehicle.id));
  const groups = (memberships ?? []).flatMap((membership) => {
    const group = membership.group as unknown as CommunityPostOptionGroup | null;
    return group ? [group] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    vehicles: (vehicles ?? []) as CommunityPostOptionVehicle[],
    listings: (listings ?? []) as CommunityPostOptionListing[],
    groups,
    // Only inspections of vehicles that can be attached (public) are offered.
    inspections: ((inspections ?? []) as CommunityPostOptionInspection[]).filter((inspection) => publicVehicleIds.has(inspection.vehicle_id)),
    defaultAudience: profile.default_post_audience,
    canPostPublic: profile.is_public,
  };
}

/** Feed-shaped posts for ids the database already cleared for this viewer (search, group lists). */
export async function getCommunityPostsForViewer(viewerId: string, postIds: string[]) {
  return hydrateGroupPostIds(viewerId, postIds);
}

// Shared hydration for a list of visible post ids in a group.
async function hydrateGroupPostIds(viewerId: string, postIds: string[]) {
  if (postIds.length === 0) return [];
  const { data } = await createAdminClient()
    .from("community_posts")
    .select(COMMUNITY_FEED_SELECT)
    .in("id", postIds)
    .order("created_at", { ascending: true, referencedTable: "community_comments" });
  const posts = (data ?? []) as unknown as CommunityPost[];
  const [blockedAuthors, memberGroupIds] = await Promise.all([
    getBlockedProfileIds(viewerId, posts.flatMap((post) => (post.comments ?? []).map((comment) => comment.author_id))),
    activeMembershipGroupIds(viewerId, posts),
  ]);
  const byId = new Map(posts.map((post) => [post.id, {
    ...post,
    comments: (post.comments ?? []).filter((comment) => !blockedAuthors.has(comment.author_id)),
  }]));
  const visiblePosts = postIds.flatMap((id) => {
    const post = byId.get(id);
    return post ? [toCommunityFeedPost(post, viewerId, memberGroupIds)] : [];
  });
  return withPostLikeState(visiblePosts, viewerId);
}

/** Up to three moderator-pinned posts (plan 13.5), newest pin first. */
export async function getCommunityGroupPinnedPosts(groupId: string) {
  const viewerId = await getCommunityViewerId();
  if (!viewerId || !(await getFeatureFlags()).flags.groups) return [];
  const { data, error } = await createAdminClient().rpc("social_visible_community_group_pinned_post_ids", {
    p_viewer_id: viewerId,
    p_group_id: groupId,
  });
  if (error) {
    console.error("pinned group posts failed", error.message);
    return [];
  }
  return hydrateGroupPostIds(viewerId, (data ?? []).map((row) => row.post_id));
}

/** Search within a group (plan 13.5); every hit re-checked for visibility. */
export async function searchCommunityGroupPosts(groupId: string, query: string, page = 1, perPage = 20) {
  const viewerId = await getCommunityViewerId();
  if (!viewerId || !(await getFeatureFlags()).flags.groups) return [];
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const { data, error } = await createAdminClient().rpc("search_group_posts", {
    p_viewer_id: viewerId,
    p_group_id: groupId,
    p_query: query.trim().slice(0, 100),
    p_limit: perPage,
    p_offset: (safePage - 1) * perPage,
  });
  if (error) {
    console.error("search_group_posts failed", error.message);
    return [];
  }
  return hydrateGroupPostIds(viewerId, (data ?? []).map((row) => row.post_id));
}

export async function getCommunityGroupPosts(groupId: string, page = 1, perPage = 20) {
  const viewerId = await getCommunityViewerId();
  if (!viewerId || !(await getFeatureFlags()).flags.groups) return [];
  const postIds = await getVisibleCommunityGroupPostIds({ viewerId, groupId, page, perPage });
  if (postIds.length === 0) return [];

  const { data } = await createAdminClient()
    .from("community_posts")
    .select(COMMUNITY_FEED_SELECT)
    .in("id", postIds)
    .order("created_at", { ascending: true, referencedTable: "community_comments" });
  const posts = (data ?? []) as unknown as CommunityPost[];
  const blockedAuthors = await getBlockedProfileIds(
    viewerId,
    posts.flatMap((post) => (post.comments ?? []).map((comment) => comment.author_id)),
  );
  const memberGroupIds = await activeMembershipGroupIds(viewerId, posts);
  const byId = new Map(posts.map((post) => [post.id, {
    ...post,
    comments: (post.comments ?? []).filter((comment) => !blockedAuthors.has(comment.author_id)),
  }]));
  const visiblePosts = postIds.flatMap((id) => {
    const post = byId.get(id);
    return post ? [toCommunityFeedPost(post, viewerId, memberGroupIds)] : [];
  });
  return withPostLikeState(visiblePosts, viewerId);
}

export async function getVehicleDiscussionPosts(vehicleId: string) {
  const viewerId = await getCommunityViewerId();
  if (!viewerId) return [];

  const admin = createAdminClient();
  const postIds = await getVisibleCommunityPostIds({ viewerId, perPage: 100, vehicleId });
  if (postIds.length === 0) return [];
  const { data } = await admin
    .from("community_posts")
    .select(COMMUNITY_FEED_SELECT)
    .in("id", postIds)
    .order("created_at", { ascending: false })
    .order("created_at", { ascending: true, referencedTable: "community_comments" });

  const posts = (data ?? []) as unknown as CommunityPost[];
  const blockedAuthors = await getBlockedProfileIds(
    viewerId,
    posts.flatMap((post) => (post.comments ?? []).map((comment) => comment.author_id)),
  );
  const memberGroupIds = await activeMembershipGroupIds(viewerId, posts);
  const visiblePosts = posts
    .map((post) => ({ ...post, comments: post.comments.filter((comment) => !blockedAuthors.has(comment.author_id)) }))
    .map((post) => toCommunityFeedPost(post, viewerId, memberGroupIds));
  return withPostLikeState(visiblePosts, viewerId);
}
