"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerContext } from "./queries";
import {
  encryptSecret,
  generateConnectionToken,
  generateInstallationCode,
  generateWebhookSecret,
  isPartnerEncryptionConfigured,
} from "./crypto";
import { DEFAULT_PARTNER_SCOPES, INSTALLATION_CODE_TTL_MS } from "./constants";

// ============================================================================
// Organization-manager actions for the partner connection panel.
//
// Every action re-derives the caller's organization from their own membership
// and then constrains the write to that organization — an id supplied by the
// form is only ever used as an additional filter, never as the authority.
// ============================================================================

const uuidSchema = z.string().uuid();

export interface GeneratedCodeResult {
  /** Shown to the manager exactly once. Never persisted in plaintext. */
  code: string;
  codePrefix: string;
  expiresAt: string;
}

export async function createInstallationCode(): Promise<
  { data: GeneratedCodeResult } | { error: string }
> {
  const context = await getManagerContext();
  if (!context) return { error: "Not authorized" };

  if (!isPartnerEncryptionConfigured()) {
    return {
      error:
        "PARTNER_SECRET_ENCRYPTION_KEY is not configured on the server. " +
        "Connections cannot be created until it is set.",
    };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("partner_connections")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    return {
      error:
        "This organization already has an active DealerSpace connection. " +
        "Revoke it before issuing a new installation code.",
    };
  }

  // Supersede any code still outstanding, so only the newest one can be used.
  await admin
    .from("partner_installation_codes")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: context.profileId })
    .eq("organization_id", context.organizationId)
    .eq("status", "pending");

  const { code, codeHash, codePrefix } = generateInstallationCode();
  const expiresAt = new Date(Date.now() + INSTALLATION_CODE_TTL_MS).toISOString();

  const { error } = await admin.from("partner_installation_codes").insert({
    organization_id: context.organizationId,
    code_hash: codeHash,
    code_prefix: codePrefix,
    scopes: DEFAULT_PARTNER_SCOPES,
    created_by: context.profileId,
    expires_at: expiresAt,
  });

  if (error) return { error: error.message };

  revalidatePath("/org/settings");
  return { data: { code, codePrefix, expiresAt } };
}

export async function revokeInstallationCode(
  codeId: string,
): Promise<{ success: true } | { error: string }> {
  if (!uuidSchema.safeParse(codeId).success) return { error: "Invalid code" };

  const context = await getManagerContext();
  if (!context) return { error: "Not authorized" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("partner_installation_codes")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: context.profileId,
    })
    .eq("id", codeId)
    .eq("organization_id", context.organizationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Code not found or no longer pending" };

  revalidatePath("/org/settings");
  return { success: true };
}

export async function revokeConnection(
  connectionId: string,
): Promise<{ success: true } | { error: string }> {
  if (!uuidSchema.safeParse(connectionId).success) {
    return { error: "Invalid connection" };
  }

  const context = await getManagerContext();
  if (!context) return { error: "Not authorized" };

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("partner_connections")
    .update({ status: "revoked", revoked_at: now, revoked_by: context.profileId })
    .eq("id", connectionId)
    .eq("organization_id", context.organizationId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Connection not found or already revoked" };

  // Revoking the organization link also ends every individual account link it
  // authorized: the technicians consented to a connection that no longer exists.
  await admin
    .from("partner_user_links")
    .update({ status: "revoked", revoked_at: now, revoked_by: context.profileId })
    .eq("partner_connection_id", connectionId)
    .eq("status", "active");

  // Pending outbound work would authenticate against a dead credential.
  await admin
    .from("outbound_events")
    .update({
      status: "failed",
      last_error: { category: "configuration", message: "connection revoked" },
    })
    .eq("partner_connection_id", connectionId)
    .in("status", ["pending", "delivering"]);

  revalidatePath("/org/settings");
  revalidatePath("/org/inspections");
  return { success: true };
}

export interface RotatedCredentials {
  token: string;
  webhookSecret: string;
}

/**
 * Mints a fresh token and signing secret for an existing connection. The old
 * credentials stop working the instant this returns — there is no overlap
 * window, so this is a deliberate, disruptive action the manager coordinates
 * with the DealerSpace administrator.
 */
export async function rotateConnectionCredentials(
  connectionId: string,
): Promise<{ data: RotatedCredentials } | { error: string }> {
  if (!uuidSchema.safeParse(connectionId).success) {
    return { error: "Invalid connection" };
  }

  const context = await getManagerContext();
  if (!context) return { error: "Not authorized" };
  if (!isPartnerEncryptionConfigured()) {
    return { error: "PARTNER_SECRET_ENCRYPTION_KEY is not configured on the server." };
  }

  const admin = createAdminClient();
  const credentials = generateConnectionToken();
  const webhookSecret = generateWebhookSecret();

  const { data, error } = await admin
    .from("partner_connections")
    .update({
      token_prefix: credentials.tokenPrefix,
      token_hash: credentials.tokenHash,
      token_last_four: credentials.tokenLastFour,
      webhook_secret_ciphertext: encryptSecret(webhookSecret),
      credentials_rotated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("organization_id", context.organizationId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Connection not found or not active" };

  revalidatePath("/org/settings");
  return { data: { token: credentials.token, webhookSecret } };
}

export async function revokeUserLink(
  linkId: string,
): Promise<{ success: true } | { error: string }> {
  if (!uuidSchema.safeParse(linkId).success) return { error: "Invalid link" };

  const context = await getManagerContext();
  if (!context) return { error: "Not authorized" };

  const admin = createAdminClient();

  // The link is reachable only through a connection this organization owns.
  const { data: connections } = await admin
    .from("partner_connections")
    .select("id")
    .eq("organization_id", context.organizationId);

  const connectionIds = (connections ?? []).map((c) => c.id);
  if (connectionIds.length === 0) return { error: "Link not found" };

  const { data, error } = await admin
    .from("partner_user_links")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: context.profileId,
    })
    .eq("id", linkId)
    .in("partner_connection_id", connectionIds)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Link not found or already revoked" };

  revalidatePath("/org/settings");
  return { success: true };
}
