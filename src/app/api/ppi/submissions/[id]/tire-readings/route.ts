import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { fillTireSlotFromPhotos } from "@/features/ppi/tire-readings-server";
import { TIRE_SLOTS, type TireSlot } from "@/features/ppi/tire-readings";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  slot: z.enum(TIRE_SLOTS as unknown as [TireSlot, ...TireSlot[]]),
});

/**
 * Reads every photo of one tire slot (the placard, or one tire's sidewall and
 * DOT code) and fills the blank fields of its answers. Only the performer of
 * an editable inspection may run it. Clients call it once per slot.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid inspection" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose which photos to read." }, { status: 400 });
  }

  const { data: submission } = await auth.supabase
    .from("ppi_submissions")
    .select("id, performer_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!submission) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (submission.performer_id !== auth.profile.id) {
    return NextResponse.json({ error: "Only the inspector can read photos for this inspection." }, { status: 403 });
  }
  if (!["draft", "in_progress"].includes(submission.status)) {
    return NextResponse.json({ error: "This inspection was already submitted." }, { status: 409 });
  }

  try {
    const result = await fillTireSlotFromPhotos({
      supabase: auth.supabase,
      submissionId: id,
      slot: parsed.data.slot,
      requestedBy: auth.profile.id,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[tire-readings] slot reading failed", error);
    const message = error instanceof Error && error.message.startsWith("Use no more than")
      ? error.message
      : "Could not read these photos. Enter the details by hand.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Use no more than") ? 422 : 502 });
  }
}
