import { NextResponse } from "next/server";
import { issueVehicleHandoffClaim } from "@/features/vehicles/handoff";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await issueVehicleHandoffClaim(id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
