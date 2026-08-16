import { NextResponse } from "next/server";

// ============================================================================
// Partner API error vocabulary.
//
// DealerSpace branches on `error`, so these strings are part of the contract.
// `message` is for humans reading logs and must never disclose whether a
// resource belongs to another organization — unknown and forbidden both come
// back as `inspection_not_found`.
// ============================================================================

export const PARTNER_ERRORS = {
  // Authentication / authorization
  missing_credentials: 401,
  invalid_credentials: 401,
  connection_revoked: 401,
  insufficient_scope: 403,
  organization_mismatch: 403,

  // Request shape
  invalid_request: 400,
  invalid_vin: 400,
  missing_idempotency_key: 400,
  unsupported_source_system: 400,

  // User linking
  user_link_required: 409,
  invalid_user_link: 409,
  link_callback_not_configured: 409,
  invalid_authorization_code: 400,
  authorization_expired: 400,

  // Installation
  invalid_installation_code: 400,
  installation_code_expired: 400,
  installation_code_already_used: 409,
  connection_already_exists: 409,
  invalid_callback_url: 400,

  // Resources
  inspection_not_found: 404,
  artifact_not_found: 404,
  deliverables_not_ready: 409,
  idempotency_conflict: 409,
  snapshot_locked: 409,

  // Infrastructure
  rate_limited: 429,
  storage_unavailable: 503,
  internal_error: 500,
} as const;

export type PartnerErrorCode = keyof typeof PARTNER_ERRORS;

export function partnerError(
  code: PartnerErrorCode,
  message?: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: code, message: message ?? defaultMessage(code), ...extra },
    {
      status: PARTNER_ERRORS[code],
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function defaultMessage(code: PartnerErrorCode): string {
  switch (code) {
    case "missing_credentials":
      return "Provide the connection token as an Authorization: Bearer header.";
    case "invalid_credentials":
      return "The connection token is not valid.";
    case "connection_revoked":
      return "This connection has been revoked.";
    case "insufficient_scope":
      return "This connection is not granted the scope required for this operation.";
    case "organization_mismatch":
      return "externalOrganizationId does not match the organization bound to this connection.";
    case "missing_idempotency_key":
      return "An Idempotency-Key header is required.";
    case "user_link_required":
      return "The DealerSpace user has not linked a Perfect PPI account yet.";
    case "invalid_user_link":
      return "The linked Perfect PPI account is not an active technician in the connected organization.";
    case "link_callback_not_configured":
      return "This connection has no registered user-link callback URL.";
    case "idempotency_conflict":
      return "This Idempotency-Key was already used with a different payload.";
    case "deliverables_not_ready":
      return "The inspection does not yet have every required artifact.";
    case "inspection_not_found":
      return "No such inspection for this connection.";
    case "artifact_not_found":
      return "No such artifact for this connection.";
    case "rate_limited":
      return "Too many requests. Retry after the window resets.";
    default:
      return code.replace(/_/g, " ");
  }
}
