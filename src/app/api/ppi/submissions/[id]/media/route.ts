import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { attachMedia } from "@/features/ppi/actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const { supabase } = auth;

  const { data: sections } = await supabase
    .from("ppi_sections")
    .select("id")
    .eq("ppi_submission_id", id);

  if (!sections || sections.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const sectionIds = sections.map((s) => s.id);
  const { data: media } = await supabase
    .from("ppi_media")
    .select("*")
    .in("ppi_section_id", sectionIds)
    .order("uploaded_at");

  return NextResponse.json({ data: media ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician"]);
  if ("response" in auth) return auth.response;

  await params;
  const body = await request.json();

  const result = await attachMedia(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
