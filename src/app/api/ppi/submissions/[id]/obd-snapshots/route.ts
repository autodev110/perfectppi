import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { listObdSnapshots, saveObdSnapshot } from "@/features/obd/actions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole([
    "consumer",
    "technician",
    "admin",
    "org_manager",
  ]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const currentOnly = searchParams.get("current") !== "0";
  const data = await listObdSnapshots(id, { currentOnly });

  return NextResponse.json({ data });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const result = await saveObdSnapshot(id, body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
