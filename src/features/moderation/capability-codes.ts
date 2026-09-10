// Leaf module (no imports): stable moderator capability codes (plan 18.1),
// shared by the server helpers, UI, and the DB parity test.
export const MODERATION_CAPABILITIES = [
  "queue_read",
  "reporter_identity_read",
  "content_decide",
  "account_enforce",
  "evidence_export",
  "legal_hold_review",
] as const;

export type ModerationCapability = (typeof MODERATION_CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<ModerationCapability, string> = {
  queue_read: "Read the queue and case detail",
  reporter_identity_read: "See who reported content",
  content_decide: "Restore or remove content",
  account_enforce: "Warn, restrict, suspend, or ban accounts",
  evidence_export: "Export restricted evidence",
  legal_hold_review: "Preserve and escalate; review legal holds",
};
