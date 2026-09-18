import { resolveSourceCopy } from "../helpers/localized-source.mts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8").then(resolveSourceCopy);

describe("transaction-linked technician review disputes (plan Phase 3)", () => {
  test("keeps disputes service-only and freezes only the linked review", async () => {
    const migration = await source("supabase/migrations/20260913150947_technician_review_dispute_policy.sql");

    assert.match(migration, /REVOKE ALL ON public\.ppi_service_disputes FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /review\.ppi_request_id = p_ppi_request_id[\s\S]*review\.status = 'active'/);
    assert.match(migration, /review_blocked_by_active_dispute/);
    assert.match(migration, /review_under_moderation/);
    assert.match(migration, /OLD\.dispute_hold_id IS NULL/);
    assert.match(migration, /WHERE request\.id = NEW\.ppi_request_id\s+FOR UPDATE/);
  });

  test("requires requester linkage, a completed inspection, a window, and an admin decision", async () => {
    const migration = await source("supabase/migrations/20260913150947_technician_review_dispute_policy.sql");

    assert.match(migration, /v_request\.requester_id IS DISTINCT FROM p_actor_profile_id/);
    assert.match(migration, /v_request\.status <> 'completed'/);
    assert.match(migration, /interval '30 days'/);
    assert.match(migration, /profile\.role = 'admin'/);
    assert.match(migration, /p_restore_review/);
  });

  test("exposes the private workflow on web and iOS and includes it in account export", async () => {
    const web = await source("src/app/(dashboard)/dashboard/ppi/[id]/review/page.tsx");
    const admin = await source("src/app/(admin)/admin/reviews/page.tsx");
    const ios = await source("mobile-app/PerfectPPI/Features/Reviews/ReviewComposerView.swift");
    const dataExport = await source("src/lib/privacy/export.ts");

    assert.match(web, /Submit private concern/);
    assert.match(admin, /Choose what happens to the review/);
    assert.match(ios, /Submit private concern/);
    assert.match(ios, /Withdraw dispute/);
    assert.match(dataExport, /serviceDisputesSubmitted/);
    assert.match(dataExport, /serviceDisputeActions/);
  });
});
