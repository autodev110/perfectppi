import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .eq("is_public", true)
    .single();

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
  const admin = createAdminClient();

  const [
    { data: vehicles },
    { data: listings },
    { data: posts },
    { data: ppis },
  ] = await Promise.all([
    admin
      .from("vehicles")
      .select("id, year, make, model, trim, mileage, vin, visibility, created_at, vehicle_media(url, is_primary, sort_order, moderation_status)")
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
      .select("id, content, created_at, vehicle:vehicles!community_posts_vehicle_id_fkey(id, year, make, model, trim, vehicle_media(url, is_primary, moderation_status))")
      .eq("author_id", profileId)
      .eq("status", "active")
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
  return {
    vehicles: (vehicles ?? []).map(cleanVehicle),
    listings: (listings ?? []).map((item) => ({ ...item, vehicle: cleanVehicle(item.vehicle) })),
    posts: (posts ?? []).map((item) => ({ ...item, vehicle: cleanVehicle(item.vehicle) })),
    ppis: publicPpis.map((item) => ({ ...item, vehicle: cleanVehicle(item.vehicle) })),
  };
}
