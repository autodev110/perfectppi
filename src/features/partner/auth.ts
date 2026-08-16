
import type { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseConnectionToken, secureCompareHex, sha256Hex } from "./crypto";
import { partnerError } from "./errors";
import {
  RATE_LIMITS,
  RATE_LIMIT_WINDOW_MS,
  type PartnerScope,
} from "./constants";
import type { Database } from "@/types/database";

// ============================================================================
// Bearer authentication for the partner API.
//
// Tenancy is resolved *from the credential*, never from the request body. A
// payload's externalOrganizationId is only ever compared against the value
// bound to the authenticated connection (see requireMatchingExternalOrg).
// ============================================================================

export type PartnerConnection =
  Database["public"]["Tables"]["partner_connections"]["Row"];

export type PartnerAuthResult =
  | { connection: PartnerConnection }
  | { response: NextResponse };

interface AuthenticateOptions {
  /** Scope the connection must hold for this operation. */
  scope: PartnerScope;
  /** Which rate-limit budget this route draws from. */
  limit?: keyof typeof RATE_LIMITS;
}

export async function authenticatePartnerRequest(
  request: Request,
  options: AuthenticateOptions,
): Promise<PartnerAuthResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return { response: partnerError("missing_credentials") };
  }

  const parsed = parseConnectionToken(token);
  if (!parsed) {
    // Malformed tokens are rejected before any database work, so a flood of
    // junk cannot be used to probe timing on the real lookup.
    return { response: partnerError("invalid_credentials") };
  }

  const admin = createAdminClient();

  const { data: candidate } = await admin
    .from("partner_connections")
    .select("*")
    .eq("token_prefix", parsed.prefix)
    .maybeSingle();

  // The presented token is always hashed and compared, even when no row was
  // found, so a missing prefix and a wrong secret take the same path.
  const presentedHash = sha256Hex(token);
  const storedHash = candidate?.token_hash ?? sha256Hex(`absent:${parsed.prefix}`);
  const matches = secureCompareHex(presentedHash, storedHash);

  if (!candidate || !matches) {
    return { response: partnerError("invalid_credentials") };
  }

  if (candidate.status !== "active") {
    return { response: partnerError("connection_revoked") };
  }

  const limited = await enforceRateLimit(
    `conn:${candidate.id}`,
    RATE_LIMITS[options.limit ?? "read"],
  );
  if (limited) return { response: limited };

  if (!candidate.scopes.includes(options.scope)) {
    return {
      response: partnerError(
        "insufficient_scope",
        `This connection is missing the "${options.scope}" scope.`,
        { requiredScope: options.scope, grantedScopes: candidate.scopes },
      ),
    };
  }

  // Last-used is observability, not correctness — never block the request on it.
  void admin
    .from("partner_connections")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", candidate.id)
    .then(({ error }) => {
      if (error) console.error("partner: last_used_at update failed", error.message);
    });

  return { connection: candidate };
}

/**
 * The payload may state which DealerSpace organization it belongs to, but that
 * claim only ever *narrows* — it can never widen access beyond the organization
 * already bound to the authenticated connection.
 */
export function requireMatchingExternalOrg(
  connection: PartnerConnection,
  externalOrganizationId: string,
): NextResponse | null {
  if (externalOrganizationId !== connection.external_organization_id) {
    return partnerError("organization_mismatch");
  }
  return null;
}

export function extractBearerToken(request: Request): string | null {
  const header =
    request.headers.get("authorization") ?? request.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// ============================================================================
// Rate limiting
//
// Fixed 60-second windows counted in Postgres, so the limit holds across every
// serverless instance rather than per-process.
// ============================================================================

export async function enforceRateLimit(
  bucketKey: string,
  maxRequests: number,
): Promise<NextResponse | null> {
  const windowStart = new Date(
    Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS,
  );

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("partner_rate_limit_hit", {
    p_bucket_key: bucketKey,
    p_window_start: windowStart.toISOString(),
  });

  if (error) {
    // Fail open: a counter outage must not take the partner API down with it.
    console.error("partner: rate limit check failed", error.message);
    return null;
  }

  if ((data ?? 0) > maxRequests) {
    const retryAfter = Math.ceil(
      (windowStart.getTime() + RATE_LIMIT_WINDOW_MS - Date.now()) / 1000,
    );
    const response = partnerError("rate_limited");
    response.headers.set("Retry-After", String(Math.max(retryAfter, 1)));
    return response;
  }

  return null;
}

/** Best-effort client address for rate-limiting unauthenticated endpoints. */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
