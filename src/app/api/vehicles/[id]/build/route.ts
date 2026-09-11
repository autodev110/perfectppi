import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEntrySchema, getOwnedVehicleTimelines, ownerCanManageVehicle } from "@/features/vehicles/timelines";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const timelines = await getOwnedVehicleTimelines(auth.profile.id, id);
    if (!timelines) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    return NextResponse.json({ data: timelines.build });
  } catch {
    return NextResponse.json({ error: "The build journal is temporarily unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = buildEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  if (!await ownerCanManageVehicle(auth.profile.id, id)) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vehicle_build_entries")
    .insert({ ...parsed.data, vehicle_id: id, owner_id: auth.profile.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "The build entry could not be saved" }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
