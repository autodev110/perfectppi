// Pure, environment-only helpers shared by the server module and tests.
// Nothing here touches the database.

export const FEATURE_FLAG_CODES = [
  "social_profiles",
  "friends_discovery",
  "groups",
  "group_creation",
  "community_text_posts",
  "community_photo_uploads",
  "community_video_uploads",
  "automated_post_moderation",
  "specialist_image_safeguard",
  "report_auto_hide",
  "events",
] as const;

export type FeatureFlagCode = (typeof FEATURE_FLAG_CODES)[number];
export type FeatureFlagEnvironment = "production" | "preview" | "development";
export type FeatureFlagMap = Record<FeatureFlagCode, boolean>;

export type FeatureFlagSnapshot = {
  environment: FeatureFlagEnvironment;
  /** Monotonic across changes: sum of per-flag versions. */
  version: number;
  updatedAt: string | null;
  flags: FeatureFlagMap;
  /** Flag codes forced off by the environment-level emergency override. */
  emergencyOff: FeatureFlagCode[];
  source: "database" | "safe_defaults";
};

// What each flag becomes when the database is unreachable or the row is
// missing. Creation paths fail closed; safety controls stay on.
export const SAFE_DEFAULTS: FeatureFlagMap = {
  social_profiles: false,
  friends_discovery: false,
  groups: false,
  group_creation: false,
  community_text_posts: false,
  community_photo_uploads: false,
  community_video_uploads: false,
  automated_post_moderation: false,
  specialist_image_safeguard: true,
  report_auto_hide: true,
  events: false,
};

// Plan 30.2: cache propagation for ordinary changes must be 60 seconds or
// less. Emergency overrides bypass this cache entirely.
export const CACHE_TTL_MS = 30_000;

export function resolveFeatureFlagEnvironment(): FeatureFlagEnvironment {
  const explicit = process.env.PERFECTPPI_FLAG_ENVIRONMENT;
  if (explicit === "production" || explicit === "preview" || explicit === "development") {
    return explicit;
  }
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production" || vercel === "preview" || vercel === "development") {
    return vercel;
  }
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/**
 * Environment-level kill switch (plan 30.2 / 20.3): a comma-separated list of
 * flag codes forced off regardless of database state. Read on every call so a
 * redeploy with the variable set takes effect synchronously.
 */
export function emergencyDisabledFlags(): FeatureFlagCode[] {
  const raw = process.env.PERFECTPPI_EMERGENCY_OFF ?? "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is FeatureFlagCode =>
      (FEATURE_FLAG_CODES as readonly string[]).includes(value),
    );
}

export function applyEmergencyOverrides(flags: FeatureFlagMap): { flags: FeatureFlagMap; emergencyOff: FeatureFlagCode[] } {
  const emergencyOff = emergencyDisabledFlags();
  if (emergencyOff.length === 0) return { flags, emergencyOff };
  const next = { ...flags };
  for (const code of emergencyOff) next[code] = false;
  return { flags: next, emergencyOff };
}

/** Stable outcome for a creation path whose flag is off. */
export const FEATURE_UNAVAILABLE_MESSAGE: Partial<Record<FeatureFlagCode, string>> = {
  community_text_posts: "Community posting is temporarily unavailable. Please try again later.",
  community_photo_uploads: "Photo uploads are temporarily unavailable. You can still post text.",
  community_video_uploads: "Video posts are coming later.",
  social_profiles: "Social profiles are not available yet.",
  friends_discovery: "Friend requests are not available yet.",
  groups: "Groups are not available yet.",
  group_creation: "Creating groups is not available yet.",
  events: "Events are not available yet.",
};

// Read-only, client-relevant projection (plan 30.2). Internal safety controls
// such as the specialist safeguard and the AI gate are deliberately omitted.
export type ClientCapabilities = {
  version: number;
  environment: FeatureFlagEnvironment;
  refreshAfterSeconds: number;
  capabilities: {
    socialProfiles: boolean;
    friendsDiscovery: boolean;
    groups: boolean;
    groupCreation: boolean;
    communityTextPosts: boolean;
    communityPhotoUploads: boolean;
    communityVideoUploads: boolean;
    events: boolean;
  };
};

export function toClientCapabilities(snapshot: FeatureFlagSnapshot): ClientCapabilities {
  return {
    version: snapshot.version,
    environment: snapshot.environment,
    refreshAfterSeconds: Math.floor(CACHE_TTL_MS / 1000),
    capabilities: {
      socialProfiles: snapshot.flags.social_profiles,
      friendsDiscovery: snapshot.flags.friends_discovery,
      groups: snapshot.flags.groups,
      groupCreation: snapshot.flags.group_creation,
      communityTextPosts: snapshot.flags.community_text_posts,
      communityPhotoUploads: snapshot.flags.community_photo_uploads,
      communityVideoUploads: snapshot.flags.community_video_uploads,
      events: snapshot.flags.events,
    },
  };
}
