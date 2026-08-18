"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRoleHomePath } from "@/features/auth/routing";
import { getUniqueOrganizationSlug } from "@/features/organizations/slug";
import { SWITCHABLE_ROLES, type UserRole } from "@/types/enums";

const switchRoleSchema = z.enum(SWITCHABLE_ROLES);

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The technician and org portals read rows that ordinary onboarding creates on
 * the way in — a technician_profile, an organization, a manager membership. A
 * developer skips that onboarding, so switching has to leave the same rows
 * behind or the portal lands on an empty page or bounces straight back out
 * (/org/settings redirects to /login when getMyOrg returns nothing).
 *
 * Both helpers are idempotent: switching away and back reuses what is already
 * there rather than piling up duplicate orgs.
 */
async function ensureTechnicianProfile(
  supabase: ServerClient,
  profileId: string
) {
  const { data: existing, error: readError } = await supabase
    .from("technician_profiles")
    .select("id, organization_id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (readError) return { error: readError.message };
  if (existing) return { techProfile: existing };

  const { data: created, error } = await supabase
    .from("technician_profiles")
    .insert({
      profile_id: profileId,
      certification_level: "none",
      specialties: [],
      is_independent: true,
    })
    .select("id, organization_id")
    .single();

  if (error || !created) {
    return { error: error?.message ?? "Failed to create technician profile" };
  }

  return { techProfile: created };
}

async function ensureOrganization(
  supabase: ServerClient,
  profileId: string,
  displayName: string | null
) {
  const techResult = await ensureTechnicianProfile(supabase, profileId);
  if ("error" in techResult) return techResult;

  const { techProfile } = techResult;
  let organizationId = techProfile.organization_id;

  if (!organizationId) {
    const name = displayName?.trim()
      ? `${displayName.trim()} Workspace`
      : "Developer Workspace";
    const slug = await getUniqueOrganizationSlug(supabase, name);

    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name,
        slug,
        description: "Created automatically for developer role switching.",
      })
      .select("id")
      .single();

    if (orgError || !organization) {
      return { error: orgError?.message ?? "Failed to create organization" };
    }

    organizationId = organization.id;

    // Has to land before the membership insert: org_memberships_insert_manager_self
    // only passes once the technician profile already points at the org.
    const { error: attachError } = await supabase
      .from("technician_profiles")
      .update({ organization_id: organizationId, is_independent: false })
      .eq("id", techProfile.id);

    if (attachError) return { error: attachError.message };
  }

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("technician_profile_id")
    .eq("technician_profile_id", techProfile.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!membership) {
    const { error: membershipError } = await supabase
      .from("organization_memberships")
      .insert({
        technician_profile_id: techProfile.id,
        organization_id: organizationId,
        role: "manager",
      });

    if (membershipError) return { error: membershipError.message };
  }

  return { organizationId };
}

/**
 * Switch the calling account's role. Only accounts holding the developer grant
 * may do this; everyone else keeps the narrow, one-way upgrade paths in
 * features/profiles/actions.
 */
export async function switchRole(role: UserRole) {
  const parsed = switchRoleSchema.safeParse(role);
  if (!parsed.success) {
    return { error: "Unknown role" };
  }

  const targetRole = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_developer, display_name")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" };
  }

  if (!profile.is_developer) {
    return { error: "Developer access required." };
  }

  if (profile.role === targetRole) {
    return { success: true, redirectTo: getRoleHomePath(targetRole) };
  }

  if (targetRole === "technician") {
    const result = await ensureTechnicianProfile(supabase, profile.id);
    if ("error" in result) return { error: result.error };
  }

  if (targetRole === "org_manager") {
    const result = await ensureOrganization(
      supabase,
      profile.id,
      profile.display_name
    );
    if ("error" in result) return { error: result.error };
  }

  // Goes through the RPC rather than a direct update: profiles.role is
  // immutable from the client, and dev_switch_role re-checks the developer
  // grant in the database. The is_developer read above is only there to keep
  // the switcher out of ordinary accounts' settings pages.
  const { error } = await supabase.rpc("dev_switch_role", {
    p_role: targetRole,
  });

  if (error) {
    return { error: error.message };
  }

  // A switch changes what every portal renders, so the whole tree is stale —
  // not just the settings page the click came from.
  revalidatePath("/", "layout");

  return { success: true, redirectTo: getRoleHomePath(targetRole) };
}
