import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();

describe("community feed quality controls", () => {
  test("keeps feed preferences private and applies them after visibility checks", async () => {
    const migration = await readFile(
      `${root}/supabase/migrations/20260913020000_community_feed_quality_controls.sql`,
      "utf8",
    );

    assert.match(migration, /REVOKE ALL ON TABLE public\.community_feed_mutes FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /social_can_view_community_post\(p_viewer_id, post\.id, false\)/);
    assert.match(migration, /mute\.scope = 'group'/);
    assert.match(migration, /mute\.scope = 'post_type'/);
    assert.match(migration, /mute\.scope = 'vehicle_topic'/);
    assert.match(migration, /row_number\(\) OVER/);
  });

  test("includes feed preferences in account exports", async () => {
    const exportSource = await readFile(`${root}/src/lib/privacy/export.ts`, "utf8");
    assert.match(exportSource, /community feed preferences/);
    assert.match(exportSource, /feedMutes: communityFeedMutes/);
  });

  test("keeps joined-group activity in the Groups section", async () => {
    const querySource = await readFile(`${root}/src/features/community/queries.ts`, "utf8");
    assert.match(querySource, /includeGroupPosts: false/);
  });
});
