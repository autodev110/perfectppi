import { NextResponse } from "next/server";
import { getTechProfile } from "@/features/technicians/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await getTechProfile(id);

  if (!data) {
    return NextResponse.json(
      { error: "Technician not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
