import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const DELETION_JOURNAL_PREFIX = "privacy_deletion_journal/";
const entrySchema = z.object({
  version: z.literal(1),
  requestId: z.string().uuid(),
  profileId: z.string().uuid(),
  authUserId: z.string().uuid(),
  requestedAt: z.string().datetime({ offset: true }),
}).strict();
export type DeletionJournalEntry = z.infer<typeof entrySchema>;

function signingKey(): string {
  const key = process.env.PRIVACY_DELETION_JOURNAL_KEY ?? process.env.LEGAL_EVIDENCE_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.length < 32) throw new Error("A stable privacy deletion journal key is required");
  return key;
}

function signature(entry: DeletionJournalEntry): string {
  return createHmac("sha256", signingKey()).update(JSON.stringify(entrySchema.parse(entry))).digest("hex");
}

export function signedDeletionJournal(input: DeletionJournalEntry) {
  const entry = entrySchema.parse(input);
  return { entry, signature: signature(entry) };
}

export function verifiedDeletionJournal(value: unknown): DeletionJournalEntry {
  const envelope = z.object({ entry: entrySchema, signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(value);
  const expected = Buffer.from(signature(envelope.entry), "hex");
  if (!timingSafeEqual(expected, Buffer.from(envelope.signature, "hex"))) throw new Error("Deletion journal signature is invalid");
  return envelope.entry;
}
