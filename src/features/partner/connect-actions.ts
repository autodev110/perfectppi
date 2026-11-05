"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrganizationWorkspace } from "@/features/profiles/actions";
import { getManagerContext } from "./queries";
import {
  generateInstallationCode,
  isPartnerEncryptionConfigured,
  isPkceChallenge,
} from "./crypto";
import { CONNECT_CODE_TTL_MS, DEFAULT_PARTNER_SCOPES } from "./constants";
import { browserConnectCallback, partnerSystem, type PartnerSystem } from "./systems";

// ============================================================================
// The buttons on the connect consent screen.
//
// A manager approves here and the installation code goes straight back to the
// partner, so nobody copies anything. It is the same single-use code the manual
// path uses, with two differences because it crosses a URL: it lives for minutes,
// and it can only be redeemed with the verifier held by the partner's backend.
//
// The destination comes from server configuration, never from this request.
// ============================================================================

const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

interface ConnectParams {
  system: PartnerSystem;
  callback: string;
  state: string;
  challenge: string;
  shop: string;
}

function parseConnect(formData: FormData): ConnectParams | null {
  const system = partnerSystem(formData.get("partner"));
  const state = formData.get("state");
  const challenge = formData.get("code_challenge");
  const shop = formData.get("shop");
  if (!system?.browserConnect) return null;
  if (typeof state !== "string" || !STATE_PATTERN.test(state)) return null;
  if (!isPkceChallenge(challenge)) return null;
  const callback = browserConnectCallback(system);
  if (!callback) return null;
  return {
    system,
    callback,
    state,
    challenge,
    shop: typeof shop === "string" ? shop.slice(0, 120) : "",
  };
}

function consentPath(params: ConnectParams, error?: string): string {
  const query = new URLSearchParams({
    state: params.state,
    code_challenge: params.challenge,
  });
  if (params.shop) query.set("shop", params.shop);
  if (error) query.set("error", error);
  return `/connect/${params.system.id}?${query}`;
}

export async function approvePartnerConnect(formData: FormData) {
  const params = parseConnect(formData);
  if (!params) redirect("/");

  const context = await getManagerContext();
  if (!context) redirect(consentPath(params));

  if (!isPartnerEncryptionConfigured()) {
    redirect(consentPath(params, "not_configured"));
  }

  const admin = createAdminClient();

  // Only the newest approval for this partner can be redeemed.
  await admin
    .from("partner_installation_codes")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: context.profileId,
    })
    .eq("organization_id", context.organizationId)
    .eq("source_system", params.system.id)
    .eq("status", "pending");

  const { code, codeHash, codePrefix } = generateInstallationCode();
  const { error } = await admin.from("partner_installation_codes").insert({
    organization_id: context.organizationId,
    source_system: params.system.id,
    code_hash: codeHash,
    code_prefix: codePrefix,
    code_challenge: params.challenge,
    scopes: DEFAULT_PARTNER_SCOPES,
    created_by: context.profileId,
    expires_at: new Date(Date.now() + CONNECT_CODE_TTL_MS).toISOString(),
  });

  if (error) {
    console.error("partner: connect code insert failed", error.message);
    redirect(consentPath(params, "internal_error"));
  }

  const destination = new URL(params.callback);
  destination.searchParams.set("code", code);
  destination.searchParams.set("state", params.state);
  redirect(destination.href);
}

export async function declinePartnerConnect(formData: FormData) {
  const params = parseConnect(formData);
  if (!params) redirect("/");

  const destination = new URL(params.callback);
  destination.searchParams.set("error", "access_denied");
  destination.searchParams.set("state", params.state);
  redirect(destination.href);
}

/**
 * A shop that is new to Perfect PPI has no organization to connect yet. Creating
 * it here keeps them in the flow instead of sending them to find a settings page.
 */
export async function createOrganizationForConnect(formData: FormData) {
  const params = parseConnect(formData);
  if (!params) redirect("/");

  const result = await createOrganizationWorkspace(formData);
  if ("error" in result) {
    redirect(consentPath(params, "organization_failed"));
  }

  redirect(consentPath(params));
}
