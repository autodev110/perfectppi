import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("accessibility foundation", () => {
  test("web layouts expose a keyboard skip target and motion/contrast preferences", () => {
    assert.match(read("src/app/layout.tsx"), /href="#main-content"/);
    for (const path of [
      "src/components/layout/portal-layout.tsx",
      "src/app/(public)/layout.tsx",
      "src/app/(auth)/layout.tsx",
    ]) {
      assert.match(read(path), /id="main-content"/);
      assert.match(read(path), /tabIndex=\{-1\}/);
    }
    const css = read("src/app/globals.css");
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /prefers-contrast: more/);
  });

  test("post media supports author descriptions and keyboard carousel controls", () => {
    const migration = read("supabase/migrations/20260913161525_accessibility_media_descriptions.sql");
    assert.match(migration, /ADD COLUMN IF NOT EXISTS alt_text text/);
    assert.match(migration, /char_length\(alt_text\) BETWEEN 1 AND 300/);

    const actions = read("src/features/community/actions.ts");
    assert.match(actions, /altText: z\.string\(\)\.trim\(\)\.max\(300/);
    assert.match(actions, /alt_text: item\.mediaType === "image"/);

    const carousel = read("src/components/shared/post-media-carousel.tsx");
    assert.match(carousel, /aria-roledescription="carousel"/);
    assert.match(carousel, /aria-label="Previous media"/);
    assert.match(carousel, /aria-label="Next media"/);
    assert.match(carousel, /alt=\{item\.alt_text \?\? ""\}/);
    assert.doesNotMatch(carousel, /alt=\{`Post media/);
  });

  test("iOS shared controls honor Reduce Motion and expose meaningful state", () => {
    const components = read("mobile-app/PerfectPPI/DesignSystem/Components.swift");
    assert.match(components, /@Environment\(\\\.accessibilityReduceMotion\)/);
    assert.ok(components.includes('accessibilityLabel("Status: \\(text)")'));

    const messages = read("mobile-app/PerfectPPI/Features/Messages/MessagesView.swift");
    assert.match(messages, /accessibilityLabel\("New message"\)/);
    assert.match(messages, /accessibilityLabel\("Add attachment"\)/);
    assert.match(messages, /"Send message"/);
    assert.match(messages, /accessibilityValue\(conversation\.unreadCount/);

    const feed = read("mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift");
    assert.match(feed, /Describe photo for VoiceOver/);
    assert.match(feed, /altText: item\.kind == \.image/);
    assert.match(feed, /accessibilityLabel\("Community options"\)/);
  });
});
