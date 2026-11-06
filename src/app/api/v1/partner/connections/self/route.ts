import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatePartnerRequest } from "@/features/partner/auth";
import { decryptSecret, signWebhookPayload } from "@/features/partner/crypto";
import { partnerError } from "@/features/partner/errors";
import { partnerSystem } from "@/features/partner/systems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/v1/partner/connections/self
//
// "Test connection" for a partner's settings screen. Confirms the token is live,
// reports the bound organization and scopes, and stamps last_verified_at.
// Returns no secrets.
//
// DELETE disconnects from the partner's side, so an administrator there does not
// also need a Perfect PPI login to undo a connection they made. Only a partner that
// connects from its own application has that screen. Others disconnect in Perfect PPI.
// ============================================================================

export async function GET(request: Request) {
  const auth = await authenticatePartnerRequest(request, {
    scope: "inspections:read",
    limit: "read",
  });
  if ("response" in auth) return auth.response;

  const admin = createAdminClient();

  const { data: organization } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("id", auth.connection.organization_id)
    .single();

  const verifiedAt = new Date().toISOString();
  const proofTimestamp = Math.floor(Date.now() / 1000).toString();
  const proofPayload = `connection:${auth.connection.id}:${verifiedAt}`;
  let webhookSecretProof: {
    timestamp: string;
    payload: string;
    signature: string;
  } | null = null;
  try {
    webhookSecretProof = {
      timestamp: proofTimestamp,
      payload: proofPayload,
      signature: signWebhookPayload({
        secret: decryptSecret(auth.connection.webhook_secret_ciphertext),
        timestamp: proofTimestamp,
        rawBody: proofPayload,
      }),
    };
  } catch (error) {
    console.error("partner: webhook secret proof failed", error);
  }
  await admin
    .from("partner_connections")
    .update({ last_verified_at: verifiedAt })
    .eq("id", auth.connection.id);

  return NextResponse.json(
    {
      connectionId: auth.connection.id,
      status: auth.connection.status,
      scopes: auth.connection.scopes,
      sourceSystem: auth.connection.source_system,
      externalOrganizationId: auth.connection.external_organization_id,
      organization: organization
        ? { id: organization.id, name: organization.name, slug: organization.slug }
        : null,
      webhookUrl: auth.connection.webhook_url,
      userLinkRedirectUri: auth.connection.user_link_redirect_uri,
      connectedAt: auth.connection.connected_at,
      verifiedAt,
      webhookSecretProof,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  const auth = await authenticatePartnerRequest(request, {
    scope: "inspections:create",
    limit: "write",
  });
  if ("response" in auth) return auth.response;

  if (!partnerSystem(auth.connection.source_system)?.browserConnect) {
    return partnerError("insufficient_scope", "Disconnect this connection in Perfect PPI.");
  }

  const { data: revoked, error } = await createAdminClient().rpc("revoke_partner_connection", {
    p_connection_id: auth.connection.id,
    p_organization_id: auth.connection.organization_id,
    // Nobody at Perfect PPI did this: the partner's administrator has no profile
    // here. Naming the manager who connected it would record something untrue.
    p_actor_id: null as unknown as string,
  });

  if (error) {
    console.error("partner: connection revoke failed", error.message);
    return partnerError("internal_error");
  }

  return NextResponse.json(
    { connectionId: auth.connection.id, revoked: Boolean(revoked) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
