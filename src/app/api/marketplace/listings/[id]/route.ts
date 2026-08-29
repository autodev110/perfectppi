import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getMarketplaceListing } from "@/features/marketplace/queries";
import {
  updateMarketplaceListingFromInput,
  updateMarketplaceListingStatus,
} from "@/features/marketplace/actions";

const statusSchema = z.object({
  status: z.enum(["active", "sold", "archived"]),
});

const detailsSchema = z.object({
  title: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(1200).optional().or(z.literal("")),
  asking_price: z.coerce.number().positive().max(10_000_000),
  location: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = await getMarketplaceListing(id);

  if (!data) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
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
      : { error: "Invalid listing update" };
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result });
}
