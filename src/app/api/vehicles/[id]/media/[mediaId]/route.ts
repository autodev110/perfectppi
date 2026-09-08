import { NextResponse } from "next/server";
import { removeVehiclePhoto } from "@/features/vehicles/actions";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
  const { id, mediaId } = await params;
  const result = await removeVehiclePhoto({ vehicleId: id, mediaId });
  if ("error" in result) {
    const status = result.error === "Not authenticated" ? 401 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ success: true });
}
