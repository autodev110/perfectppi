import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("question outcome history display (plan 15.5)", () => {
  test("uses canonical post visibility and returns a bounded redacted timeline", async () => {
    const queries = await source("src/features/community/queries.ts");
    const route = await source("src/app/api/community/posts/[id]/outcome/route.ts");
    const accountExport = await source("src/lib/privacy/export.ts");
    assert.match(queries, /getCommunityQuestionOutcomeHistory[\s\S]*social_can_view_community_post/);
    assert.match(queries, /community_question_outcome_events[\s\S]*\.limit\(50\)/);
    assert.match(queries, /applies_to_current_answer/);
    assert.match(route, /Cache-Control": "private, no-store"/);
    assert.match(accountExport, /"community_question_outcome_events"[\s\S]*postIds/);
    assert.match(accountExport, /questionOutcomeEvents,/);
  });

  test("keeps history service-only while displaying it on web and iOS", async () => {
    const migration = await source("supabase/migrations/20260912151000_helpful_answers_question_outcomes.sql");
    const web = await source("src/components/shared/question-outcome-control.tsx");
    const ios = await source("mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift");
    assert.match(migration, /REVOKE ALL ON public\.community_question_outcome_events FROM PUBLIC, anon, authenticated/);
    assert.match(web, /View outcome history/);
    assert.match(web, /For an earlier accepted answer/);
    assert.match(ios, /QuestionOutcomeHistoryView/);
    assert.match(ios, /For an earlier accepted answer/);
  });
});
