import { resolveSourceCopy } from "../helpers/localized-source.mts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8").then(resolveSourceCopy);

describe("privacy-safe operational telemetry", () => {
  test("projects normalized query statistics through a service-only aggregate", async () => {
    const migration = await source("supabase/migrations/20260913230300_operational_query_metrics.sql");
    assert.match(migration, /CREATE FUNCTION public\.get_operational_query_metrics\(\)/);
    assert.match(migration, /FROM extensions\.pg_stat_statements statement/);
    assert.match(migration, /FROM extensions\.pg_stat_statements_info info/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_operational_query_metrics\(\) FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_operational_query_metrics\(\) TO service_role/);
    assert.doesNotMatch(migration, /'query',\s*statement\.query/);
  });

  test("logs only closed operation metadata and preserves the original error", async () => {
    const telemetry = await source("src/features/operations/telemetry.ts");
    assert.match(telemetry, /event: "operation_slow"/);
    assert.match(telemetry, /event: "operation_failed"/);
    assert.match(telemetry, /operationCode,/);
    assert.match(telemetry, /durationMs:/);
    assert.match(telemetry, /throw error/);
    assert.doesNotMatch(telemetry, /error\.message|String\(error\)|url:|key:|profileId|userId/);
  });

  test("covers R2 network operations and shows aggregates only to admins", async () => {
    const [storage, dashboard, queries] = await Promise.all([
      source("src/lib/storage/r2.ts"),
      source("src/app/(admin)/admin/analytics/page.tsx"),
      source("src/features/analytics/queries.ts"),
    ]);
    for (const code of ["storage_put", "storage_get", "storage_copy", "storage_delete", "storage_list", "storage_public_probe"]) {
      assert.match(storage, new RegExp(`observeOperationalOperation\\(\\s*"${code}"`));
    }
    assert.doesNotMatch(storage, /await (?:client|getS3Client\(\))\.send/);
    assert.match(dashboard, /await requireRole\(\["admin"\]\)/);
    assert.match(dashboard, /Database reliability/);
    assert.match(queries, /rpc\("get_operational_query_metrics"\)/);
  });

  test("bounds and caches authenticated iOS feed images while web defers decoding", async () => {
    const [secureImage, iosFeed, webCarousel] = await Promise.all([
      source("mobile-app/PerfectPPI/Core/Utilities/SecureImage.swift"),
      source("mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift"),
      source("src/components/shared/post-media-carousel.tsx"),
    ]);
    assert.match(secureImage, /totalCostLimit = 96 \* 1_024 \* 1_024/);
    assert.match(secureImage, /CGImageSourceCreateThumbnailAtIndex/);
    assert.match(secureImage, /Task\.checkCancellation\(\)/);
    assert.match(iosFeed, /maxPixelSize: 1_280/);
    assert.match(webCarousel, /loading="lazy"/);
    assert.match(webCarousel, /decoding="async"/);
  });
});
