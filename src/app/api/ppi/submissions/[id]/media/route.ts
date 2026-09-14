import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { attachMedia } from "@/features/ppi/actions";
import { deleteStoredObjectOrQueue } from "@/features/uploads/cleanup";
import { isOwnedPrivateUploadReference } from "@/features/uploads/url";

const submissionIdSchema = z.string().uuid();
const discardUploadSchema = z.object({ storageReference: z.string() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "admin", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!submissionIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid inspection" }, { status: 400 });
  }
  const { supabase } = auth;

  const { data: sections, error: sectionsError } = await supabase
    .from("ppi_sections")
    .select("id")
    .eq("ppi_submission_id", id);
  if (sectionsError) {
    return NextResponse.json({ error: "Could not load inspection photos" }, { status: 500 });
  }

  if (!sections || sections.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const sectionIds = sections.map((s) => s.id);
  const { data: media, error: mediaError } = await supabase
    .from("ppi_media")
    .select("*")
    .in("ppi_section_id", sectionIds)
    .order("uploaded_at");
  if (mediaError) {
    return NextResponse.json({ error: "Could not load inspection photos" }, { status: 500 });
  }

  return NextResponse.json({ data: media ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!submissionIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid inspection" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await attachMedia(id, body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}

// Discard bytes that reached private storage but were never attached to a
// media row. This keeps failed/retried client uploads from becoming orphans.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!submissionIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid inspection" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = discardUploadSchema.safeParse(body);
  if (!parsed.success || !isOwnedPrivateUploadReference(
    parsed.data.storageReference,
    "ppi_media",
    auth.profile.id,
    id,
  )) {
    return NextResponse.json({ error: "Inspection upload is invalid" }, { status: 400 });
  }

  const { data: attached, error } = await auth.supabase
    .from("ppi_media")
    .select("id")
    .eq("url", parsed.data.storageReference)
    .limit(1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Could not verify inspection photo" }, { status: 500 });
  }
  if (attached) {
    return NextResponse.json({ error: "This photo is already attached to the inspection" }, { status: 409 });
  }

  await deleteStoredObjectOrQueue(parsed.data.storageReference, "unattached_inspection_media_discarded");
  return NextResponse.json({ data: { discarded: true } });
}
