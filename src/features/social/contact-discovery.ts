import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendsDiscoveryEnabled, type PeopleSearchResult } from "@/features/social/friends";
import { getCurrentSocialProfileId } from "@/features/social/relationships";

const requestSchema = z.object({
  hashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1).max(500),
}).strict();

export type ContactDiscoveryResult = PeopleSearchResult & { contact_hash: string };

export async function discoverContacts(input: unknown): Promise<{
  results?: ContactDiscoveryResult[];
  error?: string;
  retryAfter?: number;
}> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose contacts to look for first." };
  if (!(await friendsDiscoveryEnabled())) return { error: "Friend discovery is not available right now." };

  const profileId = await getCurrentSocialProfileId();
  if (!profileId) return { error: "Sign in to find contacts." };

  // Two ceilings: a burst limit so an address book of a few thousand entries
  // can be checked in batches, and a daily one so the endpoint cannot be used
  // to enumerate which emails or phone numbers belong to members.
  const windowMs = 60_000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const dayMs = 86_400_000;
  const dayStart = new Date(Math.floor(Date.now() / dayMs) * dayMs);
  const admin = createAdminClient();
  const [{ data: requestCount, error: limitError }, { data: dailyCount, error: dailyError }] = await Promise.all([
    admin.rpc("partner_rate_limit_hit", {
      p_bucket_key: `contact-discovery:${profileId}`,
      p_window_start: windowStart.toISOString(),
    }),
    admin.rpc("partner_rate_limit_hit", {
      p_bucket_key: `contact-discovery-day:${profileId}`,
      p_window_start: dayStart.toISOString(),
    }),
  ]);
  if (limitError || dailyError) return { error: "Contact suggestions are temporarily unavailable." };
  if ((requestCount ?? 0) > 10) {
    return {
      error: "Too many contact checks. Please wait a moment and try again.",
      retryAfter: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000)),
    };
  }
  if ((dailyCount ?? 0) > 20) {
    return {
      error: "You have reached today's limit for contact checks. Try again tomorrow.",
      retryAfter: Math.max(60, Math.ceil((dayStart.getTime() + dayMs - Date.now()) / 1000)),
    };
  }

  const hashes = [...new Set(parsed.data.hashes)];
  const { data, error } = await admin.rpc("discover_contact_profiles", {
    p_viewer_profile_id: profileId,
    p_identifier_digests: hashes,
  });
  if (error) {
    console.error("contact discovery failed", error.message);
    return { error: "Contact suggestions are temporarily unavailable." };
  }

  return {
    results: (data ?? []).map((row) => ({
      id: row.profile_id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      is_public: row.is_public,
      exact_match: true,
      relationship_state: row.relationship_state as PeopleSearchResult["relationship_state"],
      mutual_friend_count: row.mutual_friend_count,
      contact_hash: row.matched_digest,
    })),
  };
}
