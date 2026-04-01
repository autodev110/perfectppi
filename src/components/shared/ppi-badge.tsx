import { Badge } from "@/components/ui/badge";
import { PPI_TRUST_TIERS } from "@/types/enums";
import type { PpiType } from "@/types/enums";
import { cn } from "@/lib/utils";

interface PpiBadgeProps {
  type: PpiType;
  className?: string;
}

const colorMap: Record<PpiType, string> = {
  personal: "bg-amber-100 text-amber-800 border-amber-300",
  general_tech: "bg-slate-100 text-slate-800 border-slate-300",
  certified_tech: "bg-yellow-100 text-yellow-800 border-yellow-300",
};

export function PpiBadge({ type, className }: PpiBadgeProps) {
  const tier = PPI_TRUST_TIERS[type];

  return (
    <Badge
      variant="outline"
      className={cn(colorMap[type], className)}
    >
      {tier.badge} &middot; {tier.label}
    </Badge>
  );
}
