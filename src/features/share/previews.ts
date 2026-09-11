// Anonymous-audience previews for share cards (plan 15.4). Backed by
// service-only RPCs that apply the same visibility rules as everything else;
// the web pages use them for Open Graph tags and for the signed-out shell.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { NEUTRAL_SHARE_CARD, shareCardTitle, sharePath } from "@/lib/share/links";

const POST_TYPE_LABEL: Record<string, string> = { question: "Question", general: "Post" };

export type ShareCard = { title: string; description: string; path: string; available: boolean };

export async function getPostSharePreview(postId: string) {
  const { data, error } = await createAdminClient().rpc("community_post_share_preview", { p_post_id: postId });
  if (error) {
    console.error("community_post_share_preview failed", error.message);
    return null;
  }
  return data?.[0] ?? null;
}

export async function getGroupSharePreview(slug: string) {
  const { data, error } = await createAdminClient().rpc("community_group_share_preview", { p_slug: slug });
  if (error) {
    console.error("community_group_share_preview failed", error.message);
    return null;
  }
  return data?.[0] ?? null;
}

export async function getProfileSharePreview(username: string) {
  const { data, error } = await createAdminClient().rpc("profile_share_preview", { p_username: username });
  if (error) {
    console.error("profile_share_preview failed", error.message);
    return null;
  }
  return data?.[0] ?? null;
}

export async function postShareCard(postId: string): Promise<ShareCard> {
  const path = sharePath({ kind: "post", id: postId });
  const preview = await getPostSharePreview(postId);
  if (!preview) return { ...NEUTRAL_SHARE_CARD, path, available: false };
  const kind = POST_TYPE_LABEL[preview.post_type] ?? "Post";
  const bits = [preview.excerpt, preview.vehicle_label ? `About a ${preview.vehicle_label}` : null,
    preview.media_count > 0 ? `${preview.media_count} photo${preview.media_count === 1 ? "" : "s"}` : null]
    .filter(Boolean);
  return {
    title: shareCardTitle({ kind: "post", id: postId }, `${kind} by ${preview.author_label}`),
    description: bits.join(" · ") || "A PerfectPPI Community post.",
    path,
    available: true,
  };
}

export async function groupShareCard(slug: string): Promise<ShareCard> {
  const path = sharePath({ kind: "group", slug });
  const preview = await getGroupSharePreview(slug);
  if (!preview) return { ...NEUTRAL_SHARE_CARD, path, available: false };
  const members = `${preview.member_count} member${preview.member_count === 1 ? "" : "s"}`;
  return {
    title: shareCardTitle({ kind: "group", slug }, preview.name),
    description: `${preview.visibility === "private" ? "Private group" : "Public group"} · ${members}. ${preview.description}`.slice(0, 200),
    path,
    available: true,
  };
}

export async function profileShareCard(username: string): Promise<ShareCard> {
  const path = sharePath({ kind: "profile", username });
  const preview = await getProfileSharePreview(username);
  if (!preview) return { ...NEUTRAL_SHARE_CARD, path, available: false };
  const name = preview.display_name?.trim() || `@${preview.username}`;
  return {
    title: shareCardTitle({ kind: "profile", username }, name),
    description: (preview.bio?.trim() || (preview.is_technician ? "Technician on PerfectPPI." : "Member of the PerfectPPI Community.")).slice(0, 200),
    path,
    available: true,
  };
}
