"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const postSchema = z.object({
  content: z.string().trim().min(1, "Write something before posting").max(1200),
  vehicleId: z.string().uuid().optional().nullable(),
  listingId: z.string().uuid().optional().nullable(),
});

const commentSchema = z.object({
  postId: z.string().uuid(),
  content: z.string().trim().min(1, "Write a comment first").max(600),
});

const statusSchema = z.enum(["active", "archived"]);

async function getCurrentProfileId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" as const };

  return { profileId: profile.id, role: profile.role };
}

function nullableUuid(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function createCommunityPost(formData: FormData) {
  return createCommunityPostFromInput({
    content: formData.get("content"),
    vehicleId: nullableUuid(formData.get("vehicle_id")),
    listingId: nullableUuid(formData.get("listing_id")),
  });
}

export async function createCommunityPostFromInput(input: unknown) {
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  const admin = createAdminClient();
  let vehicleId = parsed.data.vehicleId ?? null;
  const listingId = parsed.data.listingId ?? null;

  if (listingId) {
    const { data: listing } = await admin
      .from("marketplace_listings")
      .select("id, seller_id, vehicle_id, status")
      .eq("id", listingId)
      .single();

    if (!listing || listing.seller_id !== profile.profileId || listing.status !== "active") {
      return { error: "You can only share your own active listings" };
    }

    vehicleId = listing.vehicle_id;
  }

  if (vehicleId) {
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("id, owner_id, visibility")
      .eq("id", vehicleId)
      .single();

    if (!vehicle || vehicle.owner_id !== profile.profileId || vehicle.visibility !== "public") {
      return { error: "Only your public vehicles can be attached to community posts" };
    }
  }

  const { error } = await admin.from("community_posts").insert({
    author_id: profile.profileId,
    vehicle_id: vehicleId,
    marketplace_listing_id: listingId,
    content: parsed.data.content,
    status: "active",
  });

  if (error) return { error: error.message };

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");

  return { success: true };
}

export async function createCommunityComment(formData: FormData) {
  const result = await createCommunityCommentFromInput({
    postId: formData.get("post_id"),
    content: formData.get("content"),
  });

  if ("error" in result && result.error === "Not authenticated") {
    redirect("/login?redirect=/community");
  }
}

export async function createCommunityCommentFromInput(input: unknown) {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid comment" };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .select("id, status")
    .eq("id", parsed.data.postId)
    .eq("status", "active")
    .maybeSingle();

  if (!post) return { error: "Post not found" };

  const { data, error } = await admin.from("community_comments").insert({
    post_id: post.id,
    author_id: profile.profileId,
    content: parsed.data.content,
    status: "active",
  }).select("id").single();

  if (error) return { error: error.message };

  revalidatePath("/community");
  revalidatePath("/admin/community");
  return { data };
}

export async function archiveMyCommunityPost(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;

  await updateMyCommunityPostStatus(postId, "archived");
}

export async function restoreMyCommunityPost(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;

  await updateMyCommunityPostStatus(postId, "active");
}

export async function updateMyCommunityPostStatus(postId: string, status: "active" | "archived") {
  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  const admin = createAdminClient();
  const updates: { status: "active" | "archived"; updated_at?: string } = { status };
  if (status === "archived") updates.updated_at = new Date().toISOString();

  const { error } = await admin
    .from("community_posts")
    .update(updates)
    .eq("id", postId)
    .eq("author_id", profile.profileId);

  if (error) return { error: error.message };

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  return { success: true };
}

export async function deleteCommunityPost(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;

  await deleteCommunityPostById(postId);
}

export async function deleteCommunityPostById(postId: string) {
  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  const admin = createAdminClient();

  // Allow if admin or author
  const { data: post } = await admin
    .from("community_posts")
    .select("id, author_id")
    .eq("id", postId)
    .single();

  if (!post) return { error: "Post not found" };
  if (profile.role !== "admin" && post.author_id !== profile.profileId) {
    return { error: "Not authorized" };
  }

  const { error } = await admin.from("community_posts").delete().eq("id", postId);
  if (error) return { error: error.message };

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  return { success: true };
}

export async function updateCommunityPostStatus(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const parsedStatus = statusSchema.safeParse(formData.get("status"));
  if (!postId || !parsedStatus.success) return;

  const profile = await getCurrentProfileId();
  if ("error" in profile || profile.role !== "admin") return;

  const admin = createAdminClient();
  const updates: { status: "active" | "archived"; updated_at?: string } = { status: parsedStatus.data };
  if (parsedStatus.data === "archived") updates.updated_at = new Date().toISOString();

  await admin
    .from("community_posts")
    .update(updates)
    .eq("id", postId);

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
}
