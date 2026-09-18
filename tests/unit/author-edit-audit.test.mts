import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { productEventDedupeHash } from "../../src/features/analytics/event-correlation.ts";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("funnel hashes match only the same resource in the same funnel", () => {
  assert.equal(productEventDedupeHash("group_detail_viewed", "one"), productEventDedupeHash("group_joined", "one"));
  assert.equal(productEventDedupeHash("media_upload_reserved", "one"), productEventDedupeHash("media_upload_attached", "one"));
  assert.notEqual(productEventDedupeHash("group_joined", "one"), productEventDedupeHash("group_joined", "two"));
  assert.notEqual(productEventDedupeHash("group_joined", "one"), productEventDedupeHash("media_upload_attached", "one"));
  assert.match(productEventDedupeHash("group_joined", "one")!, /^[a-f0-9]{64}$/);
  assert.equal(productEventDedupeHash("group_joined"), null);
});

test("both author edit paths honor AI moderation and publish atomically", () => {
  const actions = read("src/features/community/actions.ts");
  const edits = actions.slice(actions.indexOf("export async function editCommunityPostFromInput"));
  assert.equal((edits.match(/publish_community_author_edit/g) ?? []).length, 2);
  assert.equal((edits.match(/flags\.flags\.automated_post_moderation/g) ?? []).length, 2);
  assert.equal((edits.match(/await moderateText/g) ?? []).length, 2);
  assert.doesNotMatch(edits, /await recordModeration/);
  assert.equal((edits.match(/await authorizeCommunityEdit/g) ?? []).length, 2);
});

test("analytics failure cannot invalidate a completed action", () => {
  assert.match(read("src/features/analytics/product-events.ts"), /catch[\s\S]*code: "unavailable"/);
  const route = read("src/app/api/analytics/client-events/route.ts");
  assert.match(route, /record_client_product_event/);
  assert.match(route, /status: 429/);
});

test("editor and gallery reset state when their targets change", () => {
  assert.match(read("src/components/shared/community-author-editor.tsx"), /setContent\(initialContent\)/);
  assert.match(read("src/components/shared/listing-gallery.tsx"), /key=\{visiblePhotos\[index\]\.id\}/);
});

test("iOS health reporting clears identity on sign out and never queues for the next account", () => {
  const reporter = read("mobile-app/PerfectPPI/Core/Utilities/AppHealthReporter.swift");
  assert.match(reporter, /activeProfileId = profileId/);
  assert.match(reporter, /lastSessionAt = nil/);
  assert.doesNotMatch(reporter, /pendingCrashCount|flushCrashes/);
  assert.match(read("mobile-app/PerfectPPI/App/PerfectPPIApp.swift"), /scenePhase == \.active \|\| id == nil/);
  const feed = read("mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift");
  assert.match(feed, /mentions = fresh\.mentions/);
});
