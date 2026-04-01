"use client";

// TODO Phase B: Full-screen step card for the guided inspection workflow
// Mobile-first, swipe-friendly, one question per screen

import type { ReactNode } from "react";

interface InspectionStepCardProps {
  title: string;
  children: ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  currentStep: number;
  totalSteps: number;
}

export function InspectionStepCard({
  title,
  children,
  onNext,
  onBack,
  currentStep,
  totalSteps,
}: InspectionStepCardProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {currentStep} / {totalSteps}
        </span>
        <h2 className="font-semibold">{title}</h2>
        <div className="w-12" />
      </div>
      <div className="flex-1 overflow-auto p-4">{children}</div>
      <div className="flex gap-3 border-t p-4">
        {onBack && (
          <button
            onClick={onBack}
            className="flex-1 rounded-xl border py-3 text-sm font-medium"
          >
            Back
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
