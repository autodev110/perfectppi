import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { updateSectionState, saveSectionNotes, markSectionComplete } from "@/features/ppi/actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const { supabase } = auth;

  const { data } = await supabase
    .from("ppi_sections")
    .select("*")
    .eq("ppi_submission_id", id)
    .order("sort_order");

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician"]);
  if ("response" in auth) return auth.response;

  await params;
  const body = await request.json();

  if (!body.section_id) {
    return NextResponse.json({ error: "section_id is required" }, { status: 400 });
  }

  if (body.completion_state === "completed") {
    const result = await markSectionComplete(body.section_id);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  } else if (body.completion_state) {
    const result = await updateSectionState(body.section_id, body.completion_state);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (body.notes !== undefined) {
    const result = await saveSectionNotes(body.section_id, body.notes);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
