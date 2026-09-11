export const COMMUNITY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export type CommunityRateLimit = {
  limited: boolean;
  retryAfterSeconds: number;
};

export type CommunityPostRateLimitActivity = {
  id: string;
  createdAt: string;
  assemblyState?: "assembling" | "submitted" | "finalized" | null;
};

export function countableCommunityPostActivity(
  activity: readonly CommunityPostRateLimitActivity[],
) {
  return activity
    .filter((item) => item.assemblyState !== "assembling")
    .map((item) => item.createdAt);
}

/**
 * Calculates a rolling-window limit from already-accepted activity. Entries
 * excluded by the caller, such as unfinished media drafts, never consume the
 * user's publishing allowance.
 */
export function evaluateCommunityRateLimit(
  createdAt: readonly string[],
  limit: number,
  now = Date.now(),
): CommunityRateLimit {
  const threshold = now - COMMUNITY_RATE_LIMIT_WINDOW_MS;
  const recent = createdAt
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value) && value >= threshold)
    .sort((a, b) => b - a);

  if (recent.length < limit) return { limited: false, retryAfterSeconds: 0 };

  const limitingEntry = recent[limit - 1];
  return {
    limited: true,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((limitingEntry + COMMUNITY_RATE_LIMIT_WINDOW_MS - now) / 1000),
    ),
  };
}

export function communityRateLimitMessage(
  entity: "post" | "comment",
  retryAfterSeconds: number,
) {
  const action = entity === "post" ? "post" : "comment";
  if (retryAfterSeconds < 60) {
    return `You're ${action === "post" ? "posting" : "commenting"} too quickly. Try again in less than a minute.`;
  }
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `You're ${action === "post" ? "posting" : "commenting"} too quickly. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
