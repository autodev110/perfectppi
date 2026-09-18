"use client";

import { cn } from "@/lib/utils";

import { useTranslator } from "@/lib/i18n/client";

interface ProgressTrackerProps {
  sections: Array<{ label: string; completed: boolean; active?: boolean }>;
  className?: string;
}

export function ProgressTracker({ sections, className }: ProgressTrackerProps) {
  const uiText = useTranslator();
  const completedCount = sections.filter((s) => s.completed).length;
  const percentage = Math.round((completedCount / sections.length) * 100);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {completedCount}/{sections.length}{uiText("ui.sections_9544c6fd7e")}</span>
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
