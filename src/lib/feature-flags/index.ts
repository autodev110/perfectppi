import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CACHE_TTL_MS,
  FEATURE_FLAG_CODES,
  SAFE_DEFAULTS,
  applyEmergencyOverrides,
  resolveFeatureFlagEnvironment,
  type FeatureFlagCode,
  type FeatureFlagEnvironment,
  type FeatureFlagMap,
  type FeatureFlagSnapshot,
} from "./shared";

export * from "./shared";

// Server-authoritative launch capabilities (plan section 30.2). Every mutation
// path reads these; the iOS/web clients only receive the derived
// /api/capabilities view for presentation. Flag rows live in
// product_feature_flags and change only through the audited RPC.

type RawFlags = {
  environment: FeatureFlagEnvironment;
  version: number;
  updatedAt: string | null;
  flags: FeatureFlagMap;
};

// Raw database values only; the emergency override is applied on every read
// so a redeploy that sets or clears PERFECTPPI_EMERGENCY_OFF is never masked.
let cached: { raw: RawFlags; expiresAt: number } | null = null;

function snapshotFrom(raw: RawFlags, source: FeatureFlagSnapshot["source"]): FeatureFlagSnapshot {
  const applied = applyEmergencyOverrides(raw.flags);
  return {
    environment: raw.environment,
    version: raw.version,
    updatedAt: raw.updatedAt,
    flags: applied.flags,
    emergencyOff: applied.emergencyOff,
    source,
  };
}

async function loadFromDatabase(environment: FeatureFlagEnvironment): Promise<RawFlags | null> {
  const { data, error } = await createAdminClient()
    .from("product_feature_flags")
    .select("flag_code, enabled, version, updated_at")
    .eq("environment", environment);

  if (error || !data) {
    console.error("feature flags unavailable; using safe defaults", error?.message);
    return null;
  }

  const flags: FeatureFlagMap = { ...SAFE_DEFAULTS };
  let version = 0;
  let updatedAt: string | null = null;
  for (const row of data) {
    if (!(FEATURE_FLAG_CODES as readonly string[]).includes(row.flag_code)) continue;
    flags[row.flag_code as FeatureFlagCode] = row.enabled;
    version += row.version;
    if (!updatedAt || row.updated_at > updatedAt) updatedAt = row.updated_at;
  }
  return { environment, version, updatedAt, flags };
}

export async function getFeatureFlags(options?: { fresh?: boolean }): Promise<FeatureFlagSnapshot> {
  const environment = resolveFeatureFlagEnvironment();
  const now = Date.now();
  if (!options?.fresh && cached && cached.expiresAt > now && cached.raw.environment === environment) {
    return snapshotFrom(cached.raw, "database");
  }
  const raw = await loadFromDatabase(environment);
  if (!raw) {
    // Never cache a fallback: the next request should retry the database.
    return snapshotFrom({ environment, version: 0, updatedAt: null, flags: { ...SAFE_DEFAULTS } }, "safe_defaults");
  }
  cached = { raw, expiresAt: now + CACHE_TTL_MS };
  return snapshotFrom(raw, "database");
}

export async function isFeatureEnabled(code: FeatureFlagCode): Promise<boolean> {
  return (await getFeatureFlags()).flags[code];
}

export function invalidateFeatureFlagCache() {
  cached = null;
}

