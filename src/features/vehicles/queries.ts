import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePresignedGetUrl, isPrivateStorageReference } from "@/lib/storage/r2";
import { getCurrentSocialProfileId } from "@/features/social/relationships";

async function authorizeVehicleMedia<T extends { url: string }>(media: T[]): Promise<T[]> {
  return Promise.all(media.map(async (item) => ({
    ...item,
    url: isPrivateStorageReference(item.url) ? await generatePresignedGetUrl(item.url, 900) : item.url,
  })));
}

export async function getMyVehicles() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return [];

  const { data } = await supabase
    .from("vehicles")
    .select(`
      *,
      vehicle_media(*),
      ppi_requests(id, status, created_at, updated_at),
      marketplace_listings(id, status)
    `)
    .eq("owner_id", profile.id)
    .order("created_at", { ascending: false });

  return Promise.all((data ?? []).map(async (vehicle) => ({
    ...vehicle,
    vehicle_media: await authorizeVehicleMedia(vehicle.vehicle_media ?? []),
  })));
}

export async function getVehicle(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("vehicles")
    .select("*, vehicle_media(*)")
    .eq("id", id)
    .single();

  if (!data) return null;
  const { data: privateDetails } = await supabase
    .from("vehicle_notes")
    .select("notes")
    .eq("vehicle_id", id)
    .maybeSingle();

  return {
    ...data,
    notes: privateDetails?.notes ?? null,
    vehicle_media: await authorizeVehicleMedia(data.vehicle_media ?? []),
  };
}

export async function getOwnedVehicle(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) return null;

  const { data } = await supabase
    .from("vehicles")
    .select("*, vehicle_media(*)")
    .eq("id", id)
    .eq("owner_id", profile.id)
    .maybeSingle();

  if (!data) return null;
  const { data: privateDetails } = await supabase
    .from("vehicle_notes")
    .select("notes")
    .eq("vehicle_id", id)
    .maybeSingle();

  return {
    ...data,
    notes: privateDetails?.notes ?? null,
    vehicle_media: await authorizeVehicleMedia(data.vehicle_media ?? []),
  };
}

export async function getVisibleVehicle(id: string) {
  const admin = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();
  if (!viewerId) return null;

  const { data: canView } = await admin.rpc("social_can_view_vehicle", {
    p_viewer_id: viewerId,
    p_vehicle_id: id,
  });
  if (!canView) return null;

  const { data: vehicle } = await admin
    .from("vehicles")
    .select(`
      id, owner_id, year, make, model, trim, nickname, ownership_state,
      mileage, mileage_updated_at, visibility, engine, drivetrain,
      transmission, body_style, sold_at, created_at, updated_at,
      vehicle_media(id, vehicle_id, url, media_type, is_primary, sort_order, uploaded_at, moderation_status),
      owner:profiles!vehicles_owner_id_fkey(id, display_name, username, avatar_url, is_public)
    `)
    .eq("id", id)
    .single();

  if (!vehicle) return null;
  return {
    ...vehicle,
    viewer_is_owner: vehicle.owner_id === viewerId,
    vehicle_media: await authorizeVehicleMedia(
      (vehicle.vehicle_media ?? []).filter((media) => media.moderation_status === "active"),
    ),
  };
}

// Retain the established export while callers migrate to the clearer name.
export const getPublicVehicle = getVisibleVehicle;

export async function getVehiclePpiHistory(vehicleId: string) {
  const admin = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();
  if (!viewerId) return [];

  const { data: vehicle } = await admin
    .from("vehicles")
    .select("owner_id, visibility")
    .eq("id", vehicleId)
    .maybeSingle();

  if (!vehicle?.owner_id) return [];

  const { data: canView } = await admin.rpc("social_can_view_vehicle", {
    p_viewer_id: viewerId,
    p_vehicle_id: vehicleId,
  });
  if (!canView) return [];

  if (viewerId !== vehicle.owner_id) {
    if (vehicle.visibility !== "public") return [];
    const { data: listing } = await admin
      .from("marketplace_listings")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .eq("seller_id", vehicle.owner_id)
      .eq("status", "active")
      .maybeSingle();
    if (!listing) return [];
  }

  const { data } = await admin
    .from("ppi_requests")
    .select(`
      id,
      ppi_type,
      performer_type,
      inspection_scope,
      status,
      created_at,
      updated_at,
      requester:profiles!ppi_requests_requester_id_fkey(id, display_name, username, avatar_url, is_public),
      assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name, username, avatar_url, is_public)
    `)
    .eq("vehicle_id", vehicleId)
    .eq("requester_id", vehicle.owner_id)
    .in("status", ["submitted", "completed"])
    .order("created_at", { ascending: false });

  return data ?? [];
}
