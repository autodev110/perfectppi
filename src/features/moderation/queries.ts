import { createAdminClient } from "@/lib/supabase/admin";

export async function getModerationQueue(status: "pending_review" | "rejected" | "legal_hold" | "all" = "pending_review") {
  const admin = createAdminClient();
  let query = admin
    .from("moderation_items")
    .select(`
      *,
      author:profiles!moderation_items_author_id_fkey(id, display_name, username, avatar_url),
      appeals:moderation_appeals!moderation_appeals_moderation_item_id_fkey(*)
    `)
    .order("created_at", { ascending: true });

  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query.limit(100);
  if (error) throw new Error(error.message);
  const items = data ?? [];
  const entityIds = items.map((item) => item.entity_id);
  const mediaIds = items
    .filter((item) => item.entity_type === "community_post_media")
    .map((item) => item.entity_id);
  const [{ data: reports }, { data: media }] = await Promise.all([
    entityIds.length
      ? admin.from("moderation_reports")
        .select("id, entity_type, entity_id, reason_code, details, created_at")
        .in("entity_id", entityIds)
        .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    mediaIds.length
      ? admin.from("community_post_media")
        .select("id, media_type, content_type")
        .in("id", mediaIds)
      : Promise.resolve({ data: [] }),
  ]);

  return items.map((item) => ({
    ...item,
    reports: (reports ?? []).filter((report) =>
      report.entity_type === item.entity_type && report.entity_id === item.entity_id
    ),
    media: (media ?? []).find((entry) => entry.id === item.entity_id) ?? null,
  }));
}

export async function canReviewLegalHolds(profileId: string) {
  const { data, error } = await createAdminClient()
    .from("moderation_legal_hold_reviewers")
    .select("profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getEnforcementNotices(profileId: string) {
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("user_enforcement_actions")
    .select("id, action_type, reason_code, starts_at, ends_at, created_at")
    .eq("profile_id", profileId)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getModerationMetrics() {
  const admin = createAdminClient();
  const statuses = ["active", "pending_review", "rejected", "legal_hold"] as const;
  const counts = await Promise.all(statuses.map(async (status) => {
    const { count } = await admin
      .from("moderation_items")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    return [status, count ?? 0] as const;
  }));
  return Object.fromEntries(counts) as Record<(typeof statuses)[number], number>;
}
