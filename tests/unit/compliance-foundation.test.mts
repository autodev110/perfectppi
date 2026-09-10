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
    const recoveryMigration = await source("supabase/migrations/20260901221852_resume_held_privacy_deletions.sql");
    const worker = await source("src/lib/privacy/fulfillment.ts");
    assert.ok(migration.includes("FOR UPDATE SKIP LOCKED"));
    assert.ok(migration.includes("claim_privacy_deletion_requests"));
    assert.ok(recoveryMigration.includes("status IN ('submitted', 'in_progress', 'on_hold')"));
    assert.ok(recoveryMigration.includes("p_limit IS NULL"));
    assert.ok(recoveryMigration.includes("p_worker_id IS NULL"));
    assert.ok(worker.includes("deleteUser(authUserId!, false)"));
    assert.ok(worker.includes("next_attempt_at: new Date(Date.now() + 24 * 60 * 60_000)"));
    assert.ok(worker.indexOf("deleteUser(authUserId!, false)") < worker.indexOf("account_deleted_at: accountDeletedAt"));
    assert.ok(worker.includes("deleteOwnerStoredObjects"));
    assert.ok(worker.includes("retention_expires_at"));
  });

  test("warranty webhooks commit state transitions atomically and retry failures", async () => {
    const migration = await source("supabase/migrations/20260906213718_atomic_warranty_webhooks.sql");
    const stripe = await source("src/app/api/webhooks/stripe/route.ts");
    const docuseal = await source("src/app/api/webhooks/docuseal/route.ts");
    for (const fn of [
      "complete_warranty_signature",
      "complete_warranty_payment",
      "fail_warranty_payment",
    ]) {
      assert.ok(migration.includes(`FUNCTION public.${fn}`));
      assert.ok(migration.includes(`GRANT EXECUTE ON FUNCTION public.${fn}`));
    }
    assert.ok(stripe.includes('admin.rpc("complete_warranty_payment"'));
    assert.ok(stripe.includes('admin.rpc("fail_warranty_payment"'));
    assert.ok(docuseal.includes('admin.rpc("complete_warranty_signature"'));
    assert.ok(stripe.includes('{ status: 500 }'));
    assert.ok(docuseal.includes('{ status: 500 }'));
  });

  test("TestFlight uses the supplied distribution identity and production entitlements", async () => {
    const workflow = await source(".github/workflows/testflight.yml");
    const project = await source("mobile-app/project.yml");
    const releaseEntitlements = await source(
      "mobile-app/PerfectPPI/Resources/PerfectPPI-Release.entitlements",
    );
    const archiveStep = workflow.slice(
      workflow.indexOf("- name: Archive the production app"),
      workflow.indexOf("- name: Verify the archive before upload"),
    );

    assert.ok(archiveStep.includes("CODE_SIGN_STYLE=Manual"));
    assert.ok(archiveStep.includes('CODE_SIGN_IDENTITY=\"Apple Distribution\"'));
    assert.ok(archiveStep.includes('PROVISIONING_PROFILE_SPECIFIER=\"$PROVISIONING_PROFILE_NAME\"'));
    assert.ok(!archiveStep.includes("-allowProvisioningUpdates"));
    assert.ok(workflow.includes('-c "Set :signingStyle manual"'));
    assert.ok(project.includes("Release:\n          CODE_SIGN_ENTITLEMENTS: PerfectPPI/Resources/PerfectPPI-Release.entitlements"));
    assert.ok(releaseEntitlements.includes("<string>production</string>"));
  });
});
