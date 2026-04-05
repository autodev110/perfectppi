import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { saveAnswers } from "@/features/ppi/actions";

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
  const { data: answers } = await supabase
    .from("ppi_answers")
    .select("*")
    .in("ppi_section_id", sectionIds)
    .order("sort_order");

  return NextResponse.json({ data: answers ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await request.json();

  if (!Array.isArray(body.answers)) {
    return NextResponse.json({ error: "answers array required" }, { status: 400 });
  }

  const result = await saveAnswers(id, body.answers);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
