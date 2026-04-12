"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createConversation, sendMessage } from "@/features/messages/actions";

const createListingSchema = z.object({
  vehicle_id: z.string().uuid("Choose a vehicle to list"),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(1200).optional().or(z.literal("")),
  asking_price: z.coerce
    .number({ invalid_type_error: "Enter an asking price" })
    .positive("Enter an asking price above $0")
    .max(10_000_000, "Asking price is too high"),
  location: z.string().trim().max(120).optional().or(z.literal("")),
});

const listingStatusSchema = z.enum(["active", "sold", "archived"]);
const contactSellerSchema = z.object({
  listingId: z.string().uuid(),
  vehicleId: z.string().uuid(),
});

async function getCurrentProfileId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" as const };

  return { profileId: profile.id };
}

export async function createMarketplaceListing(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = createListingSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const profile = await getCurrentProfileId();
  if ("error" in profile) return profile;

  const admin = createAdminClient();
  const { data: vehicle } = await admin
    .from("vehicles")
    .select("id, owner_id, visibility, year, make, model, trim")
    .eq("id", parsed.data.vehicle_id)
    .single();

  if (!vehicle || vehicle.owner_id !== profile.profileId) {
    return { error: "You can only list vehicles you own" };
  }

  if (vehicle.visibility !== "public") {
    return { error: "Make this vehicle public before listing it on the marketplace" };
  }

  const { data: existing } = await admin
    .from("marketplace_listings")
    .select("id")
    .eq("vehicle_id", vehicle.id)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    return { error: "This vehicle already has an active marketplace listing" };
  }

  const generatedTitle = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");

  const { data, error } = await admin
    .from("marketplace_listings")
    .insert({
      vehicle_id: vehicle.id,
      seller_id: profile.profileId,
      title: parsed.data.title || generatedTitle || "Vehicle for sale",
      description: parsed.data.description || null,
      asking_price_cents: Math.round(parsed.data.asking_price * 100),
      location: parsed.data.location || null,
      status: "active",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/marketplace");
  revalidatePath("/dashboard/listings");
  revalidatePath(`/vehicle/${vehicle.id}`);

  return { data };
}

export async function updateMarketplaceListingStatus(
  listingId: string,
  status: "active" | "sold" | "archived"
) {
  const parsedStatus = listingStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { error: "Invalid listing status" };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return profile;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("marketplace_listings")
    .update({ status: parsedStatus.data })
    .eq("id", listingId)
    .eq("seller_id", profile.profileId)
    .select("id, vehicle_id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/marketplace");
  revalidatePath("/dashboard/listings");
  if (data?.vehicle_id) revalidatePath(`/vehicle/${data.vehicle_id}`);

  return { success: true };
}

async function updateListingStatusFromForm(
  formData: FormData,
  status: "active" | "sold" | "archived"
) {
  const listingId = String(formData.get("listing_id") ?? "");
  if (!listingId) return;

  await updateMarketplaceListingStatus(listingId, status);
}

export async function markMarketplaceListingSold(formData: FormData) {
  await updateListingStatusFromForm(formData, "sold");
}

export async function archiveMarketplaceListing(formData: FormData) {
  await updateListingStatusFromForm(formData, "archived");
}

export async function reactivateMarketplaceListing(formData: FormData) {
  await updateListingStatusFromForm(formData, "active");
}

export async function contactSellerFromListing(formData: FormData) {
  const parsed = contactSellerSchema.safeParse({
    listingId: formData.get("listing_id"),
    vehicleId: formData.get("vehicle_id"),
  });

  if (!parsed.success) redirect("/marketplace");

  const profile = await getCurrentProfileId();
  if ("error" in profile) {
    redirect(`/login?redirect=/vehicle/${parsed.data.vehicleId}%3Ftab%3Dmarketplace`);
  }

  const admin = createAdminClient();
  const { data: listing } = await admin
    .from("marketplace_listings")
    .select("id, seller_id, title, vehicle_id, vehicles(year, make, model, trim)")
    .eq("id", parsed.data.listingId)
    .eq("status", "active")
    .maybeSingle();

  if (!listing) redirect(`/vehicle/${parsed.data.vehicleId}?tab=marketplace`);
  if (listing.seller_id === profile.profileId) redirect("/dashboard/listings");

  const conversation = await createConversation({ participantId: listing.seller_id });
  if ("error" in conversation) redirect(`/vehicle/${parsed.data.vehicleId}?tab=marketplace`);

  const vehicle = listing.vehicles as {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
  } | null;
  const vehicleLabel =
    [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ") ||
    "your vehicle";

  if (!conversation.data.existing) {
    await sendMessage({
      conversationId: conversation.data.conversationId,
      content: `Hi, I am interested in your PerfectPPI listing for ${vehicleLabel}: ${listing.title}.`,
    });
  }

  redirect(`/dashboard/messages/${conversation.data.conversationId}`);
}
