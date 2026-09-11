"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/features/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

const categoryCodes = [
  "make_model", "technical", "detailing", "off_road", "restoration",
  "track", "classics", "ev", "local_club", "general",
] as const;

const createSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(64),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(1).max(500),
  category: z.enum(categoryCodes),
  rules: z.string().max(2400),
  vehicleMake: z.string().trim().max(64).optional(),
  vehicleModel: z.string().trim().max(64).optional(),
});

export async function createCuratedCommunityGroup(formData: FormData) {
  const actor = await requireRole(["admin"]);
  const parsed = createSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description"),
    category: formData.get("category"),
    rules: formData.get("rules") ?? "",
    vehicleMake: formData.get("vehicle_make") || undefined,
    vehicleModel: formData.get("vehicle_model") || undefined,
  });
  if (!parsed.success) {
    redirect(`/admin/community/groups?error=${encodeURIComponent(parsed.error.errors[0].message)}`);
  }

  const rules = parsed.data.rules.split("\n").map((rule) => rule.trim()).filter(Boolean);
  if (rules.length > 12 || rules.some((rule) => rule.length > 200)) {
    redirect("/admin/community/groups?error=Add+up+to+12+rules%2C+200+characters+each");
  }
  const { error } = await createAdminClient().rpc("create_curated_community_group", {
    p_actor_profile_id: actor.id,
    p_slug: parsed.data.slug,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_category: parsed.data.category,
    p_rules: rules,
    p_vehicle_make: parsed.data.vehicleMake ?? null,
    p_vehicle_model: parsed.data.vehicleModel ?? null,
    p_year_start: null,
    p_year_end: null,
  });
  if (error) {
    const message = error.code === "23505" ? "That group slug is already in use" : "Could not create the group";
    redirect(`/admin/community/groups?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/community/groups");
  revalidatePath("/admin/community/groups");
  redirect("/admin/community/groups?created=1");
}

const reviewSchema = z.object({
  groupId: z.string().uuid(),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
  username: z.string().trim().min(1).max(64).optional(),
});

// Plan 13.4 platform review: assign a willing member as owner, or archive.
// The RPCs require the content_decide capability and write audit events.
export async function reviewCommunityGroup(formData: FormData) {
  const actor = await requireRole(["admin"]);
  const decision = formData.get("decision") === "archive" ? "archive" : "assign_owner";
  const parsed = reviewSchema.safeParse({
    groupId: formData.get("group_id"),
    reason: formData.get("reason") ?? "",
    username: formData.get("username") || undefined,
  });
  if (!parsed.success) {
    redirect(`/admin/community/groups?error=${encodeURIComponent(parsed.error.errors[0].message)}`);
  }
  const admin = createAdminClient();

  if (decision === "assign_owner") {
    const handle = parsed.data.username?.replace(/^@/, "").toLowerCase();
    const { data: profile } = handle
      ? await admin.from("profiles").select("id").eq("username_normalized", handle).eq("username_state", "claimed").maybeSingle()
      : { data: null };
    if (!profile) redirect("/admin/community/groups?error=No+member+with+that+username+was+found");
    const { error } = await admin.rpc("platform_assign_group_owner", {
      p_actor_profile_id: actor.id,
      p_group_id: parsed.data.groupId,
      p_new_owner_profile_id: profile.id,
      p_reason: parsed.data.reason,
    });
    if (error) redirect(`/admin/community/groups?error=${encodeURIComponent(reviewError(error))}`);
  } else {
    const { error } = await admin.rpc("platform_archive_group", {
      p_actor_profile_id: actor.id,
      p_group_id: parsed.data.groupId,
      p_reason: parsed.data.reason,
    });
    if (error) redirect(`/admin/community/groups?error=${encodeURIComponent(reviewError(error))}`);
  }
  revalidatePath("/community/groups");
  revalidatePath("/admin/community/groups");
  redirect("/admin/community/groups?reviewed=1");
}

function reviewError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  if (message.includes("moderation capability required")) return "You need the content_decide moderation capability for group stewardship";
  if (message.includes("already has an available owner")) return "This group already has an available owner";
  if (message.includes("must be an available active member")) return "The new owner must be an available, active member of the group";
  if (message.includes("group unavailable")) return "This group is no longer active";
  console.warn("group platform review failed", { code: error.code, message: message.slice(0, 200) });
  return "The review action could not be applied";
}
