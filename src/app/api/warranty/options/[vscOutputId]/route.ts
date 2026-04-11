import { NextRequest, NextResponse } from "next/server";
import { generateWarrantyOffer } from "@/features/warranty/actions";
import { getWarrantyOptionByVscOutput } from "@/features/warranty/queries";

// GET /api/warranty/options/[vscOutputId]
// Returns existing warranty option for a VSC output, or creates one if absent
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ vscOutputId: string }> },
) {
  const { vscOutputId } = await params;

  const existing = await getWarrantyOptionByVscOutput(vscOutputId);
  if (existing) {
    return NextResponse.json(existing);
  }

  const result = await generateWarrantyOffer(vscOutputId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const option = await getWarrantyOptionByVscOutput(vscOutputId);
  return NextResponse.json(option);
}
