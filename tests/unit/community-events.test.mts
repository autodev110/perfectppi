import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { buildEventAnnouncement, eventSafetyRule } from "../../src/features/social/events-policy.ts";

const root = process.cwd();

describe("Community events safety and privacy", () => {
  test("blocks explicit unsafe public-road coordination without blocking track days", () => {
    assert.equal(eventSafetyRule("Midnight street racing on Route 9"), "street_racing");
    assert.equal(eventSafetyRule("Intersection takeover this Saturday"), "intersection_takeover");
    assert.equal(eventSafetyRule("Track day at Road Atlanta with helmets required"), null);
  });

  test("keeps exact directions out of the moderated public announcement", () => {
    const announcement = buildEventAnnouncement({
      title: "Cars and coffee",
      description: "A relaxed morning meet for local owners.",
      eventType: "car_meet",
      startsAt: new Date("2026-10-01T14:00:00.000Z"),
      generalLocation: "Midtown Atlanta",
      requirements: "Respect the venue",
    });
    assert.match(announcement, /Midtown Atlanta/);
    assert.match(announcement, /Free event/);
    assert.doesNotMatch(announcement, /123 Secret Street/);
  });

  test("database access is service-only and exact location requires Going", async () => {
    const migration = await readFile(`${root}/supabase/migrations/20260912231000_community_events.sql`, "utf8");
    assert.match(migration, /REVOKE ALL ON public\.community_events FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /community_event_exact_location/);
    assert.match(migration, /rsvp\.status = 'going'/);
    assert.match(migration, /social_profiles_are_blocked/);
    assert.match(migration, /cost_cents integer NOT NULL DEFAULT 0 CHECK \(cost_cents = 0\)/);
    assert.match(migration, /organizer_id uuid NOT NULL REFERENCES public\.profiles\(id\) ON DELETE CASCADE/);
  });

  test("pending official updates stay linked and notify only after moderation", async () => {
    const migration = await readFile(`${root}/supabase/migrations/20260912231000_community_events.sql`, "utf8");
    assert.match(migration, /comment\.moderation_status NOT IN \('rejected', 'legal_hold'\)/);
    assert.match(migration, /community_comments_notify_event_update/);
    assert.match(migration, /notification\.data->>'comment_id' = p_comment_id::text/);
  });

  test("event records participate in account export", async () => {
    const exportSource = await readFile(`${root}/src/lib/privacy/export.ts`, "utf8");
    assert.match(exportSource, /organized community events/);
    assert.match(exportSource, /community event RSVPs/);
    assert.match(exportSource, /official event updates/);
  });

  test("account deletion may anonymize immutable revision authors", async () => {
    const migration = await readFile(`${root}/supabase/migrations/20260912232000_fix_revision_account_deletion.sql`, "utf8");
    assert.match(migration, /pg_trigger_depth\(\) > 1/);
    assert.match(migration, /NEW\.author_id IS NULL/);
    assert.match(migration, /to_jsonb\(NEW\) - 'author_id'/);
  });

  test("post-event photos are service-only, image-only, and attendee-gated", async () => {
    const migration = await readFile(`${root}/supabase/migrations/20260912233000_community_event_photo_thread.sql`, "utf8");
    assert.match(migration, /REVOKE ALL ON public\.community_event_photo_posts FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /event\.starts_at <= now\(\)/);
    assert.match(migration, /rsvp\.status = 'going'/);
    assert.match(migration, /media\.media_type <> 'image'/);
    assert.match(migration, /event\.ends_at \+ interval '90 days'/);
    assert.match(migration, /social_can_view_community_event\(p_viewer_id, event_photo\.event_id, true\)/);
    assert.match(migration, /event_photo_uploader_mismatch/);
    assert.match(migration, /TG_OP = 'INSERT'[\s\S]*can_contribute_community_event_photos/);
  });

  test("event photo posts use the existing moderated assembly pipeline", async () => {
    const actionSource = await readFile(`${root}/src/features/community/actions.ts`, "utf8");
    assert.match(actionSource, /attach_community_event_photo_post/);
    assert.match(actionSource, /expectedMediaCount < 1/);
    assert.match(actionSource, /community_photo_uploads/);
    assert.match(actionSource, /revalidatePath\(`\/community\/events\/\$\{eventPhoto\.event_id\}`\)/);
  });

  test("event photo associations participate in account export", async () => {
    const exportSource = await readFile(`${root}/src/lib/privacy/export.ts`, "utf8");
    assert.match(exportSource, /community event photo posts/);
    assert.match(exportSource, /contributedPhotos/);
  });

  test("notification enum values commit in an earlier migration", async () => {
    const enumMigration = await readFile(`${root}/supabase/migrations/20260912230000_community_event_notification_types.sql`, "utf8");
    const schemaMigration = await readFile(`${root}/supabase/migrations/20260912231000_community_events.sql`, "utf8");
    assert.match(enumMigration, /event_cancelled/);
    assert.match(enumMigration, /event_update/);
    assert.match(schemaMigration, /'event_cancelled'::public\.notification_type/);
  });
});
