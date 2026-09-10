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
});
