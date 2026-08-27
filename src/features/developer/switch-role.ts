import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRoleHomePath } from "@/features/auth/routing";
import { getUniqueOrganizationSlug } from "@/features/organizations/slug";
import { SWITCHABLE_ROLES, type UserRole } from "@/types/enums";

const switchRoleSchema = z.enum(SWITCHABLE_ROLES);

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type TechProfileRef = { id: string; organization_id: string | null };

// Annotated explicitly rather than inferred. Inference gives each branch an
// optional counterpart (`error?: undefined`), which `in` narrowing does not
// strip — so `result.error` would come back as `string | undefined` at every
// call site.
type EnsureTechResult = { error: string } | { techProfile: TechProfileRef };
type EnsureOrgResult = { error: string } | { organizationId: string };

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
): Promise<EnsureTechResult> {
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
): Promise<EnsureOrgResult> {
  const techResult = await ensureTechnicianProfile(supabase, profileId);
  if ("error" in techResult) return { error: techResult.error };

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

export type RoleSwitchResult =
  | { error: string; status: number }
  | { profile: Record<string, unknown>; redirectTo: string };

/**
 * Core of the developer role switch, shared by the web server action and the
 * mobile API route so both clients enforce and provision identically.
 *
 * The caller's developer grant is re-checked in the database by
 * dev_switch_role; the read here only shapes the error message and decides
 * which scaffolding to run first.
 */
export async function performRoleSwitch(
  role: UserRole
): Promise<RoleSwitchResult> {
  const parsed = switchRoleSchema.safeParse(role);
  if (!parsed.success) {
    return { error: "Unknown role", status: 400 };
  }

  const targetRole = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_developer, display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return { error: "Profile not found", status: 404 };
  }

  if (!profile.is_developer) {
    return { error: "Developer access required.", status: 403 };
  }

  if (profile.role !== targetRole) {
    if (targetRole === "technician") {
      const result = await ensureTechnicianProfile(supabase, profile.id);
      if ("error" in result) return { error: result.error, status: 500 };
    }

    if (targetRole === "org_manager") {
      const result = await ensureOrganization(
        supabase,
        profile.id,
        profile.display_name
      );
      if ("error" in result) return { error: result.error, status: 500 };
    }

    // Goes through the RPC rather than a direct update: profiles.role is
    // immutable from the client, and dev_switch_role re-checks the developer
    // grant in the database.
    const { error } = await supabase.rpc("dev_switch_role", {
      p_role: targetRole,
    });

    if (error) return { error: error.message, status: 403 };
  }

  const { data: updated } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profile.id)
    .maybeSingle();

  return {
    profile: (updated ?? {}) as Record<string, unknown>,
    redirectTo: getRoleHomePath(targetRole),
  };
}
