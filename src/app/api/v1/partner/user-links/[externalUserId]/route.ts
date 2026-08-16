import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatePartnerRequest } from "@/features/partner/auth";
import { partnerError } from "@/features/partner/errors";
import { resolveLinkedTechnician } from "@/features/partner/user-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET    /api/v1/partner/user-links/:externalUserId   link status
// DELETE /api/v1/partner/user-links/:externalUserId   revoke the link
//
// Lets DealerSpace render "Connect your Perfect PPI account" versus "Linked as
// …" without keeping its own guess in sync, and lets it disconnect on offboard.
// ============================================================================

export async function GET(
  request: Request,
  { params }: { params: Promise<{ externalUserId: string }> },
) {
  const auth = await authenticatePartnerRequest(request, {
    scope: "inspections:read",
    limit: "read",
  });
  if ("response" in auth) return auth.response;

  const { externalUserId } = await params;
  const resolved = await resolveLinkedTechnician(auth.connection, externalUserId);

  if ("error" in resolved) {
    return NextResponse.json(
      { externalUserId, linked: false, reason: resolved.error },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      externalUserId,
      linked: true,
      perfectppiProfileId: resolved.data.profileId,
      displayName: resolved.data.displayName,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ externalUserId: string }> },
) {
  const auth = await authenticatePartnerRequest(request, {
    scope: "inspections:create",
    limit: "write",
  });
  if ("response" in auth) return auth.response;

  const { externalUserId } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("partner_user_links")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("partner_connection_id", auth.connection.id)
    .eq("external_user_id", externalUserId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("partner: user link revoke failed", error.message);
    return partnerError("internal_error");
  }

  // Idempotent by design: revoking an already-revoked link is a success.
  return NextResponse.json(
    { externalUserId, linked: false, revoked: Boolean(data) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
