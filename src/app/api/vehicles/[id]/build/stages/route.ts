import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { recordProductEvent } from "@/features/analytics/product-events";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStageSchema, getOwnedVehicleTimelines, ownerCanManageVehicle } from "@/features/vehicles/timelines";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
type Params = { params: Promise<{ id: string }> };

// Build progression stages (Renditions doc). Owner-only, like entries.
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const timelines = await getOwnedVehicleTimelines(auth.profile.id, id);
  if (!timelines) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  return NextResponse.json({ data: timelines.stages });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = buildStageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  if (!await ownerCanManageVehicle(auth.profile.id, id)) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  const admin = createAdminClient();
  const { count } = await admin.from("vehicle_build_stages").select("id", { count: "exact", head: true }).eq("vehicle_id", id);
  if ((count ?? 0) >= 30) return NextResponse.json({ error: "A build can have up to 30 stages." }, { status: 400 });
  const completedOn = parsed.data.status === "complete" ? parsed.data.completed_on ?? new Date().toISOString().slice(0, 10) : null;
  const { data, error } = await admin
    .from("vehicle_build_stages")
    .insert({ ...parsed.data, completed_on: completedOn, position: parsed.data.position ?? count ?? 0, vehicle_id: id, owner_id: auth.profile.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "The stage could not be saved" }, { status: 500 });
  void recordProductEvent({ profileId: auth.profile.id, eventName: "build_stage_created", surface: "garage" });
  return NextResponse.json({ data }, { status: 201 });
}
