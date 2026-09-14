import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnedVehicleTimelines } from "@/features/vehicles/timelines";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;

// GET — everything the owner's build progression screen needs in one call:
// stages, entries with photos, private documents, per-stage cost totals.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const timelines = await getOwnedVehicleTimelines(auth.profile.id, id);
    if (!timelines) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    const { data: totals } = await createAdminClient().rpc("vehicle_build_stage_totals", {
      p_owner_profile_id: auth.profile.id,
      p_vehicle_id: id,
    });
    return NextResponse.json(
      { data: { stages: timelines.stages, entries: timelines.build, documents: timelines.documents, totals: totals ?? [] } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "The build progression is temporarily unavailable" }, { status: 500 });
  }
}
