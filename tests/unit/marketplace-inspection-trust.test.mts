import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("marketplace inspection trust", () => {
  test("keeps listing inspection creation atomic and service-only", async () => {
    const migration = await source(
      "supabase/migrations/20260911090000_marketplace_inspection_trust.sql",
    );
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /social_profiles_are_blocked/);
    assert.match(migration, /ppi_requests_one_open_per_requester_listing_idx/);
    assert.match(migration, /DROP POLICY IF EXISTS vehicles_select_public/);
    assert.match(migration, /vehicles_select_inspection_requester/);
    assert.match(migration, /marketplace_visible_listing_ids/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.request_marketplace_inspection/);
    assert.match(migration, /TO service_role/);
  });

  test("public marketplace and vehicle DTOs never select or search full VIN", async () => {
    const [marketplace, vehicles] = await Promise.all([
      source("src/features/marketplace/queries.ts"),
      source("src/features/vehicles/queries.ts"),
    ]);
    assert.doesNotMatch(marketplace, /vehicle:vehicles[^`]*[\s\S]*\(\*/);
    assert.doesNotMatch(marketplace, /vehicle\?\.vin/);
    const publicVehicleQuery = vehicles.slice(vehicles.indexOf("export async function getPublicVehicle"));
    assert.doesNotMatch(publicVehicleQuery.split("export async function getVehiclePpiHistory")[0], /\*/);
  });

  test("web and iOS expose factual inspection context and request controls", async () => {
    const [web, ios, route] = await Promise.all([
      source("src/app/(public)/vehicle/[id]/page.tsx"),
      source("mobile-app/PerfectPPI/Features/Marketplace/MarketplaceView.swift"),
      source("src/app/api/marketplace/listings/[id]/request-inspection/route.ts"),
    ]);
    assert.match(web, /Request Inspection/);
    assert.match(web, /not a guarantee/);
    assert.match(ios, /requestInspection/);
    assert.match(ios, /not a guarantee/);
    assert.match(route, /requireApiRole/);
  });
});
