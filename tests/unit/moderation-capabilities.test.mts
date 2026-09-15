import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const { MODERATION_CAPABILITIES, CAPABILITY_LABELS } = await import(
  "../../src/features/moderation/capability-codes.ts"
);

describe("moderation capabilities", () => {
  test("match the plan 18.1 capability set and the database CHECK constraint", () => {
    assert.deepEqual([...MODERATION_CAPABILITIES], [
      "queue_read", "reporter_identity_read", "content_decide",
      "account_enforce", "evidence_export", "legal_hold_review",
    ]);
    const sql = readFileSync(
      new URL("../../supabase/migrations/20260910210000_moderation_capabilities_and_case_decisions.sql", import.meta.url),
      "utf8",
    );
    const match = sql.match(/capability text NOT NULL CHECK \(capability IN \(([\s\S]*?)\)\)/);
    assert.ok(match, "grant capability CHECK not found");
    const dbCodes = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(dbCodes, [...MODERATION_CAPABILITIES].sort());
    for (const code of MODERATION_CAPABILITIES) assert.ok(CAPABILITY_LABELS[code].length > 0);
  });

  test("the decision RPC enforces the same enforcement set the plan lists", () => {
    const sql = readFileSync(
      new URL("../../supabase/migrations/20260910210000_moderation_capabilities_and_case_decisions.sql", import.meta.url),
      "utf8",
    );
    const match = sql.match(/IF p_enforcement NOT IN \(([\s\S]*?)\) THEN/);
    assert.ok(match);
    const enforcement = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    for (const required of ["warning", "posting_hold", "media_hold", "reporting_hold", "suspension", "ban"]) {
      assert.ok(enforcement.includes(required), `${required} missing from decide_moderation_case`);
    }
  });

  test("the audit hardening migration closes null and inactive-account bypasses", () => {
    const sql = readFileSync(
      new URL("../../supabase/migrations/20260911020000_audit_lifecycle_hardening.sql", import.meta.url),
      "utf8",
    );
    assert.match(sql, /social_profile_is_available\(p_profile_id\)/);
    assert.match(sql, /social_current_user_is_available/);
    assert.match(sql, /p_expected_version IS NULL/);
    assert.match(sql, /p_decision IS NULL/);
    assert.match(sql, /p_enforcement IS NULL/);
    assert.match(sql, /p_enforcement <> 'none' AND p_decision <> 'remove'/);
    assert.match(sql, /p_environment = 'production'[\s\S]*moderation_has_capability\(v_actor_id, 'legal_hold_review'\)/);
    assert.match(sql, /linked_case_retention_active/);
    assert.match(sql, /comment_case_retention_active/);
  });
});

test("evidence exports require independent capabilities, preserve reporter redaction, and audit before release", async () => {
  const route = readFileSync(
    new URL("../../src/app/api/admin/moderation/cases/[id]/export/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /capabilities\.has\("queue_read"\)/);
  assert.match(route, /capabilities\.has\("evidence_export"\)/);
  assert.match(route, /detail\.case\.legal_hold[\s\S]*legal_hold_review/);
  assert.match(route, /event_type: "evidence_exported"/);
  assert.match(route, /if \(auditError\)[\s\S]*status: 503/);
  assert.match(route, /capabilities\.has\("reporter_identity_read"\)/);
  assert.match(route, /Cache-Control": "private, no-store"/);

  const migration = readFileSync(
    new URL("../../supabase/migrations/20260915130000_expanded_ugc_reporting.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /'evidence_accessed', 'evidence_exported'/);
});

test("moderation queue filters validate UUID-backed selectors", () => {
  const source = readFileSync(
    new URL("../../src/features/moderation/case-queries.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /uuid\.safeParse\(filters\.assigneeId\)\.success/);
  assert.match(source, /uuid\.safeParse\(filters\.groupId\)\.success/);
});

test("expanded UGC reports are reporter-private until a moderator decides them", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260915130000_expanded_ugc_reporting.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /'profile', 'group', 'listing', 'review', 'message', 'media'/);
  assert.match(migration, /CREATE TABLE public\.moderation_reporter_hidden_entities/);
  assert.match(migration, /REVOKE ALL ON public\.moderation_reporter_hidden_entities FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /item\.status IN \('rejected', 'legal_hold'\)/);
  assert.match(migration, /purge_community_moderation_case_internal/);
  assert.match(migration, /v_case\.entity_type IN \('community_post', 'community_comment'\)/);

  const helper = readFileSync(
    new URL("../../src/features/moderation/extended-reporting.ts", import.meta.url),
    "utf8",
  );
  assert.match(helper, /\.in\("status", \["rejected", "legal_hold"\]\)/);
  assert.match(helper, /return new Set\(ids\)/);
});

test("expanded UGC report controls ship on web and iOS", () => {
  const web = readFileSync(
    new URL("../../src/components/shared/extended-report-control.tsx", import.meta.url),
    "utf8",
  );
  const ios = readFileSync(
    new URL("../../mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift", import.meta.url),
    "utf8",
  );
  assert.match(web, /\/api\/community\/reports\/extended/);
  // The confirmation copy is catalog-backed (plan 32.2); the control renders the key.
  assert.match(web, /t\("report\.control\.received"/);
  const catalog = readFileSync(new URL("../../src/lib/i18n/messages/en.ts", import.meta.url), "utf8");
  assert.match(catalog, /"report\.control\.received": "Report received\. This \{entity\} is hidden/);
  assert.match(ios, /struct ExtendedReportButton/);
  assert.match(ios, /CommunityAPI\.reportExtended/);
});
