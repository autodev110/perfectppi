import { Badge } from "@/components/ui/badge";
import type { PpiRequestStatus } from "@/types/enums";
import { cn } from "@/lib/utils";

interface PpiStatusBadgeProps {
  status: PpiRequestStatus;
  className?: string;
}

const statusConfig: Record<
  PpiRequestStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_assignment: { label: "Pending Assignment", variant: "outline" },
  assigned: { label: "Assigned", variant: "outline" },
  accepted: { label: "Accepted", variant: "outline" },
  in_progress: { label: "In Progress", variant: "default" },
  submitted: { label: "Submitted", variant: "default" },
  needs_revision: { label: "Needs Revision", variant: "destructive" },
  completed: { label: "Completed", variant: "default" },
  archived: { label: "Archived", variant: "secondary" },
};

export function PpiStatusBadge({ status, className }: PpiStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={cn(className)}>
      {config.label}
    </Badge>
  );
}
