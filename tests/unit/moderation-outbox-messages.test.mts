import assert from "node:assert/strict";
import { describe, test } from "node:test";

const {
  authorRemovedMessage,
  authorRestoredMessage,
  reportReceivedMessage,
  reporterReviewCompleteMessage,
  moderatorAlertMessage,
  operationalWebhookBody,
} = await import("../../src/features/moderation/outbox-messages.ts");

const ids = { outboxId: "11111111-1111-4111-8111-111111111111", caseId: "22222222-2222-4222-8222-222222222222" };

describe("moderation notification privacy (plan 17.4 / 22.1 / 22.2)", () => {
  test("author removal notice names the policy in-app but never in the push payload", () => {
    const draft = authorRemovedMessage({
      ...ids, entityType: "community_post", entityId: "33333333-3333-4333-8333-333333333333",
      policyCategory: "harassment", decidedAt: "2026-09-10T12:00:00Z",
    });
    assert.match(draft.body, /Harassment or bullying/);
    assert.match(draft.body, /appeal/i);
    assert.equal(draft.data.appealable, true);
    assert.ok(draft.push);
    const push = JSON.stringify(draft.push);
    assert.ok(!/harass/i.test(push), "push payload leaked the policy category");
    assert.ok(!("policyCategory" in (draft.push?.data ?? {})));
    // Never anything about reporters or counts, in-app or push.
    for (const text of [draft.title, draft.body, JSON.stringify(draft.data), push]) {
      assert.ok(!/report(er|s)?\b/i.test(text), `mentioned reports: ${text}`);
    }
  });

  test("author restoration notice carries no allegation details", () => {
    const draft = authorRestoredMessage({ ...ids, entityType: "community_comment", entityId: "33333333-3333-4333-8333-333333333333" });
    assert.match(draft.title, /comment/);
    assert.ok(!/reason|reporter|spam|harass/i.test(draft.body));
    assert.ok(draft.push && !/reason|reporter/i.test(draft.push.body));
  });

  test("reporter notices confirm receipt and completion without revealing the outcome", () => {
    const receipt = reportReceivedMessage({ ...ids, hidden: true });
    assert.match(receipt.body, /hidden/);
    assert.equal(receipt.push, null);
    const monitoring = reportReceivedMessage({ ...ids, hidden: false });
    assert.ok(!/hidden/.test(monitoring.body));
    const done = reporterReviewCompleteMessage(ids);
    assert.ok(!/removed|restored|violation|banned|suspend/i.test(done.body), "completion notice leaked the outcome");
    assert.equal(done.push, null);
  });

  test("moderator alerts and webhook bodies carry identifiers only", () => {
    const alert = moderatorAlertMessage({ ...ids, eventType: "sla_alert", stage: "overdue", priority: "normal", slaDueAt: "2026-09-10T00:00:00Z" });
    assert.match(alert.title, /Overdue/);
    assert.ok(!/content|post text/i.test(JSON.stringify(alert.push)));
    const backlog = moderatorAlertMessage({ ...ids, eventType: "queue_backlog", openCases: 30, casesOver24h: 8, sustained: true });
    assert.match(backlog.title, /sustained/i);
    const body = operationalWebhookBody({ eventType: "case_escalated", caseId: ids.caseId, priority: "urgent", caseUrl: "https://example.test/admin/moderation/cases/x" });
    assert.deepEqual(Object.keys(body).sort(), ["caseId", "eventType", "priority", "stage", "text"]);
    assert.ok(!/reason|reporter|content/i.test(body.text));
  });
});
