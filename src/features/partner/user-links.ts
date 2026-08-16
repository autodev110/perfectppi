import { createAdminClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/config/site";
import {
  generateOpaqueHandle,
  sha256Hex,
} from "./crypto";
import {
  USER_LINK_CODE_TTL_MS,
  USER_LINK_TRANSACTION_TTL_MS,
} from "./constants";
import type { PartnerConnection } from "./auth";

// ============================================================================
// Individual technician account linking.
//
// The two accounts stay separate: no shared password, no shared session, no
// implicit trust from a matching email address. A link exists only because a
// signed-in Perfect PPI technician explicitly consented in their own browser.
//
// Everything here runs server-side with the service-role client because the
// transaction table is internal (no RLS policies) — authorization is enforced
// explicitly in each function below, never delegated to the caller.
// ============================================================================

export type LinkEligibilityFailure =
  | "profile_missing"
  | "not_technician"
  | "not_org_member";

export interface LinkEligibility {
  eligible: boolean;
  reason?: LinkEligibilityFailure;
  profile?: {
    id: string;
    displayName: string | null;
    username: string | null;
    role: string;
  };
}

/**
 * The three conditions from the integration contract, checked together:
 * a valid profile, technician access, and *active membership of the very
 * organization this connection is bound to*. The third is what stops a
 * technician at another dealership from linking themselves in.
 */
export async function checkLinkEligibility(
  profileId: string,
  organizationId: string,
): Promise<LinkEligibility> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name, username, role")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile) return { eligible: false, reason: "profile_missing" };

  const view = {
    id: profile.id,
    displayName: profile.display_name,
    username: profile.username,
    role: profile.role as string,
  };

  if (profile.role !== "technician") {
    return { eligible: false, reason: "not_technician", profile: view };
  }

  const { data: techProfile } = await admin
    .from("technician_profiles")
    .select("organization_id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!techProfile || techProfile.organization_id !== organizationId) {
    return { eligible: false, reason: "not_org_member", profile: view };
  }

  return { eligible: true, profile: view };
}

// ============================================================================
// Step 1 — DealerSpace initiates, using its connection credential
// ============================================================================

export interface InitiatedLinkTransaction {
  state: string;
  authorizationUrl: string;
  expiresAt: string;
}

