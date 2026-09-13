import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST_TYPES } from "@/lib/community/post-types";
import { getCurrentSocialProfileId } from "@/features/social/relationships";

const feedMuteMutationSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("group"),
    groupId: z.string().uuid(),
    muted: z.boolean(),
  }).strict(),
  z.object({
    scope: z.literal("post_type"),
    postType: z.enum(POST_TYPES),
    muted: z.boolean(),
  }).strict(),
  z.object({
    scope: z.literal("vehicle_topic"),
    vehicleMake: z.string().trim().min(1).max(60),
    vehicleModel: z.string().trim().max(60).nullable().optional(),
    muted: z.boolean(),
  }).strict(),
]);

export type FeedMuteMutation = z.infer<typeof feedMuteMutationSchema>;

export async function setCommunityFeedMute(input: unknown) {
  const parsed = feedMuteMutationSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid feed preference." };

  const profileId = await getCurrentSocialProfileId();
  if (!profileId) return { error: "Sign in to change feed preferences." };

  const value = parsed.data;
  const { data, error } = await createAdminClient().rpc("set_community_feed_mute", {
    p_actor_profile_id: profileId,
    p_scope: value.scope,
    p_muted: value.muted,
    p_group_id: value.scope === "group" ? value.groupId : null,
    p_post_type: value.scope === "post_type" ? value.postType : null,
    p_vehicle_make: value.scope === "vehicle_topic" ? value.vehicleMake : null,
    p_vehicle_model: value.scope === "vehicle_topic" ? value.vehicleModel ?? null : null,
  });

  if (error || data === null) return { error: "This feed preference could not be saved." };
  revalidatePath("/community");
  return { data: { scope: value.scope, muted: data } };
}

export async function getMyCommunityFeedMutes() {
  const profileId = await getCurrentSocialProfileId();
  if (!profileId) return [];

  const { data, error } = await createAdminClient()
    .from("community_feed_mutes")
    .select("id, scope, group_id, post_type, vehicle_make, vehicle_model, created_at, group:community_groups(name)")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("community feed preferences failed", error.message);
    return [];
  }
  return data ?? [];
}
