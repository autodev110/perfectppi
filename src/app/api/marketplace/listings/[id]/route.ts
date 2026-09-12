import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getMarketplaceListingDetail } from "@/features/marketplace/queries";
import {
  removeMarketplaceListing,
  updateMarketplaceListingFromInput,
  updateMarketplaceListingStatus,
} from "@/features/marketplace/actions";

const statusSchema = z.object({
  status: z.enum(["active", "pending", "paused", "sold", "archived"]),
});

const detailsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1200).optional().or(z.literal("")),
  asking_price: z.coerce.number().positive().max(10_000_000),
  location: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // The listing screen payload (plan 25.2): gallery, highlights, seller history.
  const data = await getMarketplaceListingDetail(id);

  if (!data) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

// DELETE /api/marketplace/listings/<id> — owner remove (soft while referenced).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const result = await removeMarketplaceListing(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ data: { id, mode: result.mode } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsedStatus = statusSchema.safeParse(body);
  const parsedDetails = detailsSchema.safeParse(body);
  const result = parsedStatus.success
    ? await updateMarketplaceListingStatus(id, parsedStatus.data.status)
    : parsedDetails.success
      ? await updateMarketplaceListingFromInput(id, parsedDetails.data)
      // Surface the field-level reason (e.g. a blanked title) rather than a
      // generic message — a body that isn't a status change is a details edit.
      : { error: parsedDetails.error.errors[0]?.message ?? "Invalid listing update" };
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result });
}
