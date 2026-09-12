import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getCurrentSocialProfileId } from "@/features/social/relationships";
import {
  attachListingInspection,
  getAttachableInspections,
  getInspectionReport,
  getListingInspectionReport,
  type AttachInspectionResult,
} from "@/features/marketplace/inspection-sharing";
import { getMarketplaceListing } from "@/features/marketplace/queries";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;
const STATUS: Record<Exclude<AttachInspectionResult, { ok: true }>["outcome"], number> = {
  unauthenticated: 401, not_found: 404, not_shareable: 400, removed: 409, failed: 500,
};

// GET /api/marketplace/listings/<id>/inspection[?preview=<request_id>]
// { report, options } — the redacted report as the viewer may see it; owners
// also get the inspections they could share, and may preview one (plan 25.3).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewerId = await getCurrentSocialProfileId();
  // Reuse the canonical listing visibility gate. An admin lookup here would
  // let unauthorised callers distinguish valid private/removed listing IDs.
  const listing = await getMarketplaceListing(id);
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const owner = viewerId !== null && listing.seller_id === viewerId;
  const preview = req.nextUrl.searchParams.get("preview");
  const report = owner && preview && z.string().uuid().safeParse(preview).success
    ? await getInspectionReport(preview, viewerId)
    : await getListingInspectionReport(id);
  const options = owner ? await getAttachableInspections(id) : [];
  return NextResponse.json(
    { data: { report, options, attached_inspection_id: owner ? listing.attached_inspection_id : undefined } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

const attachSchema = z.object({ request_id: z.string().uuid().nullable() });

// POST { request_id | null } — attach or detach.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = attachSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send request_id (uuid or null)" }, { status: 400 });
  const result = await attachListingInspection(id, parsed.data.request_id);
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.outcome }, { status: STATUS[result.outcome] });
  return NextResponse.json({ data: { attached_inspection_id: result.attached_inspection_id } });
}
