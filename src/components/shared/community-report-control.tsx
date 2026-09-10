import { reportCommunityContentForm } from "@/features/moderation/actions";
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASON_CODES,
  REPORT_REASON_LABELS,
  REPORT_REASONS_REQUIRING_DETAILS,
} from "@/features/moderation/report-reasons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Flag } from "lucide-react";

export function CommunityReportControl({
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
  return (
    <details className="relative">
      <summary className="inline-flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full text-destructive hover:bg-destructive/10" aria-label="Report content">
        <Flag className={compact ? "h-3 w-3" : "h-4 w-4"} />
      </summary>
      <form action={reportCommunityContentForm} className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border bg-background p-4 shadow-xl">
        <input type="hidden" name="entity_type" value={entityType} />
        <input type="hidden" name="entity_id" value={entityId} />
        <input type="hidden" name="report_context" value={reportContext} />
        <p className="text-sm font-bold">Report content</p>
        <select name="reason_code" required defaultValue="" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
          <option value="" disabled>Choose a reason</option>
          {REPORT_REASON_CODES.map((code) => <option key={code} value={code}>{REPORT_REASON_LABELS[code]}</option>)}
        </select>
        <Textarea name="details" rows={2} maxLength={REPORT_DETAILS_MAX_LENGTH} placeholder="Details (required for Other and intellectual-property reports)" />
        <p className="text-xs text-muted-foreground">Required for: {[...REPORT_REASONS_REQUIRING_DETAILS].map((code) => REPORT_REASON_LABELS[code]).join(", ")}.</p>
        <Button size="sm" type="submit">Submit report</Button>
      </form>
    </details>
  );
}
