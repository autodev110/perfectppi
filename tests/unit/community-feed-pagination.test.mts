import { resolveSourceCopy } from "../helpers/localized-source.mts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8").then(resolveSourceCopy);

describe("Community feed cursor pagination", () => {
  test("uses a bounded timestamp and UUID keyset without exposing the RPC", async () => {
    const migration = await source("supabase/migrations/20260913175711_community_feed_cursor_pagination.sql");
    assert.match(migration, /\(post\.created_at, post\.id\) < \(p_before_created_at, p_before_post_id\)/);
    assert.match(migration, /LIMIT LEAST\(GREATEST\(p_limit, 1\), 101\)/);
    assert.match(migration, /social_can_view_community_post\(p_viewer_id, post\.id, false\)/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.social_cursor_community_post_ids/);
  });

  test("keeps the legacy response while cursor clients opt in", async () => {
    const [route, ios] = await Promise.all([
      source("src/app/api/community/posts/route.ts"),
      source("mobile-app/PerfectPPI/Core/Networking/Endpoints/CommunityAPI.swift"),
    ]);
    assert.match(route, /pagination === "cursor"/);
    assert.match(route, /getCommunityPosts\(parsed\.data\.page/);
    assert.match(route, /Cache-Control", "private, no-store"/);
    assert.match(ios, /URLQueryItem\(name: "pagination", value: "cursor"\)/);
    assert.match(ios, /if page > 1/);
    assert.match(ios, /let nextCursor: String\?/);
  });

  test("rejects malformed cursors and provides explicit continuation UI", async () => {
    const [cursor, web, ios] = await Promise.all([
      source("src/features/community/feed-cursor.ts"),
      source("src/app/(public)/community/page.tsx"),
      source("mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift"),
    ]);
    assert.match(cursor, /cursorPayloadSchema\.safeParse/);
    assert.match(cursor, /value\.length > 256/);
    assert.match(web, /Older posts/);
    assert.match(ios, /loadMore\(after: nextCursor\)/);
    assert.match(ios, /CommunityFeedSkeleton/);
  });
});
