"use client";

import { cn } from "@/lib/utils";

interface ProgressTrackerProps {
  sections: Array<{ label: string; completed: boolean; active?: boolean }>;
  className?: string;
}

export function ProgressTracker({ sections, className }: ProgressTrackerProps) {
  const completedCount = sections.filter((s) => s.completed).length;
  const percentage = Math.round((completedCount / sections.length) * 100);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {completedCount}/{sections.length} sections
        </span>
        <span className="font-medium">{percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
