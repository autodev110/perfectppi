import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientAddress, enforceRateLimit } from "@/features/partner/auth";
import { partnerError } from "@/features/partner/errors";
import {
  encryptSecret,
  generateConnectionToken,
  generateWebhookSecret,
  isPartnerEncryptionConfigured,
  normalizeInstallationCode,
  sha256Hex,
} from "@/features/partner/crypto";
import { checkUrlIsSafeDestination } from "@/features/partner/url-safety";
import { RATE_LIMITS } from "@/features/partner/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/v1/partner/connections/exchange
//
// The one unauthenticated partner endpoint: the installation code *is* the
// credential. It is single-use, short-lived, and only ever compared as a hash.
//
// Returns a connection token and webhook signing secret only in the exchange
// response. An exact replay during the original code TTL rotates the same
// connection and returns fresh credentials, allowing recovery from a lost HTTP
// response without making stored secrets readable.
// ============================================================================

const bodySchema = z.object({
  code: z.string().min(1).max(64),
  externalOrganizationId: z.string().trim().min(1).max(128),
  displayName: z.string().trim().max(200).optional(),
  webhookUrl: z.string().trim().max(2048),
  userLinkRedirectUri: z.string().trim().max(2048),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(
    `exchange:${clientAddress(request)}`,
    RATE_LIMITS.exchange,
  );
  if (limited) return limited;

  if (!isPartnerEncryptionConfigured()) {
    return partnerError(
      "internal_error",
      "Partner credential encryption is not configured on this deployment.",
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return partnerError("invalid_request", "Body must be JSON.");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return partnerError("invalid_request", parsed.error.errors[0].message, {
      field: parsed.error.errors[0].path.join("."),
    });
  }

  const { externalOrganizationId, displayName, webhookUrl, userLinkRedirectUri } =
    parsed.data;

  // Both destinations are validated here, once, and then resolved from the
  // connection forever after — no request may ever supply its own callback.
  for (const [field, value] of [
    ["webhookUrl", webhookUrl],
    ["userLinkRedirectUri", userLinkRedirectUri],
  ] as const) {
    const check = await checkUrlIsSafeDestination(value);
    if (!check.ok) {
      return partnerError(
        "invalid_callback_url",
        `${field} was rejected: ${check.reason}${check.detail ? ` (${check.detail})` : ""}`,
        { field },
      );
    }
  }

  const normalizedCode = normalizeInstallationCode(parsed.data.code);
  if (!normalizedCode) {
    return partnerError("invalid_installation_code");
  }

  const admin = createAdminClient();

  const { data: codeRow } = await admin
    .from("partner_installation_codes")
    .select("id, organization_id, scopes, status, expires_at, consumed_connection_id")
    .eq("code_hash", sha256Hex(normalizedCode))
    .maybeSingle();

  if (!codeRow) {
    return partnerError("invalid_installation_code");
  }

  const { data: organization } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", codeRow.organization_id)
    .single();

  if (!organization) {
    return partnerError("internal_error", "The organization for this code no longer exists.");
  }

  // A DealerSpace write or HTTP response can fail after the first exchange.
  // During the code's original TTL, an exact replay recovers by rotating the
  // already-created connection and returning fresh one-time credentials. This
  // prevents a consumed code from stranding an active remote connection.
  if (codeRow.status === "consumed") {
    if (
      new Date(codeRow.expires_at).getTime() < Date.now()
      || !codeRow.consumed_connection_id
    ) {
      return partnerError("installation_code_already_used");
    }

    const { data: existing } = await admin
      .from("partner_connections")
      .select(
        "id, status, scopes, connected_at, external_organization_id, webhook_url, user_link_redirect_uri",
      )
      .eq("id", codeRow.consumed_connection_id)
      .eq("organization_id", codeRow.organization_id)
      .maybeSingle();

    if (
      !existing
      || existing.status !== "active"
      || existing.external_organization_id !== externalOrganizationId
      || existing.webhook_url !== webhookUrl
      || existing.user_link_redirect_uri !== userLinkRedirectUri
    ) {
      return partnerError("installation_code_already_used");
    }

    const recoveredCredentials = generateConnectionToken();
    const recoveredWebhookSecret = generateWebhookSecret();
    const { data: recovered, error: recoveryError } = await admin
      .from("partner_connections")
      .update({
        token_prefix: recoveredCredentials.tokenPrefix,
        token_hash: recoveredCredentials.tokenHash,
        token_last_four: recoveredCredentials.tokenLastFour,
        webhook_secret_ciphertext: encryptSecret(recoveredWebhookSecret),
        credentials_rotated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("status", "active")
      .select("id, scopes, connected_at")
      .maybeSingle();

    if (recoveryError || !recovered) {
      console.error("partner: connection recovery failed", recoveryError?.message);
      return partnerError("internal_error");
    }

    return NextResponse.json(
      {
        connectionId: recovered.id,
        organization: { id: organization.id, name: organization.name },
        scopes: recovered.scopes,
        connectedAt: recovered.connected_at,
        token: recoveredCredentials.token,
        webhookSecret: recoveredWebhookSecret,
        webhookUrl,
        userLinkRedirectUri,
        recovered: true,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (codeRow.status !== "pending") {
    return partnerError("invalid_installation_code");
  }

  if (new Date(codeRow.expires_at).getTime() < Date.now()) {
    return partnerError("installation_code_expired");
  }

  const credentials = generateConnectionToken();
  const webhookSecret = generateWebhookSecret();

  const { data: connection, error: insertError } = await admin
    .from("partner_connections")
    .insert({
      organization_id: codeRow.organization_id,
      source_system: "dealerspace",
      external_organization_id: externalOrganizationId,
      display_name: displayName ?? null,
      scopes: codeRow.scopes,
      token_prefix: credentials.tokenPrefix,
      token_hash: credentials.tokenHash,
      token_last_four: credentials.tokenLastFour,
      webhook_secret_ciphertext: encryptSecret(webhookSecret),
      webhook_url: webhookUrl,
      user_link_redirect_uri: userLinkRedirectUri,
      installation_code_id: codeRow.id,
      last_verified_at: new Date().toISOString(),
    })
    .select("id, scopes, connected_at")
    .single();

  if (insertError || !connection) {
    // Both partial unique indexes on partner_connections land here: one live
    // connection per PPI organization, one per DealerSpace organization.
    if (insertError?.code === "23505") {
      return partnerError("connection_already_exists");
    }
    console.error("partner: connection insert failed", insertError?.message);
    return partnerError("internal_error");
  }

  // Single-use: claimed only after the connection exists, and conditioned on
  // status so two racing exchanges cannot both succeed.
  const { data: claimed } = await admin
    .from("partner_installation_codes")
    .update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
      consumed_connection_id: connection.id,
    })
    .eq("id", codeRow.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Another exchange consumed the code between our read and our write. Undo
    // this connection rather than leave two live credentials for one code.
    await admin.from("partner_connections").delete().eq("id", connection.id);
    return partnerError("installation_code_already_used");
  }

  return NextResponse.json(
    {
      connectionId: connection.id,
      organization: { id: organization.id, name: organization.name },
      scopes: connection.scopes,
      connectedAt: connection.connected_at,
      // Shown once. Store both encrypted at rest in DealerSpace.
      token: credentials.token,
      webhookSecret,
      webhookUrl,
      userLinkRedirectUri,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
