import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("vehicle management hardening", () => {
  test("keeps private notes outside publicly readable vehicle rows", async () => {
    const migration = await source("supabase/migrations/20260908180832_vehicle_notes.sql");
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.vehicle_notes/);
    assert.match(migration, /ALTER TABLE public\.vehicle_notes ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON public\.vehicle_notes FROM anon, authenticated/);
    assert.doesNotMatch(migration, /ALTER TABLE public\.vehicles\s+ADD COLUMN notes/);
  });

  test("reserves vehicle uploads and prevents multiple primary media rows", async () => {
    const migration = await source("supabase/migrations/20260908180832_vehicle_notes.sql");
    const presignRoute = await source("src/app/api/upload/presigned-url/route.ts");
    assert.match(migration, /ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public\.vehicles/);
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS vehicle_media_one_primary_per_vehicle/);
    assert.match(migration, /DROP POLICY IF EXISTS ppi_requests_delete_requester/);
    assert.match(presignRoute, /vehicle_id: parsed\.data\.entity === "vehicle_media"/);
  });

  test("deleting inspections cleans managed media and report artifacts", async () => {
    const deletion = await source("src/features/ppi/deletion.ts");
    assert.match(deletion, /from\("ppi_media"\)/);
    assert.match(deletion, /from\("integration_artifacts"\)/);
    assert.match(deletion, /deleteStoredObjectOrQueue/);
  });

  test("keeps Vehicle Passport timeline secrets server-routed and exportable", async () => {
    const migration = await source("supabase/migrations/20260911230332_vehicle_build_maintenance_timelines.sql");
    const queries = await source("src/features/vehicles/timelines.ts");
    const accountExport = await source("src/lib/privacy/export.ts");

    assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
    assert.match(migration, /REVOKE ALL ON public\.vehicle_build_entries FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON public\.vehicle_maintenance_events FROM PUBLIC, anon, authenticated/);
    assert.match(queries, /\.select\("id, vehicle_id, category,[^\n]+"\)/);
    assert.doesNotMatch(
      queries.match(/export async function getPublicVehicleTimelines[\s\S]+$/)?.[0] ?? "",
      /\.select\("[^\n]*(?:cost_cents|private_notes)/,
    );
    assert.match(accountExport, /vehicleBuildEntries/);
    assert.match(accountExport, /vehicleMaintenanceEvents/);
  });
});
