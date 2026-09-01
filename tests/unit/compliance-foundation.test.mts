import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  CANONICAL_ORIGIN,
  TERMS_SHA256,
  TERMS_VERSION,
} from "../../src/lib/legal/constants.ts";

const root = new URL("../../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

describe("compliance foundation", () => {
  test("the assent hash matches the versioned Terms source", async () => {
    const terms = await source("src/app/(public)/terms/page.tsx");
    const hash = createHash("sha256").update(terms).digest("hex");
    assert.equal(hash, TERMS_SHA256);
    assert.match(TERMS_VERSION, /^terms-\d+\.\d+\.\d+$/);
  });

  test("canonical legal pages are public and discoverable", async () => {
    const middleware = await source("src/middleware.ts");
    const sitemap = await source("src/app/sitemap.ts");
    for (const route of ["/privacy", "/terms", "/support", "/notice-at-collection", "/privacy-choices"]) {
      assert.ok(middleware.includes(`\"${route}\"`), `${route} must be public`);
      assert.ok(sitemap.includes(`\"${route}\"`), `${route} must be in the sitemap`);
    }
    assert.equal(CANONICAL_ORIGIN, "https://www.perfectppi.com");
  });

  test("privacy and assent tables use RLS and server-mediated grants", async () => {
    const migration = await source("supabase/migrations/20260901210055_compliance_privacy_foundation.sql");
    for (const table of ["legal_acceptances", "privacy_requests"]) {
      assert.ok(migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
      assert.ok(migration.includes(`GRANT ALL ON public.${table} TO service_role`));
      assert.ok(!migration.includes(`GRANT INSERT ON public.${table} TO authenticated`));
    }
  });

  test("Google cannot be disconnected when it is the last identity", async () => {
    const route = await source("src/app/api/account/identities/route.ts");
    assert.ok(route.includes("identities.length < 2"));
    assert.ok(route.includes("so you are not locked out"));
  });

  test("service-contract transactions are default-off behind an explicit gate", async () => {
    const actions = await source("src/features/warranty/actions.ts");
    const env = await source(".env.example");
    assert.ok(actions.includes('process.env.ENABLE_VSC_SALES === "true"'));
    assert.ok(actions.includes("pending provider and legal approval"));
    assert.ok(env.includes("ENABLE_VSC_SALES=false"));
  });

  test("account deletion is claimed atomically and privacy logs expire", async () => {
    const migration = await source("supabase/migrations/20260901215220_account_privacy_fulfillment.sql");
    const worker = await source("src/lib/privacy/fulfillment.ts");
    assert.ok(migration.includes("FOR UPDATE SKIP LOCKED"));
    assert.ok(migration.includes("claim_privacy_deletion_requests"));
    assert.ok(worker.includes("deleteUser(request.auth_user_id, false)"));
    assert.ok(worker.includes("deleteOwnerStoredObjects"));
    assert.ok(worker.includes("retention_expires_at"));
  });
});
