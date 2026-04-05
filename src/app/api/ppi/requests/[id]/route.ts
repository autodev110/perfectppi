import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getPpiRequest } from "@/features/ppi/queries";
import { updateRequestStatus } from "@/features/ppi/actions";
import type { PpiRequestStatus } from "@/types/enums";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const data = await getPpiRequest(id);

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await request.json();

  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const result = await updateRequestStatus(id, body.status as PpiRequestStatus);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
