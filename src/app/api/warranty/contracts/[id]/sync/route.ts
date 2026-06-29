import { NextRequest, NextResponse } from "next/server";
import { syncContractSignatureStatus } from "@/features/warranty/actions";

// POST /api/warranty/contracts/[id]/sync — mobile/manual DocuSeal status refresh
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await syncContractSignatureStatus(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
