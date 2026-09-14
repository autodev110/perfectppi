import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEntryPhotosSchema, ownerCanManageVehicle } from "@/features/vehicles/timelines";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
type Params = { params: Promise<{ id: string; entryId: string }> };

// PUT { media_ids } — replace the entry's photo set with this vehicle's
// approved media, in the given order. The database refuses other vehicles'
// media and anything not approved.
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id, entryId } = await params;
  const parsed = buildEntryPhotosSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  if (!await ownerCanManageVehicle(auth.profile.id, id)) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  const admin = createAdminClient();
  const { data: entry } = await admin
    .from("vehicle_build_entries")
    .select("id")
    .eq("id", entryId)
    .eq("vehicle_id", id)
    .eq("owner_id", auth.profile.id)
    .maybeSingle();
  if (!entry) return NextResponse.json({ error: "Build entry not found" }, { status: 404 });

  const ids = [...new Set(parsed.data.media_ids)];
  const { error: clearError } = await admin.from("vehicle_build_entry_photos").delete().eq("entry_id", entryId);
  if (clearError) return NextResponse.json({ error: "The photos could not be updated" }, { status: 500 });
  if (ids.length > 0) {
    const { error } = await admin
      .from("vehicle_build_entry_photos")
      .insert(ids.map((mediaId, position) => ({ entry_id: entryId, media_id: mediaId, position })));
    if (error) {
      const message = error.message.includes("build_photo_not_approved")
        ? "Only approved vehicle photos can be attached to a build entry."
        : "Only this vehicle's photos can be attached to a build entry.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  return NextResponse.json({ data: { entry_id: entryId, media_ids: ids } });
}