export async function initiateUserLinkTransaction(
  connection: PartnerConnection,
  externalUserId: string,
): Promise<{ data: InitiatedLinkTransaction } | { error: "link_callback_not_configured" | "internal_error" }> {
  if (!connection.user_link_redirect_uri) {
    return { error: "link_callback_not_configured" };
  }

  const admin = createAdminClient();
  const state = generateOpaqueHandle(32);
  const expiresAt = new Date(Date.now() + USER_LINK_TRANSACTION_TTL_MS).toISOString();

  const { error } = await admin.from("partner_user_link_transactions").insert({
    partner_connection_id: connection.id,
    external_user_id: externalUserId,
    state,
    // Snapshotting the callback means a later edit to the connection cannot
    // retarget an authorization that is already in a technician's browser.
    redirect_uri: connection.user_link_redirect_uri,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("partner: link transaction insert failed", error.message);
    return { error: "internal_error" };
  }

  return {
    data: {
      state,
      authorizationUrl: `${siteConfig.url.replace(/\/$/, "")}/link/dealerspace/${state}`,
      expiresAt,
    },
  };
}

// ============================================================================
// Step 2 — the technician's browser
// ============================================================================

export interface ConsentContext {
  state: string;
  externalUserId: string;
  connectionId: string;
  organizationId: string;
  organizationName: string;
  partnerLabel: string;
  expiresAt: string;
}

export type ConsentLoadFailure =
  | "unknown_transaction"
  | "expired"
  | "already_used"
  | "connection_revoked";

export async function loadConsentContext(
  state: string,
): Promise<{ data: ConsentContext } | { error: ConsentLoadFailure }> {
  const admin = createAdminClient();

  const { data: transaction } = await admin
    .from("partner_user_link_transactions")
    .select(
      `id, state, external_user_id, status, expires_at, partner_connection_id,
       connection:partner_connections!partner_user_link_transactions_partner_connection_id_fkey(
         id, organization_id, display_name, status, source_system
       )`,
    )
    .eq("state", state)
    .maybeSingle();

  if (!transaction) return { error: "unknown_transaction" };
  if (transaction.status === "consumed") return { error: "already_used" };
  if (transaction.status !== "pending" && transaction.status !== "authorized") {
    return { error: "already_used" };
  }
  if (new Date(transaction.expires_at).getTime() < Date.now()) {
    return { error: "expired" };
  }

  const connection = transaction.connection as {
    id: string;
    organization_id: string;
    display_name: string | null;
    status: string;
  } | null;

  if (!connection || connection.status !== "active") {
    return { error: "connection_revoked" };
  }

  const { data: organization } = await admin
    .from("organizations")
    .select("name")
    .eq("id", connection.organization_id)
    .maybeSingle();

  return {
    data: {
      state: transaction.state,
      externalUserId: transaction.external_user_id,
      connectionId: connection.id,
      organizationId: connection.organization_id,
      organizationName: organization?.name ?? "your organization",
      partnerLabel: connection.display_name ?? "DealerSpace",
      expiresAt: transaction.expires_at,
    },
  };
}

export type AuthorizeFailure =
  | ConsentLoadFailure
  | LinkEligibilityFailure
  | "internal_error";

/**
 * Records the technician's consent and produces the one-time authorization
 * code. The code is returned only inside the redirect back to the callback
 * registered on the connection — Perfect PPI never redirects anywhere else.
 */
export async function authorizeUserLink(
  state: string,
  profileId: string,
): Promise<{ data: { redirectUrl: string } } | { error: AuthorizeFailure }> {
  const context = await loadConsentContext(state);
  if ("error" in context) return { error: context.error };

  const eligibility = await checkLinkEligibility(profileId, context.data.organizationId);
  if (!eligibility.eligible) {
    return { error: eligibility.reason ?? "internal_error" };
  }

  const admin = createAdminClient();
  const code = generateOpaqueHandle(32);
  const now = new Date();

  const { data: transaction, error } = await admin
    .from("partner_user_link_transactions")
    .update({
      status: "authorized",
      authorized_profile_id: profileId,
      authorization_code_hash: sha256Hex(code),
      code_expires_at: new Date(now.getTime() + USER_LINK_CODE_TTL_MS).toISOString(),
      authorized_at: now.toISOString(),
    })
    .eq("state", state)
    .eq("status", "pending")
    .select("redirect_uri")
    .maybeSingle();

  if (error) {
    console.error("partner: authorize update failed", error.message);
    return { error: "internal_error" };
  }
  if (!transaction) return { error: "already_used" };

  return { data: { redirectUrl: buildCallbackUrl(transaction.redirect_uri, { code, state }) } };
}

export async function denyUserLink(
  state: string,
): Promise<{ data: { redirectUrl: string } } | { error: ConsentLoadFailure }> {
  const admin = createAdminClient();

  const { data: transaction } = await admin
    .from("partner_user_link_transactions")
    .update({ status: "revoked" })
    .eq("state", state)
    .in("status", ["pending", "authorized"])
    .select("redirect_uri")
    .maybeSingle();

  if (!transaction) return { error: "unknown_transaction" };

  return {
    data: {
      redirectUrl: buildCallbackUrl(transaction.redirect_uri, {
        error: "access_denied",
        state,
      }),
    },
  };
}

/**
 * The destination always comes from the stored, pre-validated callback; only
 * the query string is composed here. There is no path by which a caller can
 * influence where this points.
 */
function buildCallbackUrl(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// ============================================================================
// Step 3 — DealerSpace exchanges the code, using its connection credential
// ============================================================================

export interface ExchangedUserLink {
  externalUserId: string;
  perfectppiProfileId: string;
  displayName: string | null;
  username: string | null;
  status: string;
  linkedAt: string;
}

export type ExchangeFailure =
  | "invalid_authorization_code"
  | "authorization_expired"
  | "invalid_user_link"
  | "internal_error";

export async function exchangeUserLinkCode(
  connection: PartnerConnection,
  code: string,
  state: string,
): Promise<{ data: ExchangedUserLink } | { error: ExchangeFailure }> {
  const admin = createAdminClient();

  const { data: transaction } = await admin
    .from("partner_user_link_transactions")
    .select("id")
    .eq("state", state)
    // Scoped to the calling connection: a code issued for one dealership can
    // never be redeemed with another dealership's token.
    .eq("partner_connection_id", connection.id)
    .maybeSingle();

  if (!transaction) {
    return { error: "invalid_authorization_code" };
  }

  const { data, error } = await admin.rpc("partner_exchange_user_link", {
    p_connection_id: connection.id,
    p_transaction_id: transaction.id,
    p_authorization_code_hash: sha256Hex(code),
  });

  if (error) {
    if (error.message.includes("authorization_expired")) {
      return { error: "authorization_expired" };
    }
    if (error.message.includes("invalid_user_link")) {
      return { error: "invalid_user_link" };
    }
    if (error.message.includes("invalid_authorization_code")) {
      return { error: "invalid_authorization_code" };
    }
    console.error("partner: atomic user link exchange failed", error.message);
    return { error: "internal_error" };
  }

  const link = data?.[0];
  if (!link) return { error: "internal_error" };

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, username")
    .eq("id", link.profile_id)
    .maybeSingle();

  return {
    data: {
      externalUserId: link.external_user_id,
      perfectppiProfileId: link.profile_id,
      displayName: profile?.display_name ?? null,
      username: profile?.username ?? null,
      status: link.status,
      linkedAt: link.linked_at,
    },
  };
}

// ============================================================================
// Resolution — used by inspection creation
// ============================================================================

export interface ResolvedTechnician {
  profileId: string;
  displayName: string | null;
  certificationLevel: string;
}

export type ResolveFailure = "user_link_required" | "invalid_user_link";

/**
 * Turns a DealerSpace staff id into a Perfect PPI profile. A Perfect PPI
 * profile id supplied directly by DealerSpace is never accepted — this lookup
 * is the only path, and it re-verifies technician status and organization
 * membership every time.
 */
export async function resolveLinkedTechnician(
  connection: PartnerConnection,
  externalUserId: string,
): Promise<{ data: ResolvedTechnician } | { error: ResolveFailure }> {
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("partner_user_links")
    .select("id, profile_id")
    .eq("partner_connection_id", connection.id)
    .eq("external_user_id", externalUserId)
    .eq("status", "active")
    .maybeSingle();

  if (!link) return { error: "user_link_required" };

  const { data: techProfile } = await admin
    .from("technician_profiles")
    .select("organization_id, certification_level, profile:profiles!technician_profiles_profile_id_fkey(id, display_name, role)")
    .eq("profile_id", link.profile_id)
    .maybeSingle();

  const profile = techProfile?.profile as {
    id: string;
    display_name: string | null;
    role: string;
  } | null;

  if (
    !techProfile ||
    !profile ||
    profile.role !== "technician" ||
    techProfile.organization_id !== connection.organization_id
  ) {
    return { error: "invalid_user_link" };
  }

  void admin
    .from("partner_user_links")
    .update({ last_verified_at: new Date().toISOString() })
    .eq("id", link.id)
    .then(({ error }) => {
      if (error) console.error("partner: link verify stamp failed", error.message);
    });

  return {
    data: {
      profileId: profile.id,
      displayName: profile.display_name,
      certificationLevel: techProfile.certification_level,
    },
  };
}
