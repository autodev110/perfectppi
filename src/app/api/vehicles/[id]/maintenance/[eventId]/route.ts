import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { maintenanceEventUpdateSchema, ownerCanManageVehicle } from "@/features/vehicles/timelines";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
type Params = { params: Promise<{ id: string; eventId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id, eventId } = await params;
  const parsed = maintenanceEventUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  if (!await ownerCanManageVehicle(auth.profile.id, id)) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vehicle_maintenance_events")
    .update(parsed.data)
    .eq("id", eventId)
    .eq("vehicle_id", id)
    .eq("owner_id", auth.profile.id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The maintenance event could not be updated" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Maintenance event not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id, eventId } = await params;
  if (!await ownerCanManageVehicle(auth.profile.id, id)) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vehicle_maintenance_events")
    .delete()
    .eq("id", eventId)
    .eq("vehicle_id", id)
    .eq("owner_id", auth.profile.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The maintenance event could not be deleted" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Maintenance event not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
