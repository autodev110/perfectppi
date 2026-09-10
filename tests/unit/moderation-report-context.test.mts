import assert from "node:assert/strict";
import { describe, test } from "node:test";

process.env.REPORT_CONTEXT_SECRET = "test-only-report-context-secret-at-least-32-bytes";

const { createReportContext, verifyReportContext } = await import(
  "../../src/features/moderation/report-context.ts"
);

const expected = {
  viewerId: "55000000-0000-0000-0000-000000000001",
  entityType: "community_post" as const,
  entityId: "55100000-0000-0000-0000-000000000001",
};

describe("moderation report contexts", () => {
  test("binds a visible revision to its viewer and entity", () => {
    const token = createReportContext({
      ...expected,
      revisionId: "55200000-0000-0000-0000-000000000001",
    });
    const verified = verifyReportContext(token, expected);
    assert.equal(verified?.revisionId, "55200000-0000-0000-0000-000000000001");
    assert.equal(verifyReportContext(token, { ...expected, viewerId: "55000000-0000-0000-0000-000000000002" }), null);
  });

  test("rejects payload and signature tampering", () => {
    const token = createReportContext({
      ...expected,
      revisionId: "55200000-0000-0000-0000-000000000001",
    });
    const [payload, signature] = token.split(".");
    assert.equal(verifyReportContext(`${payload}x.${signature}`, expected), null);
    assert.equal(verifyReportContext(`${payload}.${signature.slice(0, -1)}x`, expected), null);
  });
});
