import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { saveAnswers } from "@/features/ppi/actions";
import { APP_UPDATE_REQUIRED, clientSupportsCatalog } from "@/features/ppi/client-capability";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "admin", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const { supabase } = auth;

  const { data: submission } = await supabase
    .from("ppi_submissions")
    .select("catalog_version")
    .eq("id", id)
    .maybeSingle();
  if (submission && !(await clientSupportsCatalog(submission.catalog_version))) {
    return NextResponse.json(APP_UPDATE_REQUIRED, { status: 426 });
  }

  const { data: sections } = await supabase
    .from("ppi_sections")
    .select("id")
    .eq("ppi_submission_id", id)
    .order("sort_order");

  if (!sections || sections.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const sectionIds = sections.map((s) => s.id);
  const { data: answers } = await supabase
    .from("ppi_answers")
    .select("*")
    .in("ppi_section_id", sectionIds)
    .order("sort_order");

  const sectionOrder = new Map(sectionIds.map((sectionId, index) => [sectionId, index]));
  const groupedAnswers = [...(answers ?? [])].sort((a, b) => {
    const sectionDifference =
      (sectionOrder.get(a.ppi_section_id) ?? Number.MAX_SAFE_INTEGER) -
      (sectionOrder.get(b.ppi_section_id) ?? Number.MAX_SAFE_INTEGER);
    return sectionDifference || a.sort_order - b.sort_order;
  });

  return NextResponse.json({ data: groupedAnswers });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await request.json();

  if (!Array.isArray(body.answers)) {
    return NextResponse.json({ error: "answers array required" }, { status: 400 });
  }

  const result = await saveAnswers(id, body.answers);
  if ("error" in result) {
    const invalid = (result as { invalid?: { answerId: string; error: string }[] }).invalid;
    return NextResponse.json({ error: result.error, invalid }, { status: invalid?.length ? 422 : 400 });
  }

  return NextResponse.json({ success: true });
}
