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
  const effective = await Promise.all(candidates.map(async (capability) => {
    const { data: allowed, error: capabilityError } = await admin.rpc("moderation_has_capability", {
      p_profile_id: profileId,
      p_capability: capability,
    });
    if (capabilityError) throw new Error(capabilityError.message);
    return allowed ? capability : null;
  }));
  return new Set(effective.filter((value): value is ModerationCapability => Boolean(value)));
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
