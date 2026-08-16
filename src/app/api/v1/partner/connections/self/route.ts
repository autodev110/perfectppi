import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatePartnerRequest } from "@/features/partner/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/v1/partner/connections/self
//
// "Test connection" for the DealerSpace settings screen. Confirms the token is
// live, reports the bound organization and scopes, and stamps last_verified_at.
// Returns no secrets.
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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
