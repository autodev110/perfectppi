import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const {
  FEATURE_FLAG_CODES,
  SAFE_DEFAULTS,
  applyEmergencyOverrides,
  emergencyDisabledFlags,
  resolveFeatureFlagEnvironment,
  toClientCapabilities,
} = await import("../../src/lib/feature-flags/shared.ts");

describe("feature flags: launch configuration", () => {
  test("the migration seeds every code with the plan 3.6 launch state", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20260910190000_product_feature_flags.sql", import.meta.url), "utf8");
    const seeded = new Map([...sql.matchAll(/\('([a-z_]+)',\s+(true|false)\)/g)].map((m) => [m[1], m[2] === "true"]));
    assert.deepEqual([...seeded.keys()].sort(), [...FEATURE_FLAG_CODES].sort());
    assert.equal(seeded.get("community_video_uploads"), false, "video must be off");
    assert.equal(seeded.get("automated_post_moderation"), false, "AI gate must be off");
    assert.equal(seeded.get("report_auto_hide"), true, "auto-hide must be on");
    assert.equal(seeded.get("specialist_image_safeguard"), true, "specialist safeguard must be on");
    assert.equal(seeded.get("community_text_posts"), true);
  });

  test("safe defaults fail closed for creation and open for safety controls", () => {
    assert.equal(SAFE_DEFAULTS.community_text_posts, false);
    assert.equal(SAFE_DEFAULTS.community_video_uploads, false);
    assert.equal(SAFE_DEFAULTS.report_auto_hide, true);
    assert.equal(SAFE_DEFAULTS.specialist_image_safeguard, true);
  });
});

describe("feature flags: environment and emergency override", () => {
  test("resolves the environment from explicit, Vercel, then NODE_ENV", () => {
    const saved = { ...process.env };
    try {
      process.env.PERFECTPPI_FLAG_ENVIRONMENT = "preview";
      process.env.VERCEL_ENV = "production";
      assert.equal(resolveFeatureFlagEnvironment(), "preview");
      delete process.env.PERFECTPPI_FLAG_ENVIRONMENT;
      assert.equal(resolveFeatureFlagEnvironment(), "production");
      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = "test";
      assert.equal(resolveFeatureFlagEnvironment(), "development");
    } finally {
      process.env = saved;
    }
  });

  test("emergency override forces listed flags off and ignores unknown codes", () => {
    const saved = process.env.PERFECTPPI_EMERGENCY_OFF;
    try {
      process.env.PERFECTPPI_EMERGENCY_OFF = "community_photo_uploads, bogus_flag ,community_text_posts";
      assert.deepEqual(emergencyDisabledFlags(), ["community_photo_uploads", "community_text_posts"]);
      const { flags, emergencyOff } = applyEmergencyOverrides({ ...SAFE_DEFAULTS, community_text_posts: true, community_photo_uploads: true });
      assert.equal(flags.community_text_posts, false);
      assert.equal(flags.community_photo_uploads, false);
      assert.equal(flags.report_auto_hide, true);
      assert.deepEqual(emergencyOff, ["community_photo_uploads", "community_text_posts"]);
    } finally {
      if (saved === undefined) delete process.env.PERFECTPPI_EMERGENCY_OFF;
      else process.env.PERFECTPPI_EMERGENCY_OFF = saved;
    }
  });
});

describe("feature flags: client projection", () => {
  test("exposes only client-relevant capabilities", () => {
    const projection = toClientCapabilities({
      environment: "production",
      version: 12,
      updatedAt: null,
      flags: { ...SAFE_DEFAULTS, community_text_posts: true },
      emergencyOff: [],
      source: "database",
    });
    assert.equal(projection.version, 12);
    assert.equal(projection.capabilities.communityTextPosts, true);
    assert.equal(projection.capabilities.communityVideoUploads, false);
    assert.ok(!("specialistImageSafeguard" in projection.capabilities));
    assert.ok(!("automatedPostModeration" in projection.capabilities));
    assert.ok(!("reportAutoHide" in projection.capabilities));
  });
});
