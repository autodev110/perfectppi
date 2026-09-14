import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

const { inviteSignupPath, INVITE_COOKIE } = await import("../../src/lib/analytics/invite.ts");
// product-events.ts is server-only; read its allowlist from source instead.
const eventsSource = readFileSync(new URL("../../src/features/analytics/product-events.ts", import.meta.url), "utf8");
const PRODUCT_EVENT_NAMES = [...eventsSource.matchAll(/^\s+"([a-z_]+)",$/gm)].map((match) => match[1]);

describe("Renditions KPIs", () => {
  test("invite links carry the attribution parameter, never an inviter", () => {
    assert.equal(inviteSignupPath(), "/signup?via=invite");
    assert.equal(INVITE_COOKIE, "ppi_invite");
  });

  test("every TypeScript event name is in the database allowlist", () => {
    const migration = readFileSync(new URL("../../supabase/migrations/20260914170000_growth_accuracy_kpis.sql", import.meta.url), "utf8");
    assert.ok(PRODUCT_EVENT_NAMES.includes("signup_from_invite") && PRODUCT_EVENT_NAMES.length >= 23, "event list did not parse");
    for (const name of PRODUCT_EVENT_NAMES) {
      assert.ok(migration.includes(`'${name}'`), `${name} missing from the event_name allowlist`);
    }
  });
});
