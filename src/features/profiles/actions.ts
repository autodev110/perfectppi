"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getRoleHomePath } from "@/features/auth/routing";
import { getUniqueOrganizationSlug } from "@/features/organizations/slug";

const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatar_url: z.string().url().optional().or(z.literal("")),
  is_public: z.boolean().optional(),
  default_post_audience: z.enum(["public", "friends"]).optional(),
  discoverable: z.boolean().optional(),
  allow_exact_username_lookup: z.boolean().optional(),
  friend_request_policy: z.enum(["everyone", "friends_of_friends", "nobody"]).optional(),
  allow_friend_messages: z.boolean().optional(),
  allow_group_message_requests: z.boolean().optional(),
  mention_policy: z.enum(["everyone", "friends_and_groups", "friends", "nobody"]).optional(),
});

const technicianAccessSchema = z.object({
  specialties: z.string().max(500).optional(),
});

const organizationAccessSchema = z.object({
  organization_name: z.string().min(2).max(200),
  organization_description: z.string().max(1000).optional(),
  specialties: z.string().max(500).optional(),
});

function normalizeSpecialties(input?: string) {
  if (!input) return [];

  return [...new Set(
    input
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}

async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" as const };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" as const };
  }

  return { supabase, profile };
}

export async function updateProfile(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value !== "") {
      raw[key] = value;
    }
  }
  raw.is_public =
    formData.get("is_public") === "true" || formData.get("is_public") === "on";
  raw.discoverable =
    formData.get("discoverable") === "true" || formData.get("discoverable") === "on";
  raw.allow_exact_username_lookup =
    formData.get("allow_exact_username_lookup") === "true" ||
    formData.get("allow_exact_username_lookup") === "on";
  raw.allow_friend_messages =
    formData.get("allow_friend_messages") === "true" ||
    formData.get("allow_friend_messages") === "on";
  raw.allow_group_message_requests =
    formData.get("allow_group_message_requests") === "true" ||
    formData.get("allow_group_message_requests") === "on";

  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const {
    is_public,
    default_post_audience,
    discoverable,
    allow_exact_username_lookup,
    friend_request_policy,
    allow_friend_messages,
    allow_group_message_requests,
    mention_policy,
    ...profileUpdates
  } = parsed.data;

  const { error } = await supabase
    .from("profiles")
    .update(profileUpdates)
    .eq("auth_user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  const { error: privacyError } = await supabase.rpc("set_own_social_privacy", {
    p_is_public: is_public ?? false,
    p_default_post_audience: is_public
      ? (default_post_audience ?? "public")
      : "friends",
    p_discoverable: discoverable ?? true,
    p_allow_exact_username_lookup: allow_exact_username_lookup ?? true,
    p_friend_request_policy: friend_request_policy ?? null,
    p_allow_friend_messages: allow_friend_messages ?? true,
    p_allow_group_message_requests: allow_group_message_requests ?? false,
    p_mention_policy: mention_policy ?? "friends_and_groups",
  });
  if (privacyError) return { error: "Privacy settings could not be updated" };

  revalidatePath("/dashboard/profile");
  revalidatePath("/tech/profile");
  revalidatePath("/org/profile");
  return { success: true };
}

export async function enableTechnicianAccess(formData: FormData) {
  const parsed = technicianAccessSchema.safeParse({
    specialties: (formData.get("specialties") as string) || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const auth = await getCurrentProfile();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const { supabase, profile } = auth;

  if (profile.role === "admin") {
    return { error: "Admin access must be provisioned separately." };
  }

  if (profile.role === "technician") {
    return { success: true, redirectTo: getRoleHomePath(profile.role) };
  }

  if (profile.role === "org_manager") {
    return { success: true, redirectTo: getRoleHomePath(profile.role) };
  }

  const specialties = normalizeSpecialties(parsed.data.specialties);

  const { error: techProfileError } = await supabase
    .from("technician_profiles")
    .upsert(
      {
        profile_id: profile.id,
        specialties,
        is_independent: true,
      },
      { onConflict: "profile_id" }
    );

  if (techProfileError) {
    return { error: techProfileError.message };
  }

  // profiles.role is immutable from the client; set_own_role re-checks that the
  // technician profile above actually exists before granting the role.
  const { error: profileError } = await supabase.rpc("set_own_role", {
    p_role: "technician",
  });

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/tech");
  revalidatePath("/tech/profile");

  return {
    success: true,
    redirectTo: getRoleHomePath("technician"),
  };
}

export async function switchToConsumer() {
  const auth = await getCurrentProfile();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const { supabase, profile } = auth;

  if (profile.role === "consumer") {
    return { success: true };
  }

  if (profile.role === "admin") {
    return { error: "Admin role cannot be changed here." };
  }

  const { error } = await supabase.rpc("set_own_role", { p_role: "consumer" });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");

  return { success: true, redirectTo: "/dashboard" };
}

export async function createOrganizationWorkspace(formData: FormData) {
  const parsed = organizationAccessSchema.safeParse({
    organization_name: (formData.get("organization_name") as string) || "",
    organization_description:
      (formData.get("organization_description") as string) || undefined,
    specialties: (formData.get("specialties") as string) || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const auth = await getCurrentProfile();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const { supabase, profile } = auth;

  if (profile.role === "admin") {
    return { error: "Admin access must be provisioned separately." };
  }

  if (profile.role === "org_manager") {
    return { success: true, redirectTo: getRoleHomePath(profile.role) };
  }

  const { data: existingTechProfile } = await supabase
    .from("technician_profiles")
    .select("id, organization_id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (existingTechProfile?.organization_id) {
    return { error: "This account is already attached to an organization." };
  }

  const slug = await getUniqueOrganizationSlug(
    supabase,
    parsed.data.organization_name
  );

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .insert({
      name: parsed.data.organization_name,
      slug,
      description: parsed.data.organization_description ?? null,
    })
    .select("id")
    .single();

  if (organizationError || !organization) {
    return { error: organizationError?.message ?? "Failed to create organization" };
  }

  const specialties = normalizeSpecialties(parsed.data.specialties);

  const { data: techProfile, error: techProfileError } = await supabase
    .from("technician_profiles")
    .upsert(
      {
        profile_id: profile.id,
        organization_id: organization.id,
        specialties,
        is_independent: false,
      },
      { onConflict: "profile_id" }
    )
    .select("id")
    .single();

  if (techProfileError || !techProfile) {
    return { error: techProfileError?.message ?? "Failed to create technician profile" };
  }

  const { data: existingMembership } = await supabase
    .from("organization_memberships")
    .select("technician_profile_id")
    .eq("technician_profile_id", techProfile.id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!existingMembership) {
    const { error: membershipError } = await supabase
      .from("organization_memberships")
      .insert({
        technician_profile_id: techProfile.id,
        organization_id: organization.id,
        role: "manager",
      });

    if (membershipError) {
      return { error: membershipError.message };
    }
  }

  // set_own_role re-checks the technician profile, its organization link and the
  // manager membership created above before granting the role.
  const { error: profileError } = await supabase.rpc("set_own_role", {
    p_role: "org_manager",
  });

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/org");
  revalidatePath("/org/profile");
  revalidatePath("/org/settings");

  return {
    success: true,
    redirectTo: getRoleHomePath("org_manager"),
  };
}
