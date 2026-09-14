import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePresignedGetUrl } from "@/lib/storage/r2";
import { deleteStoredObjectOrQueue } from "@/features/uploads/cleanup";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
type Params = { params: Promise<{ id: string; documentId: string }> };

async function ownedDocument(profileId: string, vehicleId: string, documentId: string) {
  const { data } = await createAdminClient()
    .from("vehicle_build_documents")
    .select("id, storage_reference, content_type")
    .eq("id", documentId)
    .eq("vehicle_id", vehicleId)
    .eq("owner_id", profileId)
    .maybeSingle();
  return data;
}

// GET — a short-lived signed URL for the owner; the file itself never has a
// public address.
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id, documentId } = await params;
  const document = await ownedDocument(auth.profile.id, id, documentId);
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const url = await generatePresignedGetUrl(document.storage_reference, 300);
  return NextResponse.json({ data: { url, content_type: document.content_type, expires_in: 300 } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const { id, documentId } = await params;
  const document = await ownedDocument(auth.profile.id, id, documentId);
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const { error } = await createAdminClient().from("vehicle_build_documents").delete().eq("id", documentId);
  if (error) return NextResponse.json({ error: "The document could not be deleted" }, { status: 500 });
  await deleteStoredObjectOrQueue(document.storage_reference, "vehicle_document_deleted");
  return NextResponse.json({ success: true });
}
