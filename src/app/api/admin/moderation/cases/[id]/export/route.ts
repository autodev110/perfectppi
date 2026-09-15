import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getModerationCapabilities } from "@/features/moderation/capabilities";
import { getModerationCase } from "@/features/moderation/case-queries";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const caseIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!caseIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid moderation case" }, { status: 400 });
  }

  const capabilities = await getModerationCapabilities(auth.profile.id);
  if (!capabilities.has("queue_read") || !capabilities.has("evidence_export")) {
    return NextResponse.json(
      { error: "Queue and evidence export capabilities are required", code: "capability_required" },
      { status: 403 },
    );
  }

  const detail = await getModerationCase(id, capabilities);
  if (!detail) return NextResponse.json({ error: "Moderation case not found" }, { status: 404 });
  if (detail.case.legal_hold && !capabilities.has("legal_hold_review")) {
    return NextResponse.json(
      { error: "Legal-hold review capability is required", code: "capability_required" },
      { status: 403 },
    );
  }

  // Record access before releasing evidence. A broken audit trail fails closed.
  const { error: auditError } = await createAdminClient().from("moderation_events").insert({
    moderation_item_id: detail.case.moderation_item_id,
    case_id: detail.case.id,
    revision_id: detail.case.revision_id,
    actor_id: auth.profile.id,
    actor_type: "admin",
    event_type: "evidence_exported",
    previous_status: detail.item?.status ?? null,
    next_status: detail.item?.status ?? detail.case.state,
    metadata: {
      format: "application/json",
      reporterIdentitiesIncluded: capabilities.has("reporter_identity_read"),
    },
  });
  if (auditError) {
    console.error("[moderation/export] audit failed", { caseId: id, code: auditError.code });
    return NextResponse.json({ error: "Evidence export could not be audited" }, { status: 503 });
  }

  const exportedAt = new Date().toISOString();
  const payload = {
    format: "perfectppi-moderation-evidence-v1",
    exportedAt,
    case: detail.case,
    moderationItem: detail.item,
    evidence: detail.evidence,
    currentContent: detail.currentContent,
    media: detail.media,
    reports: detail.reports,
    reportsByReason: detail.reportsByReason,
    timeline: detail.events,
    internalNotes: detail.notes,
    appeals: detail.appeals,
    authorHistory: detail.authorHistory,
    priorRevisionCases: detail.priorRevisionCases,
  };

  return new NextResponse(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="perfectppi-moderation-${id}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
