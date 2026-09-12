import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

describe("technician credential trust", () => {
  test("clients cannot seed or update server-managed trust fields", async () => {
    const migration = await source(
      "supabase/migrations/20260912200000_technician_credentials_and_service_profile.sql",
    );

    assert.ok(migration.includes("BEFORE INSERT OR UPDATE ON public.technician_profiles"));
    assert.ok(migration.includes("NEW.claimed_certification_level"));
    assert.ok(migration.includes("technician trust fields are server managed"));
    assert.ok(migration.includes("REVOKE ALL ON TABLE public.technician_credentials FROM PUBLIC, anon, authenticated"));
  });

  test("private evidence is revealed through an audited service-only operation", async () => {
    const migration = await source(
      "supabase/migrations/20260912200000_technician_credentials_and_service_profile.sql",
    );
    const adminQuery = await source("src/features/admin/queries.ts");

    assert.ok(migration.includes("read_technician_credential_evidence"));
    assert.ok(migration.includes("'evidence_viewed'"));
    assert.ok(migration.includes("credential_evidence_review_required"));
    assert.ok(migration.includes("GRANT EXECUTE ON FUNCTION public.read_technician_credential_evidence(uuid, uuid) TO service_role"));
    assert.ok(!adminQuery.includes('.from("technician_credentials")\n    .select("*")'));
  });

  test("public credential facts exclude proof and identifier details", async () => {
    const service = await source("src/features/technicians/credentials.ts");
    const publicFacts = service.slice(
      service.indexOf("export async function getPublicCredentialMap"),
      service.indexOf("export async function getMyTechnicianCredentials"),
    );

    assert.ok(!publicFacts.includes("evidence_reference"));
    assert.ok(!publicFacts.includes("credential_identifier_last4"));
    assert.ok(publicFacts.includes('.eq("status", "approved")'));
    assert.ok(publicFacts.includes("expires_on.gte"));
  });

  test("inspection trust is derived from active reviewed credentials", async () => {
    const ppiActions = await source("src/features/ppi/actions.ts");
    const partnerRoute = await source("src/app/api/v1/partner/inspections/route.ts");
    const labels = await source("src/types/enums.ts");

    assert.ok(ppiActions.includes("hasActiveCertifiedCredential"));
    assert.ok(partnerRoute.includes("hasActiveCertifiedCredential"));
    assert.ok(!labels.includes('badge: "Bronze"'));
    assert.ok(!labels.includes('badge: "Silver"'));
    assert.ok(!labels.includes('badge: "Gold"'));
  });
});
