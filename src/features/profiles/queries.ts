import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBlockedProfileIds } from "@/features/social/relationships";

async function getViewerProfileId() {
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

export async function getMyProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  return data;
}

export async function getPublicProfile(username: string) {
  const viewerId = await getViewerProfileId();
  if (!viewerId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, username, username_normalized, display_name, avatar_url, bio, role, is_public, created_at, allow_exact_username_lookup")
    .eq("username_normalized", username.trim().toLowerCase())
    .eq("username_state", "claimed")
    .maybeSingle();

  if (!data) return null;
  const [{ data: canView }, { data: friends }, blockedIds] = await Promise.all([
    admin.rpc("social_can_view_profile", { p_viewer_id: viewerId, p_profile_id: data.id }),
    admin.rpc("social_profiles_are_friends", { p_first_id: viewerId, p_second_id: data.id }),
    getBlockedProfileIds(viewerId, [data.id]),
  ]);
  if (!canView || blockedIds.has(data.id)) return null;
  if (viewerId !== data.id && !data.allow_exact_username_lookup) return null;

  if (!data.is_public && !friends && viewerId !== data.id) {
    return { ...data, bio: null };
  }
  return data;
}

export async function getProfileById(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  return data;
}

export async function getProfilePublicContent(profileId: string) {
  const viewerId = await getViewerProfileId();
  if (!viewerId) return { vehicles: [], listings: [], posts: [], ppis: [] };
  const admin = createAdminClient();
  const [{ data: canView }, { data: friends }, { data: target }] = await Promise.all([
    admin.rpc("social_can_view_profile", { p_viewer_id: viewerId, p_profile_id: profileId }),
    admin.rpc("social_profiles_are_friends", { p_first_id: viewerId, p_second_id: profileId }),
    admin.from("profiles").select("is_public").eq("id", profileId).maybeSingle(),
  ]);
  if (!canView || (!target?.is_public && !friends && viewerId !== profileId)) {
    return { vehicles: [], listings: [], posts: [], ppis: [] };
  }

  const [
    { data: vehicles },
    { data: listings },
    { data: posts },
    { data: ppis },
  ] = await Promise.all([
    admin
      .from("vehicles")
      .select("id, year, make, model, trim, mileage, visibility, created_at, vehicle_media(url, is_primary, sort_order, moderation_status)")
      .eq("owner_id", profileId)
      .eq("visibility", "public")
      .order("created_at", { ascending: false }),

    admin
      .from("marketplace_listings")
      .select("id, title, asking_price_cents, location, vehicle_id, created_at, vehicle:vehicles!marketplace_listings_vehicle_id_fkey(id, year, make, model, trim, mileage, vehicle_media(url, is_primary, moderation_status))")
      .eq("seller_id", profileId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),

    admin
      .from("community_posts")
      .select("id, content, audience, created_at, moderation_status, vehicle:vehicles!community_posts_vehicle_id_fkey(id, year, make, model, trim, vehicle_media(url, is_primary, moderation_status))")
      .eq("author_id", profileId)
      .eq("status", "active")
      .eq("moderation_status", "active")
      .order("created_at", { ascending: false })
      .limit(12),

    admin
      .from("ppi_requests")
      .select("id, ppi_type, status, created_at, vehicle:vehicles!ppi_requests_vehicle_id_fkey(id, year, make, model, trim, visibility, vehicle_media(url, is_primary, moderation_status))")
      .eq("requester_id", profileId)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
  ]);

  // Only surface PPIs on public vehicles — those are the ones the owner "chose to share"
  const publicPpis = (ppis ?? []).filter(
    (p) => (p.vehicle as { visibility?: string } | null)?.visibility === "public",
  );

  const cleanVehicle = <T extends { vehicle_media?: Array<{ moderation_status: string }> } | null>(vehicle: T) =>
    vehicle ? { ...vehicle, vehicle_media: (vehicle.vehicle_media ?? []).filter((m) => m.moderation_status === "active") } : vehicle;
  const visiblePostChecks = await Promise.all((posts ?? []).map(async (post) => {
    const { data: visible } = await admin.rpc("social_can_view_community_post", {
      p_viewer_id: viewerId,
      p_post_id: post.id,
      p_include_muted: false,
    });
    return visible ? post : null;
  }));

  return {
    vehicles: (vehicles ?? []).map(cleanVehicle),
    listings: (listings ?? []).map((item) => ({ ...item, vehicle: cleanVehicle(item.vehicle) })),
    posts: visiblePostChecks.filter((item) => item !== null).map((item) => ({ ...item, vehicle: cleanVehicle(item.vehicle) })),
    ppis: publicPpis.map((item) => ({ ...item, vehicle: cleanVehicle(item.vehicle) })),
  };
}
