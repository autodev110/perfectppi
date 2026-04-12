import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

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
type CommunityCommentRow = Database["public"]["Tables"]["community_comments"]["Row"];

export type CommunityComment = CommunityCommentRow & {
  author: Profile | null;
};

export type CommunityPost = CommunityPostRow & {
  author: Profile | null;
  vehicle: Vehicle | null;
  marketplace_listing: Listing | null;
  comments: CommunityComment[];
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

const COMMUNITY_POST_SELECT = `
  *,
  author:profiles!community_posts_author_id_fkey(id, display_name, username, avatar_url, is_public),
  vehicle:vehicles!community_posts_vehicle_id_fkey(*, vehicle_media(*)),
  marketplace_listing:marketplace_listings!community_posts_marketplace_listing_id_fkey(*),
  comments:community_comments!community_comments_post_id_fkey(
    *,
    author:profiles!community_comments_author_id_fkey(id, display_name, username, avatar_url, is_public)
  )
`;

function getProfileIdFromAuthUserId(authUserId: string) {
  const admin = createAdminClient();
  return admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .single();
}

function cleanPosts(posts: CommunityPost[]) {
  return posts.map((post) => ({
    ...post,
    comments: (post.comments ?? []).filter((comment) => comment.status === "active"),
  }));
}

export async function getCommunityPosts() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("community_posts")
    .select(COMMUNITY_POST_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .order("created_at", { ascending: true, referencedTable: "community_comments" });

  const posts = cleanPosts((data ?? []) as CommunityPost[]);
  return posts.filter((post) => !post.vehicle || post.vehicle.visibility === "public");
}

export async function getMyCommunityPosts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: profile } = await getProfileIdFromAuthUserId(user.id);
  if (!profile) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("community_posts")
    .select(COMMUNITY_POST_SELECT)
    .eq("author_id", profile.id)
    .order("created_at", { ascending: false })
    .order("created_at", { ascending: true, referencedTable: "community_comments" });

  return cleanPosts((data ?? []) as CommunityPost[]);
}

export async function getAdminCommunityPosts(page = 1, perPage = 50) {
  const admin = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, count } = await admin
    .from("community_posts")
    .select(COMMUNITY_POST_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("created_at", { ascending: true, referencedTable: "community_comments" })
    .range(from, to);

  return {
    posts: (data ?? []) as CommunityPost[],
    total: count ?? 0,
  };
}

export async function getCommunityPostOptions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { vehicles: [], listings: [] };

  const { data: profile } = await getProfileIdFromAuthUserId(user.id);
  if (!profile) return { vehicles: [], listings: [] };

  const admin = createAdminClient();
  const [{ data: vehicles }, { data: listings }] = await Promise.all([
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
  ]);

  return {
    vehicles: (vehicles ?? []) as CommunityPostOptionVehicle[],
    listings: (listings ?? []) as CommunityPostOptionListing[],
  };
}

export async function getVehicleDiscussionPosts(vehicleId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("community_posts")
    .select(COMMUNITY_POST_SELECT)
    .eq("status", "active")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false })
    .order("created_at", { ascending: true, referencedTable: "community_comments" });

  return cleanPosts((data ?? []) as CommunityPost[]);
}
