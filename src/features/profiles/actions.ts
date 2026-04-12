"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { slugify } from "@/lib/utils/formatting";
import { getRoleHomePath } from "@/features/auth/routing";

const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, hyphens, underscores")
    .optional(),
  bio: z.string().max(500).optional(),
  avatar_url: z.string().url().optional().or(z.literal("")),
  is_public: z.boolean().optional(),
});

const certificationLevelSchema = z.enum([
  "none",
  "ase",
  "master",
  "oem_qualified",
]);

const technicianAccessSchema = z.object({
  certification_level: certificationLevelSchema.default("none"),
  specialties: z.string().max(500).optional(),
});

const organizationAccessSchema = z.object({
  organization_name: z.string().min(2).max(200),
  organization_description: z.string().max(1000).optional(),
  certification_level: certificationLevelSchema.default("none"),
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

async function getUniqueOrganizationSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationName: string
) {
  const baseSlug = slugify(organizationName) || "organization";

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (!data) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now()}`;
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

  const { error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("auth_user_id", user.id);

  if (error) {
    if (error.code === "23505" && error.message.includes("username")) {
      return { error: "Username is already taken" };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/tech/profile");
  revalidatePath("/org/profile");
  return { success: true };
}

export async function enableTechnicianAccess(formData: FormData) {
  const parsed = technicianAccessSchema.safeParse({
    certification_level:
      (formData.get("certification_level") as string) || "none",
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
        certification_level: parsed.data.certification_level,
        specialties,
        is_independent: true,
      },
      { onConflict: "profile_id" }
    );

  if (techProfileError) {
    return { error: techProfileError.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role: "technician" })
    .eq("id", profile.id);

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

  const { error } = await supabase
    .from("profiles")
    .update({ role: "consumer" })
    .eq("id", profile.id);

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
    certification_level:
      (formData.get("certification_level") as string) || "none",
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
        certification_level: parsed.data.certification_level,
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

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role: "org_manager" })
    .eq("id", profile.id);

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
