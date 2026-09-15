import { reportCommunityContentForm } from "@/features/moderation/actions";
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_DETAILS_MIN_LENGTH,
  REPORT_REASON_CODES,
  REPORT_REASONS_REQUIRING_DETAILS,
  reportReasonLabels,
} from "@/features/moderation/report-reasons";
import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Flag } from "lucide-react";

export async function CommunityReportControl({
  entityType,
  entityId,
  reportContext,
  compact = false,
}: {
  entityType: "community_post" | "community_comment";
  entityId: string;
  reportContext: string;
  compact?: boolean;
}) {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const labels = reportReasonLabels(locale);
  const entity = t("entity.community_content");
  return (
    <details className="relative">
      <summary className="inline-flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full text-destructive hover:bg-destructive/10" aria-label={t("report.control.aria", { entity })}>
        <Flag className={compact ? "h-3 w-3" : "h-4 w-4"} />
      </summary>
      <form action={reportCommunityContentForm} className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border bg-background p-4 shadow-xl">
        <input type="hidden" name="entity_type" value={entityType} />
        <input type="hidden" name="entity_id" value={entityId} />
        <input type="hidden" name="report_context" value={reportContext} />
        <p className="text-sm font-bold">{t("report.control.title", { entity })}</p>
        <select name="reason_code" required defaultValue="" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          <option value="" disabled>{t("report.control.choose_reason")}</option>
          {REPORT_REASON_CODES.map((code) => <option key={code} value={code}>{labels[code]}</option>)}
        </select>
        <Textarea name="details" rows={2} maxLength={REPORT_DETAILS_MAX_LENGTH} placeholder={t("report.control.details_placeholder", { min: REPORT_DETAILS_MIN_LENGTH })} />
        <p className="text-xs text-muted-foreground">{t("report.control.details_required_for", { reasons: [...REPORT_REASONS_REQUIRING_DETAILS].map((code) => labels[code]).join(t("list.many_separator")) })}</p>
        <Button size="sm" type="submit">{t("report.control.submit")}</Button>
      </form>
    </details>
  );
}
