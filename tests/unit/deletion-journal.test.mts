import { test } from "node:test";
import assert from "node:assert/strict";
import { signedDeletionJournal, verifiedDeletionJournal } from "../../src/lib/privacy/deletion-journal.ts";

test("deletion journals detect changed identities and signatures across restore", () => {
  const prior = process.env.PRIVACY_DELETION_JOURNAL_KEY;
  process.env.PRIVACY_DELETION_JOURNAL_KEY = "test-key-for-deletion-journals-at-least-32";
  try {
    const input = { version: 1 as const, requestId: "10000000-0000-4000-8000-000000000001",
      profileId: "10000000-0000-4000-8000-000000000002", authUserId: "10000000-0000-4000-8000-000000000003",
      requestedAt: "2026-10-14T10:00:00Z" };
    const journal = signedDeletionJournal(input);
    assert.deepEqual(verifiedDeletionJournal(JSON.parse(JSON.stringify(journal))), input);
    assert.throws(() => verifiedDeletionJournal({ ...journal, entry: { ...input, authUserId: input.profileId } }), /signature/);
    assert.throws(() => verifiedDeletionJournal({ ...journal, signature: "0".repeat(64) }), /signature/);
    process.env.PRIVACY_DELETION_JOURNAL_KEY = "another-test-key-at-least-thirty-two-characters";
    assert.throws(() => verifiedDeletionJournal(journal), /signature/);
  } finally {
    if (prior === undefined) delete process.env.PRIVACY_DELETION_JOURNAL_KEY;
    else process.env.PRIVACY_DELETION_JOURNAL_KEY = prior;
  }
});
