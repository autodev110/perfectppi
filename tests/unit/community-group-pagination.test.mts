import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("Community group cursor pagination", () => {
  test("uses bounded service-only keysets for every group directory", async () => {
    const migration = await source("supabase/migrations/20260913230100_group_directory_cursor_pagination.sql");
    for (const name of [
      "social_visible_community_group_post_ids_cursor",
      "search_group_posts_cursor",
      "list_group_members_cursor",
      "list_community_group_faq_cursor",
    ]) {
      assert.match(migration, new RegExp(`CREATE FUNCTION public\\.${name}`));
      assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}`));
    }
    assert.match(migration, /community_posts\(group_id, created_at DESC, id DESC\)/);
    assert.match(migration, /\(post\.created_at, post\.id\) < \(p_before_created_at, p_before_post_id\)/);
    assert.match(migration, /\(ranked\.member_role_rank, ranked\.joined_at, profile\.id\) >/);
    assert.match(migration, /\(faq\.updated_at, faq\.id\) < \(p_before_updated_at, p_before_entry_id\)/);
    assert.doesNotMatch(migration, /DROP FUNCTION/);
  });

  test("binds opaque cursors to the group, directory, and normalized search", async () => {
    const cursor = await source("src/features/community/group-cursor.ts");
    assert.match(cursor, /parsed\.data\.kind !== expectedKind/);
    assert.match(cursor, /parsed\.data\.groupId !== expectedGroupId/);
    assert.match(cursor, /parsed\.data\.q !== normalizeGroupDirectoryQuery\(expectedQuery\)/);
    assert.match(cursor, /value\.length > 512/);
  });

  test("keeps offset compatibility while current web and iOS clients opt into cursors", async () => {
    const [groupRoute, memberRoute, searchRoute, faqRoute, web, iosApi, iosModels, iosView] = await Promise.all([
      source("src/app/api/community/groups/[group]/route.ts"),
      source("src/app/api/community/groups/[group]/members/route.ts"),
      source("src/app/api/community/groups/[group]/search/route.ts"),
      source("src/app/api/community/groups/[group]/faq/route.ts"),
      source("src/app/(public)/community/groups/[slug]/page.tsx"),
      source("mobile-app/PerfectPPI/Core/Networking/Endpoints/CommunityAPI.swift"),
      source("mobile-app/PerfectPPI/Core/Models/Domain.swift"),
      source("mobile-app/PerfectPPI/Features/Community/CommunityGroupsView.swift"),
    ]);
    for (const route of [groupRoute, memberRoute, searchRoute, faqRoute]) {
      assert.match(route, /pagination"\) === "cursor"/);
      assert.match(route, /status: 503/);
      assert.match(route, /nextCursor/);
    }
    assert.match(groupRoute, /getCommunityGroupPosts\(group\.id, page, 20\)/);
    assert.match(memberRoute, /getGroupMembers\(group\.id, page, 50\)/);
    assert.match(searchRoute, /searchCommunityGroupPosts\(group\.id, query, page, 20\)/);
    assert.match(faqRoute, /getGroupFaqEntries\(group\.id, query, page, 50\)/);
    assert.match(web, /getGroupMembersPage\(group\.id, memberCursor, 50\)/);
    assert.match(web, /Back to first results/);
    assert.match(iosApi, /static func groupPage\(slug: String, cursor: String\? = nil\)/);
    assert.match(iosApi, /static func groupMembersPage\(slug: String, cursor: String\? = nil\)/);
    assert.match(iosApi, /static func searchGroupPostsPage\(slug: String, query: String, cursor: String\? = nil\)/);
    assert.match(iosApi, /static func groupFAQPage\(slug: String, query: String = "", cursor: String\? = nil\)/);
    assert.match(iosModels, /struct CommunityGroupDetail:[\s\S]*?let nextCursor: String\?/);
    assert.match(iosView, /Text\("Load more posts"\)/);
    assert.match(iosView, /Text\("Load more results"\)/);
    assert.match(iosView, /Text\("Load more members"\)/);
  });
});
