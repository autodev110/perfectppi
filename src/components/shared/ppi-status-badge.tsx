import { Badge } from "@/components/ui/badge";
import type { PpiRequestStatus } from "@/types/enums";
import { cn } from "@/lib/utils";
import { t as uiText } from "@/lib/i18n";

interface PpiStatusBadgeProps {
  status: PpiRequestStatus;
  className?: string;
}

const statusConfig: Record<
  PpiRequestStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: uiText("ui.draft_ebf12ef47c"), variant: "secondary" },
  pending_assignment: { label: uiText("ui.pending_assignment_db781b738b"), variant: "outline" },
  assigned: { label: uiText("ui.assigned_8191888dd9"), variant: "outline" },
  accepted: { label: uiText("ui.accepted_a00fb0c507"), variant: "outline" },
  in_progress: { label: uiText("ui.in_progress_b4cc4b07c3"), variant: "default" },
  submitted: { label: uiText("ui.submitted_64900440a8"), variant: "default" },
  needs_revision: { label: uiText("ui.needs_revision_35d98e8994"), variant: "destructive" },
  completed: { label: uiText("ui.completed_22a970d2e5"), variant: "default" },
  archived: { label: uiText("ui.archived_bdb86505f8"), variant: "secondary" },
};

export function PpiStatusBadge({ status, className }: PpiStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={cn(className)}>
      {config.label}
    </Badge>
  );
}
