import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("contact discovery and vehicle configuration", () => {
  test("keeps contact lookup private, hashed, bounded, and visibility filtered", async () => {
    const migration = await source("supabase/migrations/20260913030000_contact_discovery_vehicle_configuration.sql");
    assert.match(migration, /digest\(lower\(btrim\(p_value\)\), 'sha256'\)/);
    assert.match(migration, /cardinality[\s\S]*BETWEEN 1 AND 500/);
    assert.match(migration, /profile\.discoverable/);
    assert.match(migration, /social_can_view_profile/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.profile_contact_identifiers FROM PUBLIC, anon, authenticated/);
  });

  test("sends current configuration and mileage confidence to report generation", async () => {
    const prompt = await source("src/lib/ai/prompts/standardized-output.ts");
    assert.match(prompt, /reported swapped/);
    assert.match(prompt, /mileage is not actual or unknown/);
    assert.match(prompt, /Do not substitute VIN-decoded factory equipment/);
  });

  test("offers all year-specific vehicle models and restores RLS-backed profile access", async () => {
    const catalog = await source("src/lib/vehicles/catalog.ts");
    const grants = await source("supabase/migrations/20260912234549_restore_technician_profile_table_privileges.sql");
    assert.match(catalog, /GetModelsForMakeYear\/make\/\$\{encodedMake\}\/modelyear\/\$\{year\}/);
    assert.doesNotMatch(catalog, /Passenger%20Car/);
    assert.match(grants, /GRANT SELECT, UPDATE ON TABLE public\.profiles TO authenticated/);
    assert.match(grants, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.technician_profiles TO authenticated/);
  });

  test("discloses optional contact use and exports enrollment without raw hashes", async () => {
    const privacy = await source("src/app/(public)/privacy/page.tsx");
    const exportSource = await source("src/lib/privacy/export.ts");
    assert.match(privacy, /one-way hashes/);
    assert.match(privacy, /unmatched raw contact details remain on your device/);
    assert.match(exportSource, /select\("kind, created_at"\)/);
  });
});
