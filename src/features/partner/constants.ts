// ============================================================================
// Partner integration constants — shared by the API routes, the workers, and
// the organization settings UI.
// ============================================================================

export const PARTNER_SOURCE_SYSTEMS = ["dealerspace"] as const;
export type PartnerSourceSystem = (typeof PARTNER_SOURCE_SYSTEMS)[number];

export const PARTNER_SCOPES = [
  "inspections:create",
  "inspections:read",
  "artifacts:read",
] as const;
export type PartnerScope = (typeof PARTNER_SCOPES)[number];

export const DEFAULT_PARTNER_SCOPES: PartnerScope[] = [...PARTNER_SCOPES];

/** The four artifacts DealerSpace must have before its Recon phase may close. */
export const REQUIRED_ARTIFACT_TYPES = [
  "inspection_report_json",
  "inspection_report_pdf",
  "vsc_determination_json",
  "vsc_determination_pdf",
] as const;
export type ArtifactType = (typeof REQUIRED_ARTIFACT_TYPES)[number];

export const ARTIFACT_CONTENT_TYPES: Record<ArtifactType, string> = {
  inspection_report_json: "application/json",
  inspection_report_pdf: "application/pdf",
  vsc_determination_json: "application/json",
  vsc_determination_pdf: "application/pdf",
};

export const ARTIFACT_FILENAMES: Record<ArtifactType, string> = {
  inspection_report_json: "inspection-report.json",
  inspection_report_pdf: "inspection-report.pdf",
  vsc_determination_json: "vsc-determination.json",
  vsc_determination_pdf: "vsc-determination.pdf",
};

export const PARTNER_EVENT_TYPES = [
  "inspection.created",
  "inspection.assigned",
  "inspection.accepted",
  "inspection.started",
  "inspection.submitted",
  "inspection.outputs_generating",
  "inspection.deliverables_ready",
  "inspection.delivery_requested",
  "inspection.delivered",
  "inspection.needs_revision",
  "inspection.cancelled",
  "inspection.delivery_failed",
] as const;
export type PartnerEventType = (typeof PARTNER_EVENT_TYPES)[number];

export const INTEGRATION_STATUSES = [
  "created",
  "assigned",
  "accepted",
  "in_progress",
  "submitted",
  "outputs_generating",
  "deliverables_ready",
  "outputs_failed",
  "needs_revision",
  "cancelled",
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const DELIVERY_STATUSES = [
  "not_requested",
  "queued",
  "delivering",
  "delivered",
  "failed",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

// --- Lifetimes ---------------------------------------------------------------

/** Installation codes are typed by a human into another app, so minutes, not days. */
export const INSTALLATION_CODE_TTL_MS = 30 * 60 * 1000;
/** A technician has this long to finish signing in and consenting. */
export const USER_LINK_TRANSACTION_TTL_MS = 15 * 60 * 1000;
/** The authorization code is exchanged machine-to-machine, immediately. */
export const USER_LINK_CODE_TTL_MS = 2 * 60 * 1000;

// --- Rate limits (fixed 60s windows) -----------------------------------------

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMITS = {
  /** Unauthenticated: installation-code exchange, keyed by client IP. */
  exchange: 10,
  /** Writes: inspection creation, user-link initiation. */
  write: 60,
  /** Reads: status, manifest, artifact download. */
  read: 240,
} as const;

// --- Retry/backoff -----------------------------------------------------------

export const OUTPUT_JOB_LEASE_SECONDS = 300;
export const OUTPUT_JOB_MAX_ATTEMPTS = 5;
export const WEBHOOK_LEASE_SECONDS = 120;
export const WEBHOOK_MAX_ATTEMPTS = 8;
export const WEBHOOK_TIMEOUT_MS = 10_000;

/** Exponential backoff with a deterministic jitter band, capped at 1 hour. */
export function backoffDelayMs(attempt: number): number {
  const base = Math.min(30_000 * 2 ** Math.max(attempt - 1, 0), 3_600_000);
  const jitter = Math.floor(Math.random() * Math.min(base * 0.2, 60_000));
  return base + jitter;
}
