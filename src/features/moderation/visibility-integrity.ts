import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type ModerationVisibilityIntegrity = {
  available: boolean;
  activeRestrictedPosts: number;
  activeRestrictedComments: number;
  openCaseVisibleContent: number;
  totalViolations: number;
};

function emptyIntegrity(available: boolean): ModerationVisibilityIntegrity {
  return {
    available,
    activeRestrictedPosts: 0,
    activeRestrictedComments: 0,
    openCaseVisibleContent: 0,
    totalViolations: 0,
  };
}

export async function getModerationVisibilityIntegrity(): Promise<ModerationVisibilityIntegrity> {
  const { data, error } = await createAdminClient().rpc("moderation_visibility_integrity_status");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    if (error) console.error("moderation visibility integrity check failed", { code: error.code });
    return emptyIntegrity(false);
  }

  const values = data as Record<string, unknown>;
  const result = emptyIntegrity(true);
  for (const key of [
    "activeRestrictedPosts",
    "activeRestrictedComments",
    "openCaseVisibleContent",
    "totalViolations",
  ] as const) {
    const value = Number(values[key]);
    if (!Number.isFinite(value) || value < 0) return emptyIntegrity(false);
    result[key] = Math.floor(value);
  }
  return result;
}
