import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePresignedGetUrl, isPrivateStorageReference } from "@/lib/storage/r2";
import { getBlockedProfileIds, getCurrentSocialProfileId } from "@/features/social/relationships";

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
    .select("*, vehicle_media(*)")
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

export async function getPublicVehicle(id: string) {
  const admin = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();

  const { data: vehicle } = await admin
    .from("vehicles")
    .select(`
      *,
      vehicle_media(*),
      owner:profiles!vehicles_owner_id_fkey(id, display_name, username, avatar_url, is_public)
    `)
    .eq("id", id)
    .eq("visibility", "public")
    .single();

  if (!vehicle) return null;
  if (viewerId && vehicle.owner_id) {
    const blockedIds = await getBlockedProfileIds(viewerId, [vehicle.owner_id]);
    if (blockedIds.has(vehicle.owner_id)) return null;
  }
  return {
    ...vehicle,
    vehicle_media: (vehicle.vehicle_media ?? []).filter((media) => media.moderation_status === "active"),
  };
}

export async function getVehiclePpiHistory(vehicleId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("ppi_requests")
    .select(`
      id,
      ppi_type,
      status,
      created_at,
      updated_at,
      requester:profiles!ppi_requests_requester_id_fkey(id, display_name, username, avatar_url),
      assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name, username, avatar_url)
    `)
    .eq("vehicle_id", vehicleId)
    .in("status", ["submitted", "completed"])
    .order("created_at", { ascending: false });

  return data ?? [];
}
