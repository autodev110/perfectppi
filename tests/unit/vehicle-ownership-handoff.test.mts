import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("verified vehicle ownership handoff (plan 23.4)", () => {
  test("requires a sold seller record, one-time code, full VIN, and rate limits attempts", async () => {
    const migration = await source("supabase/migrations/20260913040000_vehicle_handoff_verification.sql");
    assert.match(migration, /ownership_state = 'previously_owned'/);
    assert.match(migration, /claim_code_hash text UNIQUE/);
    assert.match(migration, /claimed_at = now\(\),[\s\S]*claim_code_hash = NULL/);
    assert.match(migration, /v_vin !~ '\^\[A-HJ-NPR-Z0-9\]\{17\}\$'/);
    assert.match(migration, /attempted_at > now\(\) - interval '1 hour'/);
    assert.match(migration, /claimed_at IS NULL[\s\S]*revoked_at IS NULL[\s\S]*expires_at > now\(\)/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.claim_vehicle_handoff\(uuid, text, text\)[\s\S]*TO service_role/);
    assert.doesNotMatch(migration, /TO authenticated;[\s\S]*claim_vehicle_handoff/);
  });

  test("creates a separate private buyer record without seller-private data", async () => {
    const migration = await source("supabase/migrations/20260913040000_vehicle_handoff_verification.sql");
    const values = migration.match(/INSERT INTO public\.vehicles \([\s\S]*?\) VALUES \([\s\S]*?\n  \)/)?.[0] ?? "";
    assert.match(values, /p_buyer_profile_id/);
    assert.match(values, /'private'/);
    assert.match(values, /NULL,[\s\S]*'unknown'/);
    assert.doesNotMatch(values, /vehicle_notes|ppi_|maintenance|receipt|media/);
  });

  test("shows seller consent previews and buyer claim UI on web and iOS", async () => {
    const [soldWeb, handoffWeb, claimWeb, ios, api] = await Promise.all([
      source("src/app/(dashboard)/dashboard/vehicles/[id]/vehicle-sold-action.tsx"),
      source("src/app/(dashboard)/dashboard/vehicles/[id]/vehicle-handoff-action.tsx"),
      source("src/app/(dashboard)/dashboard/vehicles/claim/vehicle-claim-form.tsx"),
      source("mobile-app/PerfectPPI/Features/Consumer/VehiclesListView.swift"),
      source("src/features/vehicles/handoff.ts"),
    ]);
    assert.match(soldWeb, /Public-history preview/);
    assert.match(soldWeb, /consent to keeping these permitted details public/);
    assert.match(handoffWeb, /never transfers|do not transfer|do not transfer/i);
    assert.match(claimWeb, /not proof of legal title/i);
    assert.match(ios, /ClaimPurchasedVehicleView/);
    assert.match(ios, /This is not proof of legal title/);
    assert.match(api, /createHash\("sha256"\)/);
  });
});
