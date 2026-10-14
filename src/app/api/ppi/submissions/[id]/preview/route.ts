import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getSubmission } from "@/features/ppi/queries";
import { inspectionPreview } from "@/features/ppi/inspection-preview";
import type { FactsInputSection } from "@/features/ppi/inspection-facts";
import { APP_UPDATE_REQUIRED, clientSupportsCatalog } from "@/features/ppi/client-capability";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager"]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid inspection" }, { status: 400 });
  const submission = await getSubmission(id);
  if (!submission) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (submission.performer_id !== auth.profile.id) return NextResponse.json({ error: "Only the inspector can preview this draft." }, { status: 403 });
  if (!(await clientSupportsCatalog(submission.catalog_version ?? 1))) return NextResponse.json(APP_UPDATE_REQUIRED, { status: 426 });

  const { data: request, error } = await auth.supabase.from("ppi_requests")
    .select("vehicle:vehicles(year, make, model, trim, vin, mileage)")
    .eq("id", submission.ppi_request_id).single();
  if (error || !request) return NextResponse.json({ error: "Could not load the inspection vehicle." }, { status: 503 });
  const { data: snapshot, error: snapshotError } = await auth.supabase.from("obd_snapshots")
    .select("mil_on, stored_dtcs, pending_dtcs, permanent_dtcs, incomplete_monitor_count, vin")
    .eq("ppi_submission_id", id).order("captured_at", { ascending: false }).limit(1).maybeSingle();
  if (snapshotError) return NextResponse.json({ error: "Could not load the scanner results." }, { status: 503 });
  const preview = inspectionPreview({
    scope: submission.inspection_scope === "dents_tires" ? "dents_tires" : "complete",
    catalogVersion: submission.catalog_version ?? 1,
    performerMode: submission.performer_mode === "self" ? "self" : "technician",
    inspectorName: null,
    submission,
    vehicle: { ...(request.vehicle ?? { year: null, make: null, model: null, trim: null, vin: null, mileage: null }), mileage_unit: "mi", body_class: null },
    certification: null,
    sections: submission.sections as unknown as FactsInputSection[],
    diagnostics: submission.inspection_scope === "dents_tires" || !snapshot ? null : {
      present: true,
      mil_on: snapshot.mil_on,
      stored_dtcs: snapshot.stored_dtcs ?? [],
      pending_dtcs: snapshot.pending_dtcs ?? [],
      permanent_dtcs: snapshot.permanent_dtcs ?? [],
      incomplete_monitor_count: snapshot.incomplete_monitor_count ?? 0,
      vin: snapshot.vin,
    },
  });
  return NextResponse.json({ data: preview }, { headers: { "Cache-Control": "no-store" } });
}
