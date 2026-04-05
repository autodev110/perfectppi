import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getMyPpiRequests } from "@/features/ppi/queries";
import { createPpiRequest } from "@/features/ppi/actions";

export async function GET(request: Request) {
  const auth = await requireApiRole(["consumer"]);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as import("@/types/enums").PpiRequestStatus | null;

  const data = await getMyPpiRequests(status ? { status } : undefined);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["consumer"]);
  if ("response" in auth) return auth.response;

  const body = await request.json();
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value != null) formData.set(key, String(value));
  }

  const result = await createPpiRequest(formData);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
