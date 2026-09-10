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
type CommunityGroupRow = Database["public"]["Tables"]["community_groups"]["Row"];

type CommunityFeedProfile = Pick<Profile, "id" | "display_name" | "username" | "avatar_url">;
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
> & { author: CommunityFeedProfile | null; report_context: string | null };
type CommunityFeedGroup = Pick<CommunityGroupRow, "id" | "slug" | "name" | "avatar_url">;

export type CommunityFeedPost = Pick<
  CommunityPostRow,
  "id" | "author_id" | "vehicle_id" | "marketplace_listing_id" | "group_id" | "content" | "audience" | "post_type" | "accepted_answer_comment_id" | "status" | "created_at" | "updated_at"
> & {
  author: CommunityFeedProfile | null;
  vehicle: CommunityFeedVehicle | null;
  marketplace_listing: CommunityFeedListing | null;
  media: CommunityFeedMedia[];
  comments: CommunityFeedComment[];
  group: CommunityFeedGroup | null;
  can_interact: boolean;
  can_like: boolean;
  can_manage_accepted_answer: boolean;
  like_count: number;
  liked_by_viewer: boolean;
  report_context: string | null;
  /** Plan 15.5: present when the post involves a high-consequence repair topic. */
  safety_notice: SafetyNotice | null;
};

export type CommunityComment = CommunityCommentRow & {
  author: Profile | null;
};

export type CommunityPost = CommunityPostRow & {
  author: Profile | null;
  vehicle: Vehicle | null;
  marketplace_listing: Listing | null;
  media: CommunityPostMediaRow[];
  comments: CommunityComment[];
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

const COMMUNITY_POST_SELECT = `
  *,
  author:profiles!community_posts_author_id_fkey(id, display_name, username, avatar_url, is_public),
  vehicle:vehicles!community_posts_vehicle_id_fkey(*, vehicle_media(*)),
  marketplace_listing:marketplace_listings!community_posts_marketplace_listing_id_fkey(*),
  group:community_groups!community_posts_group_id_fkey(*),
  media:community_post_media!community_post_media_post_id_fkey(*),
  comments:community_comments!community_comments_post_id_fkey(
    *,
    author:profiles!community_comments_author_id_fkey(id, display_name, username, avatar_url, is_public)
  )
`;

// Ordinary clients receive a deliberately small projection. Moderation fields
// are selected only where the server needs them to filter nested rows, then
// removed before serialization.
const COMMUNITY_FEED_SELECT = `
  id, author_id, vehicle_id, marketplace_listing_id, group_id, active_revision_id, content, audience, post_type, accepted_answer_comment_id, status, created_at, updated_at,
  author:profiles!community_posts_author_id_fkey(id, display_name, username, avatar_url, is_public),
  vehicle:vehicles!community_posts_vehicle_id_fkey(
    id, year, make, model, trim, mileage, visibility,
    vehicle_media(id, vehicle_id, url, media_type, is_primary, sort_order, uploaded_at, moderation_status)
  ),
  marketplace_listing:marketplace_listings!community_posts_marketplace_listing_id_fkey(
    id, vehicle_id, seller_id, title, asking_price_cents, location, status, created_at, updated_at
  ),
  group:community_groups!community_posts_group_id_fkey(id, slug, name, avatar_url),
  media:community_post_media!community_post_media_post_id_fkey(
    id, post_id, url, media_type, content_type, sort_order, created_at, moderation_status
  ),
  comments:community_comments!community_comments_post_id_fkey(
    id, post_id, author_id, active_revision_id, content, status, created_at, updated_at, moderation_status,
    author:profiles!community_comments_author_id_fkey(id, display_name, username, avatar_url, is_public)
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

function toCommunityFeedPost(
  post: CommunityPost,
  viewerId: string,
  memberGroupIds: ReadonlySet<string> = new Set(),
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
    status: post.status,
    created_at: post.created_at,
    updated_at: post.updated_at,
    can_interact: !post.group_id || memberGroupIds.has(post.group_id),
    can_like: post.author_id !== viewerId,
    can_manage_accepted_answer: post.post_type === "question" && post.author_id === viewerId,
    like_count: 0,
    liked_by_viewer: false,
    report_context: post.author_id === viewerId ? null : createReportContext({
      viewerId,
      entityType: "community_post",
      entityId: post.id,
      revisionId: post.active_revision_id,
    }),
    safety_notice: buildSafetyNotice(post.content),
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
        author: comment.author ? {
          id: comment.author.id,
          display_name: comment.author.display_name,
          username: comment.author.username,
          avatar_url: comment.author.avatar_url,
        } : null,
      })),
  };
}

async function withPostLikeState(posts: CommunityFeedPost[], viewerId: string) {
  if (posts.length === 0) return posts;
  const { data, error } = await createAdminClient().rpc("community_post_like_summaries", {
    p_viewer_id: viewerId,
    p_post_ids: posts.map((post) => post.id),
  });
  if (error) {
    console.error("community_post_like_summaries failed", error);
    return posts;
  }
  const summaries = new Map((data ?? []).map((summary) => [summary.post_id, summary]));
  return posts.map((post) => ({
    ...post,
    like_count: Number(summaries.get(post.id)?.like_count ?? 0),
    liked_by_viewer: summaries.get(post.id)?.liked_by_viewer ?? false,
  }));
}

async function activeMembershipGroupIds(viewerId: string, posts: CommunityPost[]) {
  const groupIds = [...new Set(posts.flatMap((post) => post.group_id ? [post.group_id] : []))];
  if (groupIds.length === 0) return new Set<string>();
  const { data } = await createAdminClient()
    .from("community_group_memberships")
    .select("group_id")
    .eq("profile_id", viewerId)
    .eq("status", "active")
    .in("group_id", groupIds);
  return new Set((data ?? []).map((membership) => membership.group_id));
}

async function getCommunityViewerId() {
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
  if (!post || (post.vehicle && post.vehicle.visibility !== "public")) return null;
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

export async function getAdminCommunityPosts(page = 1, perPage = 50, status?: "active" | "archived" | "all") {
  const admin = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = admin
    .from("community_posts")
    .select(COMMUNITY_POST_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("created_at", { ascending: true, referencedTable: "community_comments" })
    .range(from, to);

  if (status && status !== "all") {
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

  if (!user) return { vehicles: [], listings: [], groups: [], defaultAudience: "friends" as const, canPostPublic: false };

  const { data: profile } = await getProfileIdFromAuthUserId(user.id);
  if (!profile) return { vehicles: [], listings: [], groups: [], defaultAudience: "friends" as const, canPostPublic: false };

  const admin = createAdminClient();
  const flags = await getFeatureFlags();
  const [{ data: vehicles }, { data: listings }, { data: memberships }] = await Promise.all([
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
  ]);

  const groups = (memberships ?? []).flatMap((membership) => {
    const group = membership.group as unknown as CommunityPostOptionGroup | null;
    return group ? [group] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    vehicles: (vehicles ?? []) as CommunityPostOptionVehicle[],
    listings: (listings ?? []) as CommunityPostOptionListing[],
    groups,
    defaultAudience: profile.default_post_audience,
    canPostPublic: profile.is_public,
  };
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
