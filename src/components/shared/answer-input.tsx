"use client";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AnswerType } from "@/types/enums";

interface AnswerInputProps {
  answerType: AnswerType;
  options?: string[] | null;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  hasError?: boolean;
}

export function AnswerInput({
  answerType,
  options,
  value,
  onChange,
  required,
  disabled,
  hasError,
}: AnswerInputProps) {
  if (answerType === "yes_no") {
    return (
      <div className="flex gap-4">
        {["Yes", "No"].map((opt) => {
          const val = opt === "Yes" ? "yes" : "no";
          const selected = value === val;
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selected ? "" : val)}
              className={cn(
                "flex-1 py-5 rounded-2xl border-2 text-lg font-bold transition-all",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/50",
                hasError && !selected && "border-destructive/50",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  if (answerType === "select" && options && options.length > 0) {
    return (
      <div className="space-y-3">
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selected ? "" : opt)}
              className={cn(
                "w-full px-5 py-4 rounded-xl border-2 text-left font-medium transition-all",
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:border-primary/40",
                hasError && !selected && "border-destructive/30",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  className={cn(
                    "h-4 w-4 rounded-full border-2 flex-shrink-0 transition-all",
                    selected
                      ? "border-primary bg-primary"
                      : "border-border"
                  )}
                />
                {opt}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (answerType === "number") {
    return (
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        className={cn(
          "text-lg h-14 rounded-xl text-center font-mono",
          hasError && "border-destructive"
        )}
        placeholder="0"
      />
    );
  }

  // Default: text
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required={required}
      rows={4}
      className={cn(
        "text-base rounded-xl resize-none",
        hasError && "border-destructive"
      )}
      placeholder="Enter your answer..."
    />
  );
}
