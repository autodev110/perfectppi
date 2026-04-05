import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getTechQueue } from "@/features/ppi/queries";
import type { PpiRequestStatus } from "@/types/enums";

export async function GET(request: Request) {
  const auth = await requireApiRole(["technician"]);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as PpiRequestStatus | null;

  const data = await getTechQueue(status ? { status } : undefined);
  return NextResponse.json({ data });
}
