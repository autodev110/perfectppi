import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getMarketplaceListing } from "@/features/marketplace/queries";
import { updateMarketplaceListingStatus } from "@/features/marketplace/actions";

const statusSchema = z.object({
  status: z.enum(["active", "sold", "archived"]),
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
  const parsed = statusSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing status" }, { status: 400 });
  }

  const result = await updateMarketplaceListingStatus(id, parsed.data.status);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result });
}
