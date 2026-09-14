import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDocumentSchema, ownerCanManageVehicle } from "@/features/vehicles/timelines";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
type Params = { params: Promise<{ id: string }> };

// POST — record a private build document after it was uploaded with the
// `vehicle_document` entity (presigned or direct). Never public.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = buildDocumentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  if (!await ownerCanManageVehicle(auth.profile.id, id)) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  // The reference must have been issued for this owner and this vehicle.
  if (!parsed.data.storage_reference.startsWith(`r2-private:///vehicle_document/${auth.profile.id}/${id}/`)) {
    return NextResponse.json({ error: "This document was not uploaded for this vehicle." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { count } = await admin.from("vehicle_build_documents").select("id", { count: "exact", head: true }).eq("vehicle_id", id);
  if ((count ?? 0) >= 200) return NextResponse.json({ error: "This vehicle already has the maximum number of documents." }, { status: 400 });
  const { data, error } = await admin
    .from("vehicle_build_documents")
    .insert({ ...parsed.data, vehicle_id: id, owner_id: auth.profile.id })
    .select("id, vehicle_id, entry_id, stage_id, kind, title, content_type, size_bytes, created_at")
    .single();
  if (error) {
    const message = error.code === "23503" ? "Attach the document to one of this vehicle's build entries or stages." : "The document could not be saved";
    return NextResponse.json({ error: message }, { status: error.code === "23503" ? 400 : 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
