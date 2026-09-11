import "server-only";

import { redirect } from "next/navigation";
import { requireRole } from "@/features/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

// Moderator capabilities (plan 18.1). The admin role is only the route-level
// entry ticket to /admin; every moderation action additionally needs an
// explicit, audited grant. The SQL functions re-check the same grants, so a
// UI bypass never widens authority.

export { MODERATION_CAPABILITIES, CAPABILITY_LABELS, type ModerationCapability } from "./capability-codes";
import { MODERATION_CAPABILITIES, type ModerationCapability } from "./capability-codes";

export type CapabilitySet = ReadonlySet<ModerationCapability>;

export async function getModerationCapabilities(profileId: string): Promise<CapabilitySet> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("moderation_role_grants")
    .select("capability")
    .eq("profile_id", profileId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  const candidates = (data ?? [])
    .map((row) => row.capability)
    .filter((value): value is ModerationCapability =>
      (MODERATION_CAPABILITIES as readonly string[]).includes(value),
    );
  if (candidates.length === 0) return new Set();
  // moderation_has_capability() = active grant AND an available (claimed,
  // unsuspended) holder; the grant list above already covers the first half,
  // so one availability check replaces a round trip per capability.
  const { data: available, error: availabilityError } = await admin.rpc("social_profile_is_available", {
    p_profile_id: profileId,
  });
  if (availabilityError) throw new Error(availabilityError.message);
  return available ? new Set(candidates) : new Set();
}

/**
 * Route guard for moderation pages: admin role plus the named capability.
 * Redirects to the access page when the grant is missing so an ungranted
 * admin sees why rather than an empty queue.
 */
export async function requireModerationCapability(capability: ModerationCapability) {
  const profile = await requireRole(["admin"]);
  const capabilities = await getModerationCapabilities(profile.id);
  if (!capabilities.has(capability)) {
    redirect(`/admin/moderation/access?missing=${capability}`);
  }
  return { profile, capabilities };
}

/** Non-redirecting variant for API routes. */
export async function hasModerationCapability(profileId: string, capability: ModerationCapability) {
  const { data, error } = await createAdminClient().rpc("moderation_has_capability", {
    p_profile_id: profileId,
    p_capability: capability,
  });
  return !error && data === true;
}
