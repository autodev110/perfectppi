import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getMyPpiRequests } from "@/features/ppi/queries";
import { createPpiRequest } from "@/features/ppi/actions";
import { z } from "zod";

const requestFiltersSchema = z.object({
  status: z.enum([
    "draft",
    "pending_assignment",
    "assigned",
    "accepted",
    "in_progress",
    "submitted",
    "needs_revision",
    "completed",
    "archived",
  ]).optional(),
  vehicleId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiRole(["consumer"]);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = requestFiltersSchema.safeParse({
    status: searchParams.get("status") || undefined,
    vehicleId: searchParams.get("vehicle_id") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid inspection filter" }, { status: 400 });
  }

  const data = await getMyPpiRequests(parsed.data);
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
