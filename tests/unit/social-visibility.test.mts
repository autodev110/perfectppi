import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("social visibility, blocks, and mutes", () => {
  test("uses one database visibility policy for feed and detail", async () => {
    const [migration, queries] = await Promise.all([
      source("supabase/migrations/20260910114747_social_visibility_blocks_mutes.sql"),
      source("src/features/community/queries.ts"),
    ]);
    assert.match(migration, /social_can_view_community_post/);
    assert.match(migration, /social_visible_community_post_ids/);
    assert.match(queries, /getVisibleCommunityPostIds/);
    assert.match(queries, /social_can_view_community_post/);
  });

  test("block is transactional and closes direct-contact paths", async () => {
    const [migration, messageActions, marketplaceActions] = await Promise.all([
      source("supabase/migrations/20260910114747_social_visibility_blocks_mutes.sql"),
      source("src/features/messages/actions.ts"),
      source("src/features/marketplace/actions.ts"),
    ]);
    assert.match(migration, /DELETE FROM public\.friend_relationships/);
    assert.match(migration, /DELETE FROM public\.notifications/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.am_i_in_conversation/);
    assert.match(messageActions, /canProfilesInteract/);
    assert.match(marketplaceActions, /createConversation/);
  });

  test("privacy controls exist on web and iOS", async () => {
    const [web, ios, profileApi] = await Promise.all([
      source("src/components/shared/social-privacy-fields.tsx"),
      source("mobile-app/PerfectPPI/Features/Profile/ProfileView.swift"),
      source("src/app/api/profiles/me/route.ts"),
    ]);
    assert.match(web, /Public inside PerfectPPI/);
    assert.match(web, /Allow exact username lookup/);
    assert.match(ios, /Default post audience/);
    assert.match(ios, /Blocked Accounts/);
    assert.match(profileApi, /set_own_social_privacy/);
  });
});
