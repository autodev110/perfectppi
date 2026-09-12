import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const workerSource = readFileSync(new URL("../../src/features/operations/worker-runs.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260912193242_operational_worker_runs.sql", import.meta.url), "utf8");

const routes: Record<string, string> = {
  outputs: "outputs",
  deliveries: "deliveries",
  "storage-cleanup": "storage_cleanup",
  "community-media-migration": "community_media_migration",
  "retention-purge": "retention_purge",
  "moderation-outbox": "moderation_outbox",
  "marketplace-saved-searches": "marketplace_saved_searches",
};

describe("operational worker run tracking", () => {
  test("keeps the application and database worker code sets aligned", () => {
    for (const workerCode of Object.values(routes)) {
      assert.match(workerSource, new RegExp(`"${workerCode}"`));
      assert.match(migration, new RegExp(`'${workerCode}'`));
    }
  });

  test("wraps every scheduled worker route", () => {
    for (const [directory, workerCode] of Object.entries(routes)) {
      const route = readFileSync(new URL(`../../src/app/api/internal/workers/${directory}/route.ts`, import.meta.url), "utf8");
      assert.match(route, new RegExp(`runTrackedWorker\\("${workerCode}"`), `${directory} is not tracked`);
      assert.doesNotMatch(route, /message:\s*String\(error\)/, `${directory} exposes raw worker errors`);
    }
  });

  test("stores operational metadata without raw results or exception text", () => {
    assert.doesNotMatch(migration, /^\s*(payload|last_error)\s+/im);
    assert.doesNotMatch(workerSource, /error\.message|String\(error\)/);
    assert.match(migration, /REVOKE ALL ON public\.operational_worker_runs FROM PUBLIC, anon, authenticated/);
  });
});
