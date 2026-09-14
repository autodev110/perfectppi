import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStageUpdateSchema, ownerCanManageVehicle } from "@/features/vehicles/timelines";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
type Params = { params: Promise<{ id: string; stageId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id, stageId } = await params;
  const parsed = buildStageUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  if (!await ownerCanManageVehicle(auth.profile.id, id)) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  // A stage is complete exactly when it carries a completion date.
  const patch = { ...parsed.data } as typeof parsed.data & { completed_on?: string | null };
  if (patch.status === "complete" && !patch.completed_on) patch.completed_on = new Date().toISOString().slice(0, 10);
  if (patch.status && patch.status !== "complete") patch.completed_on = null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vehicle_build_stages")
    .update(patch)
    .eq("id", stageId)
    .eq("vehicle_id", id)
    .eq("owner_id", auth.profile.id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The stage could not be updated" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Stage not found" }, { status: 404 });
  return NextResponse.json({ data });
}

// Deleting a stage keeps its entries (they become unstaged).
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id, stageId } = await params;
  if (!await ownerCanManageVehicle(auth.profile.id, id)) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  const { data, error } = await createAdminClient()
    .from("vehicle_build_stages")
    .delete()
    .eq("id", stageId)
    .eq("vehicle_id", id)
    .eq("owner_id", auth.profile.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The stage could not be deleted" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Stage not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
