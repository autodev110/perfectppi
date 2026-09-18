import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { EXTENDED_REPORT_ENTITY_TYPES } from "@/features/moderation/extended-reporting";
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_DETAILS_MIN_LENGTH,
  REPORT_REASON_CODES,
  reportReasonRequiresDetails,
} from "@/features/moderation/report-reasons";
import { t } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordProductEvent } from "@/features/analytics/product-events";

export const runtime = "nodejs";

const inputSchema = z.object({
  entityType: z.enum(EXTENDED_REPORT_ENTITY_TYPES),
  entityId: z.string().uuid(),
  reasonCode: z.enum(REPORT_REASON_CODES),
  details: z.string().trim().max(REPORT_DETAILS_MAX_LENGTH).optional(),
  idempotencyKey: z.string().min(16).max(200),
}).superRefine((value, context) => {
  if (reportReasonRequiresDetails(value.reasonCode) && (value.details?.length ?? 0) < REPORT_DETAILS_MIN_LENGTH) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["details"], message: t("report.control.details_short", { min: REPORT_DETAILS_MIN_LENGTH }) });
  }
});

function reportError(message: string) {
  if (message.includes("rate limit")) return { status: 429, code: "rate_limited", error: "You have submitted several reports recently. Please wait and try again." };
  if (message.includes("not available") || message.includes("not found")) return { status: 404, code: "not_available", error: "This item is no longer available to report." };
  if (message.includes("reporting is unavailable")) return { status: 403, code: "reporting_unavailable", error: "Reporting is not available for this account." };
  return { status: 400, code: "invalid_report", error: "The report could not be submitted. Check the selected reason and try again." };
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid report", code: "invalid_report" }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("submit_extended_moderation_report", {
    p_reporter_id: auth.profile.id,
    p_entity_type: parsed.data.entityType,
    p_entity_id: parsed.data.entityId,
    p_reason_code: parsed.data.reasonCode,
    p_details: parsed.data.details || null,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    console.error("extended moderation report failed", { entityType: parsed.data.entityType, code: error.code });
    const mapped = reportError(error.message);
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
  }
  const duplicate = Boolean(data && typeof data === "object" && !Array.isArray(data) && data.duplicate);
  // Plan 34.2 "reports caused by unwanted contact": a report about a person or
  // a message, counted once per report and never with the reason or target.
  if (!duplicate && (parsed.data.entityType === "message" || parsed.data.entityType === "profile")) {
    const reportId = data && typeof data === "object" && !Array.isArray(data) && typeof data.reportId === "string"
      ? data.reportId
      : parsed.data.idempotencyKey;
    await recordProductEvent({
      profileId: auth.profile.id,
      eventName: "unwanted_contact_reported",
      surface: "profile",
      dedupeId: reportId,
    });
  }
  return NextResponse.json(data, { status: duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
}
