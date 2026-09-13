"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const claimInputSchema = z.object({
  code: z.string().trim().min(1).max(32),
  vin: z.string().trim().toUpperCase().regex(
    /^[A-HJ-NPR-Z0-9]{17}$/,
    "Enter the complete 17-character VIN.",
  ),
});

const claimAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

async function currentProfileId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return profile?.id ?? null;
}

function normalizedClaimCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashClaimCode(value: string) {
  return createHash("sha256").update(normalizedClaimCode(value)).digest("hex");
}

function makeClaimCode() {
  const bytes = randomBytes(12);
  const raw = Array.from(bytes, (byte) => claimAlphabet[byte % claimAlphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export async function issueVehicleHandoffClaim(vehicleId: string) {
  const parsedId = z.string().uuid().safeParse(vehicleId);
  if (!parsedId.success) return { error: "Vehicle not found", data: null };
  const profileId = await currentProfileId();
  if (!profileId) return { error: "Sign in to create a buyer claim code.", data: null };

  const code = makeClaimCode();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("issue_vehicle_handoff_claim", {
    p_vehicle_id: parsedId.data,
    p_seller_profile_id: profileId,
    p_claim_code_hash: hashClaimCode(code),
  });
  const claim = data?.[0];
  if (error || !claim) {
    return { error: "A claim code could not be created. Confirm the vehicle is marked sold and has a full VIN.", data: null };
  }

  return {
    error: null,
    data: {
      code,
      expiresAt: claim.claim_expires_at,
    },
  };
}

export async function claimVehicleHandoff(input: { code: string; vin: string }) {
  const parsed = claimInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message, code: "invalid" as const, data: null };
  const profileId = await currentProfileId();
  if (!profileId) return { error: "Sign in to claim this vehicle.", code: "not_authenticated" as const, data: null };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_vehicle_handoff", {
    p_buyer_profile_id: profileId,
    p_claim_code_hash: hashClaimCode(parsed.data.code),
    p_vin: parsed.data.vin,
  });
  const result = data?.[0];
  if (error || !result) {
    return { error: "The vehicle could not be claimed. Please try again.", code: "failed" as const, data: null };
  }

  if (result.outcome === "rate_limited") {
    return { error: "Too many claim attempts. Wait an hour before trying again.", code: "rate_limited" as const, data: null };
  }
  if (result.outcome === "duplicate_vin") {
    return { error: "This vehicle is already in your Garage.", code: "duplicate_vin" as const, data: null };
  }
  if (result.outcome === "same_owner") {
    return { error: "You cannot claim a vehicle from your own sold record.", code: "same_owner" as const, data: null };
  }
  if (result.outcome !== "success" || !result.vehicle_id) {
    return { error: "The claim code or VIN does not match, has expired, or was already used.", code: "invalid" as const, data: null };
  }

  revalidatePath("/dashboard/vehicles");
  return { error: null, code: "success" as const, data: { vehicleId: result.vehicle_id } };
}
