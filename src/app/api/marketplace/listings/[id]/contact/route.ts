import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { contactSellerForListing } from "@/features/marketplace/actions";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await contactSellerForListing({ listingId: id });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
