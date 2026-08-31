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
  const { data } = await query.limit(100);
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
