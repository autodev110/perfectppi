import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { extractFromPhoto } from "@/features/ppi/inspection-extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  media_id: z.string().uuid(),
  target: z.enum(["tire_sidewall", "tire_dot", "tire_placard"]),
});

/**
 * Suggested readings from one inspection photo. Only the performer of an
 * editable inspection may request them, for a photo attached to it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a photo to read." }, { status: 400 });
  }

  const { data: media } = await auth.supabase
    .from("ppi_media")
    .select("id, url, media_type, section:ppi_sections!inner(ppi_submission_id, submission:ppi_submissions!inner(performer_id, status))")
    .eq("id", parsed.data.media_id)
    .maybeSingle();

  const section = media?.section as
    | { ppi_submission_id: string; submission: { performer_id: string; status: string } | null }
    | null
    | undefined;
  if (!media || section?.ppi_submission_id !== id) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }
  if (section.submission?.performer_id !== auth.profile.id) {
    return NextResponse.json({ error: "Only the inspector can read photos for this inspection." }, { status: 403 });
  }
  if (!["draft", "in_progress"].includes(section.submission?.status ?? "")) {
    return NextResponse.json({ error: "This inspection was already submitted." }, { status: 409 });
  }
  if (media.media_type !== "image") {
    return NextResponse.json({ error: "Only photos can be read." }, { status: 400 });
  }

  try {
    const result = await extractFromPhoto({
      mediaId: media.id,
      target: parsed.data.target,
      requestedBy: auth.profile.id,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[extractions] photo reading failed", error);
    return NextResponse.json({ error: "Could not read the photo. Enter the values by hand." }, { status: 502 });
  }
}
