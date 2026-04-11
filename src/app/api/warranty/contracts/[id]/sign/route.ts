import { NextRequest, NextResponse } from "next/server";
import { getContractSigningUrl } from "@/features/warranty/actions";

// GET /api/warranty/contracts/[id]/sign — generate fresh DocuSeal embed_src on page open
// IMPORTANT: embed_src expires — always call on page load, never cache
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getContractSigningUrl(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
