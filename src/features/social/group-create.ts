// Member-created groups (plan 13.2, Phase 1C first slice): Public / Open
// only, behind the `group_creation` flag. The database enforces account age,
// enforcement state, rate limits, and slug uniqueness; this module validates
// shape, checks the flag, and maps outcomes to sentences.
import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_UNAVAILABLE_MESSAGE, isFeatureEnabled } from "@/lib/feature-flags";

import { GROUP_CATEGORIES } from "@/lib/social/group-options";

export { GROUP_CATEGORIES, GROUP_CATEGORY_LABELS, type GroupCategory } from "@/lib/social/group-options";

const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens").min(3).max(64);

export const groupSettingsSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  description: z.string().trim().min(1, "Add a short description").max(500),
  category: z.enum(GROUP_CATEGORIES),
  rules: z.array(z.string().trim().min(1).max(200)).max(12, "Add up to 12 rules"),
  vehicleMake: z.string().trim().max(64).optional().or(z.literal("")),
  vehicleModel: z.string().trim().max(64).optional().or(z.literal("")),
  yearStart: z.coerce.number().int().min(1886).max(2100).optional().nullable(),
  yearEnd: z.coerce.number().int().min(1886).max(2100).optional().nullable(),
  locationRegion: z.string().trim().max(80).optional().or(z.literal("")),
  postingPolicy: z.enum(["members", "moderators"]).default("members"),
}).refine((value) => !value.yearStart || !value.yearEnd || value.yearStart <= value.yearEnd, {
  message: "The first year must not be after the last year",
  path: ["yearEnd"],
});

export const createGroupSchema = groupSettingsSchema.and(z.object({ slug: slugSchema }));

export type GroupCreateOutcome =
  | "invalid" | "feature_unavailable" | "account_too_new" | "restricted" | "rate_limited" | "slug_taken" | "forbidden" | "failed";

export const GROUP_CREATE_MESSAGES: Record<Exclude<GroupCreateOutcome, "invalid">, string> = {
  feature_unavailable: FEATURE_UNAVAILABLE_MESSAGE.group_creation ?? "Creating groups is not available yet.",
  account_too_new: "New accounts can join groups right away and create their own after one week.",
  restricted: "Group creation is unavailable for this account while a posting restriction is active.",
  rate_limited: "You have created a lot of groups recently. You can create up to two per day and own up to five.",
  slug_taken: "That group address is already taken. Choose a different one.",
  forbidden: "Only the group owner can change these settings.",
  failed: "The group could not be saved. Please try again.",
};

export type GroupCreateResult =
  | { ok: true; slug: string; id: string }
  | { ok: false; outcome: GroupCreateOutcome; message: string };

async function currentProfileId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username_state")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return profile?.username_state === "claimed" ? profile.id : null;
}

function classify(error: { code?: string; message?: string }): GroupCreateResult {
  const message = error.message ?? "";
  const outcome: GroupCreateOutcome =
    message.includes("group_creation_account_too_new") ? "account_too_new"
      : message.includes("group_creation_restricted") ? "restricted"
        : message.includes("group_creation_rate_limited") ? "rate_limited"
          : message.includes("group_slug_taken") || error.code === "23505" ? "slug_taken"
            : error.code === "42501" ? "forbidden"
              : "failed";
  if (outcome === "failed") console.warn("group create/update failed", { code: error.code, message: message.slice(0, 300) });
  return { ok: false, outcome, message: GROUP_CREATE_MESSAGES[outcome] };
}

export function parseRulesInput(raw: string): string[] {
  return raw.split("\n").map((rule) => rule.trim()).filter(Boolean);
}

export async function groupCreationEnabled() {
  return (await isFeatureEnabled("groups")) && (await isFeatureEnabled("group_creation"));
}

export async function createCommunityGroup(input: unknown): Promise<GroupCreateResult> {
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, outcome: "invalid", message: parsed.error.errors[0]?.message ?? "Check the group details." };
  if (!(await groupCreationEnabled())) {
    return { ok: false, outcome: "feature_unavailable", message: GROUP_CREATE_MESSAGES.feature_unavailable };
  }
  const actorId = await currentProfileId();
  if (!actorId) return { ok: false, outcome: "forbidden", message: "Sign in to create a group." };

  const { data, error } = await createAdminClient().rpc("create_community_group", {
    p_actor_profile_id: actorId,
    p_slug: parsed.data.slug,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_category: parsed.data.category,
    p_rules: parsed.data.rules,
    p_vehicle_make: parsed.data.vehicleMake || null,
    p_vehicle_model: parsed.data.vehicleModel || null,
    p_year_start: parsed.data.yearStart ?? null,
    p_year_end: parsed.data.yearEnd ?? null,
    p_location_region: parsed.data.locationRegion || null,
    p_posting_policy: parsed.data.postingPolicy,
  });
  if (error || !data) return classify(error ?? {});
  revalidatePath("/community/groups");
  return { ok: true, slug: data.slug, id: data.id };
}

export async function updateCommunityGroupSettings(groupId: string, input: unknown): Promise<GroupCreateResult> {
  const parsed = groupSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, outcome: "invalid", message: parsed.error.errors[0]?.message ?? "Check the group details." };
  if (!(await isFeatureEnabled("groups"))) {
    return { ok: false, outcome: "feature_unavailable", message: FEATURE_UNAVAILABLE_MESSAGE.groups ?? "Groups are not available yet." };
  }
  const actorId = await currentProfileId();
  if (!actorId) return { ok: false, outcome: "forbidden", message: "Sign in to manage groups." };

  const { data, error } = await createAdminClient().rpc("update_community_group_settings", {
    p_actor_profile_id: actorId,
    p_group_id: groupId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_category: parsed.data.category,
    p_rules: parsed.data.rules,
    p_vehicle_make: parsed.data.vehicleMake || null,
    p_vehicle_model: parsed.data.vehicleModel || null,
    p_year_start: parsed.data.yearStart ?? null,
    p_year_end: parsed.data.yearEnd ?? null,
    p_location_region: parsed.data.locationRegion || null,
    p_posting_policy: parsed.data.postingPolicy,
  });
  if (error || !data) return classify(error ?? {});
  revalidatePath("/community/groups");
  revalidatePath(`/community/groups/${data.slug}`);
  return { ok: true, slug: data.slug, id: data.id };
}
