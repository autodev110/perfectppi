import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, test } from "node:test";

const {
  REPORT_REASON_CODES,
  REPORT_REASON_LABELS,
  REPORT_REASONS_REQUIRING_DETAILS,
  reportReasonRequiresDetails,
} = await import("../../src/features/moderation/report-reasons.ts");

// Plan section 16.2: stable machine reason codes, separate from labels.
const SPECIFIED_CODES = [
  "spam", "harassment", "hate", "violence", "sexual_content",
  "personal_information", "fraud", "illegal_content",
  "dangerous_vehicle_advice", "intellectual_property", "other",
];

function latestReasonCodeConstraint() {
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  let latest: string[] | null = null;
  for (const file of files) {
    const sql = readFileSync(new URL(file, dir), "utf8");
    const match = sql.match(
      /moderation_reports_reason_code_check CHECK \(reason_code IN \(([\s\S]*?)\)\)/,
    ) ?? (file.includes("20260831191651") ? sql.match(/reason_code text NOT NULL CHECK \(reason_code IN \(([\s\S]*?)\)\)/) : null);
    if (match) latest = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  }
  return latest;
}

describe("report reason codes", () => {
  test("match the specified launch set exactly", () => {
    assert.deepEqual([...REPORT_REASON_CODES], SPECIFIED_CODES);
  });

  test("every code has a human label", () => {
    for (const code of REPORT_REASON_CODES) {
      assert.ok(REPORT_REASON_LABELS[code].length > 0, `${code} has no label`);
    }
  });

  test("Other and intellectual-property reports require details", () => {
    assert.deepEqual([...REPORT_REASONS_REQUIRING_DETAILS].sort(), ["intellectual_property", "other"]);
    assert.equal(reportReasonRequiresDetails("other"), true);
    assert.equal(reportReasonRequiresDetails("intellectual_property"), true);
    assert.equal(reportReasonRequiresDetails("spam"), false);
  });

  test("the database CHECK constraint accepts the same set", () => {
    const dbCodes = latestReasonCodeConstraint();
    assert.ok(dbCodes, "no reason_code CHECK constraint found in migrations");
    assert.deepEqual([...dbCodes].sort(), [...REPORT_REASON_CODES].sort());
  });

  test("the report RPC validates the same set", () => {
    const dir = new URL("../../supabase/migrations/", import.meta.url);
    const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
    let rpcCodes: string[] | null = null;
    for (const file of files) {
      const sql = readFileSync(new URL(file, dir), "utf8");
      if (!sql.includes("FUNCTION public.submit_moderation_report(")) continue;
      const matches = [...sql.matchAll(/IF p_reason_code NOT IN \(([\s\S]*?)\)/g)];
      const match = matches.at(-1);
      if (match) rpcCodes = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    }
    assert.ok(rpcCodes, "submit_moderation_report reason check not found");
    assert.deepEqual([...rpcCodes].sort(), [...REPORT_REASON_CODES].sort());
  });
});
