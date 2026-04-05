"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Check, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface InspectionStepCardProps {
  sectionLabel: string;
  questionNumber: number;
  totalQuestions: number;
  prompt: string;
  isRequired: boolean;
  children: ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  canGoNext: boolean;
  isLastQuestion: boolean;
  isLastSection: boolean;
  saving: "idle" | "saving" | "saved" | "error";
}

export function InspectionStepCard({
  sectionLabel,
  questionNumber,
  totalQuestions,
  prompt,
  isRequired,
  children,
  onNext,
  onBack,
  onSkip,
  canGoNext,
  isLastQuestion,
  isLastSection,
  saving,
}: InspectionStepCardProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 backdrop-blur px-4 py-3 gap-4">
        <button
          onClick={onBack}
          disabled={!onBack}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex-1 text-center min-w-0">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider truncate">
            {sectionLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            Question {questionNumber} of {totalQuestions}
          </p>
        </div>

        {/* Save indicator */}
        <div className="w-16 text-right">
          {saving === "saving" && (
            <span className="text-xs text-muted-foreground">Saving…</span>
          )}
          {saving === "saved" && (
            <span className="text-xs text-emerald-600 flex items-center justify-end gap-1">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          {saving === "error" && (
            <span className="text-xs text-destructive">Retry</span>
          )}
        </div>
      </div>

      {/* Question content */}
      <div className="flex-1 flex flex-col px-6 py-8 max-w-2xl mx-auto w-full">
        {/* Prompt */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-foreground leading-snug mb-2">
            {prompt}
          </h2>
          {isRequired ? (
            <span className="inline-block text-xs text-destructive font-medium">Required</span>
          ) : (
            <span className="inline-block text-xs text-muted-foreground">Optional</span>
          )}
        </div>

        {/* Answer input area */}
        <div className="flex-1">{children}</div>
      </div>

      {/* Bottom action bar */}
      <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {!isRequired && onSkip && (
            <Button
              variant="ghost"
              onClick={onSkip}
              className="flex-none text-muted-foreground"
            >
              <SkipForward className="h-4 w-4 mr-1" />
              Skip
            </Button>
          )}
          <Button
            onClick={onNext}
            disabled={!canGoNext || !onNext}
            className={cn(
              "flex-1 h-12 text-base font-semibold rounded-xl transition-all",
              !canGoNext && "opacity-50"
            )}
          >
            {isLastQuestion && isLastSection ? (
              "Review & Submit"
            ) : isLastQuestion ? (
              <>
                Next Section <ChevronRight className="h-5 w-5 ml-1" />
              </>
            ) : (
              <>
                Continue <ChevronRight className="h-5 w-5 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
