import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

// Plan 6.2 / 31.1: public disclosures must describe the moderation
// configuration that actually ships. These checks read the launch flag seeds
// and the page sources so a flag flip without a copy change fails CI.

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

const flagsSql = read("supabase/migrations/20260910190000_product_feature_flags.sql");
const seeded = new Map([...flagsSql.matchAll(/\('([a-z_]+)',\s+(true|false)\)/g)].map((m) => [m[1], m[2] === "true"]));
const guidelines = read("src/app/(public)/community-guidelines/page.tsx");
const aiDisclosure = read("src/app/(public)/ai-disclosure/page.tsx");
const privacy = read("src/app/(public)/privacy/page.tsx");
const support = read("src/app/(public)/support/page.tsx");
const constants = read("src/lib/legal/constants.ts");

describe("disclosure parity with the shipped configuration", () => {
  test("launch mode (AI gate off) is what the disclosures describe", () => {
    assert.equal(seeded.get("automated_post_moderation"), false, "if the AI gate is turned on, update the disclosures first");
    assert.match(aiDisclosure, /are <strong>not<\/strong> sent to Gemini/);
    assert.match(privacy, /are not sent to Gemini or another general-purpose AI classifier/);
    assert.match(guidelines, /no routine human or AI approval step/);
    assert.ok(!/Community text and cleared still images are sent to Gemini/.test(privacy), "stale AI-gate sentence remains in the privacy policy");
  });

  test("video off is what the disclosures describe", () => {
    assert.equal(seeded.get("community_video_uploads"), false, "if video is enabled, update the disclosures first");
    for (const [name, text] of [["ai-disclosure", aiDisclosure], ["privacy", privacy], ["guidelines", guidelines]] as const) {
      assert.match(text, /video (uploads are disabled|is not available)/i, `${name} must say Community video is off`);
      assert.ok(!/held for manual review/i.test(text), `${name} still describes video manual review`);
    }
  });

  test("photo safeguard and metadata removal are described as active", () => {
    assert.equal(seeded.get("specialist_image_safeguard"), true);
    assert.match(aiDisclosure, /specialist illegal-content safeguard/);
    assert.match(aiDisclosure, /metadata removed/);
    assert.match(privacy, /re-encoded with metadata removed/);
  });

  test("reporting, blocking, appeals, retention, and emergency copy are present where the plan requires them", () => {
    assert.match(guidelines, /first valid report hides/i);
    assert.match(guidelines, /never told who reported/);
    assert.match(guidelines, /cannot recall copies/);
    assert.match(guidelines, /not an emergency service/);
    for (const section of ["Contact", "Urgent safety", "Reporting Community content", "Blocking and muting", "Response expectations", "Appeals", "Copyright and intellectual property"]) {
      assert.ok(support.includes(`<h2>${section}</h2>`), `support page is missing the "${section}" section`);
    }
    assert.match(privacy, /reporter identity is visible only to team members holding a separately granted permission/);
    assert.match(privacy, /until a period is approved for a record class/);
  });

  test("published response targets match the moderation SLA constants", () => {
    assert.match(constants, /urgentHours: 4/);
    assert.match(constants, /ordinaryHours: 24/);
    assert.match(constants, /appealHours: 72/);
    const sla = read("supabase/migrations/20260910122955_moderation_cases_and_revisions.sql");
    assert.match(sla, /interval '4 hours' ELSE interval '24 hours'/, "SLA intervals in the report transaction changed; update MODERATION_RESPONSE_TARGETS and the copy");
  });

  test("Community content is not described as anonymously viewable", () => {
    assert.ok(!/community posts, comments, reviews, and their approved media can be available without signing in/.test(privacy));
    assert.match(privacy, /require a signed-in PerfectPPI account/);
  });
});
