"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Database } from "@/types/database";

const packageItemSchema = z.object({
  type: z.enum(["image", "video", "file"]),
  url: z.string().url(),
  name: z.string().trim().min(1).max(255).optional(),
});

const mediaPackageSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  ppiSubmissionId: z.string().uuid().optional(),
  items: z.array(packageItemSchema).min(1),
});

const updateMediaPackageSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  items: z.array(packageItemSchema).min(1).optional(),
});

const createShareLinkSchema = z.object({
  targetType: z.enum(["media_package", "inspection_result", "standardized_output"]),
  targetId: z.string().uuid(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

type ShareTargetType = Database["public"]["Tables"]["share_links"]["Row"]["target_type"];

async function getAuthProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return null;
  return { supabase, profile };
}

async function canAccessSubmission(supabase: Awaited<ReturnType<typeof createClient>>, submissionId: string) {
  const { data, error } = await supabase.rpc("can_access_submission", {
    submission_id: submissionId,
  });

  if (error) return false;
  return !!data;
}

function buildSharePayload(targetType: ShareTargetType, targetId: string) {
  if (targetType === "media_package") {
    return {
      target_type: targetType,
      media_package_id: targetId,
      ppi_submission_id: null,
      standardized_output_id: null,
    };
  }

  if (targetType === "inspection_result") {
    return {
      target_type: targetType,
      media_package_id: null,
      ppi_submission_id: targetId,
      standardized_output_id: null,
    };
  }

  return {
    target_type: targetType,
    media_package_id: null,
    ppi_submission_id: null,
    standardized_output_id: targetId,
  };
}

export async function createMediaPackage(input: {
  title: string;
  description?: string;
  ppiSubmissionId?: string;
  items: { type: "image" | "video" | "file"; url: string; name?: string }[];
}) {
  const parsed = mediaPackageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid media package payload" };
  }

  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const { supabase, profile } = auth;

  if (parsed.data.ppiSubmissionId) {
    const allowed = await canAccessSubmission(supabase, parsed.data.ppiSubmissionId);
    if (!allowed) return { error: "You do not have access to this inspection" };
  }

  const { data: pkg, error } = await supabase
    .from("media_packages")
    .insert({
      creator_id: profile.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      ppi_submission_id: parsed.data.ppiSubmissionId ?? null,
      items: parsed.data.items,
    })
    .select("id")
    .single();

  if (error || !pkg) {
    return { error: "Failed to create media package" };
  }

  revalidatePath("/dashboard/media");
  return { data: { mediaPackageId: pkg.id } };
}

export async function updateMediaPackage(input: {
  id: string;
  title?: string;
  description?: string;
  items?: { type: "image" | "video" | "file"; url: string; name?: string }[];
}) {
  const parsed = updateMediaPackageSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid update payload" };

  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const { supabase, profile } = auth;

  const { data: existing } = await supabase
    .from("media_packages")
    .select("id")
    .eq("id", parsed.data.id)
    .eq("creator_id", profile.id)
    .maybeSingle();

  if (!existing) return { error: "Media package not found" };

  const { error } = await supabase
    .from("media_packages")
    .update({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
      ...(parsed.data.items !== undefined ? { items: parsed.data.items } : {}),
    })
    .eq("id", parsed.data.id);

  if (error) return { error: "Failed to update media package" };

  revalidatePath("/dashboard/media");
  return { success: true };
}

export async function deleteMediaPackage(id: string) {
  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const { supabase, profile } = auth;

  const { error } = await supabase
    .from("media_packages")
    .delete()
    .eq("id", id)
    .eq("creator_id", profile.id);

  if (error) return { error: "Failed to delete media package" };

  revalidatePath("/dashboard/media");
  return { success: true };
}

export async function createShareLink(input: {
  targetType: ShareTargetType;
  targetId: string;
  expiresAt?: string;
}) {
  const parsed = createShareLinkSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid share-link payload" };

  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const { supabase, profile } = auth;

  if (parsed.data.targetType === "media_package") {
    const { data: pkg } = await supabase
      .from("media_packages")
      .select("id")
      .eq("id", parsed.data.targetId)
      .eq("creator_id", profile.id)
      .maybeSingle();

    if (!pkg) return { error: "Media package not found" };
  }

  if (parsed.data.targetType === "inspection_result") {
    const allowed = await canAccessSubmission(supabase, parsed.data.targetId);
    if (!allowed) return { error: "Inspection is not accessible" };
  }

  if (parsed.data.targetType === "standardized_output") {
    const { data: output } = await supabase
      .from("standardized_outputs")
      .select("ppi_submission_id")
      .eq("id", parsed.data.targetId)
      .maybeSingle();

    if (!output) return { error: "Standardized output not found" };

    const allowed = await canAccessSubmission(supabase, output.ppi_submission_id);
    if (!allowed) return { error: "Standardized output is not accessible" };
  }

  const payload = buildSharePayload(parsed.data.targetType, parsed.data.targetId);

  // Keep only one active share link per target.
  // Generating a new link revokes previous tokens for the same resource.
  let revokeQuery = supabase
    .from("share_links")
    .delete()
    .eq("target_type", parsed.data.targetType);

  if (parsed.data.targetType === "media_package") {
    revokeQuery = revokeQuery.eq("media_package_id", parsed.data.targetId);
  } else if (parsed.data.targetType === "inspection_result") {
    revokeQuery = revokeQuery.eq("ppi_submission_id", parsed.data.targetId);
  } else {
    revokeQuery = revokeQuery.eq("standardized_output_id", parsed.data.targetId);
  }

  await revokeQuery;

  const { data: link, error } = await supabase
    .from("share_links")
    .insert({
      ...payload,
      expires_at: parsed.data.expiresAt ?? null,
    })
    .select("id, token")
    .single();

  if (error || !link) return { error: "Failed to create share link" };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  revalidatePath("/dashboard/media");
  return {
    data: {
      id: link.id,
      token: link.token,
      url: `${siteUrl}/share/${link.token}`,
    },
  };
}
