"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { usernameSchema } from "@/features/profiles/username";

export function UsernameInput({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");

  useEffect(() => {
    const parsed = usernameSchema.safeParse(value);
    if (!parsed.success) {
      setAvailability("idle");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAvailability("checking");
      try {
        const response = await fetch(
          `/api/profiles/username?username=${encodeURIComponent(parsed.data)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const result = await response.json();
        setAvailability(response.ok && result.available ? "available" : "taken");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setAvailability("idle");
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const validation = value.length > 0 ? usernameSchema.safeParse(value) : null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-outline-variant">@</span>
        <input
          id="username"
          name="username"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\s/g, ""))}
          autoFocus={autoFocus}
          required
          minLength={4}
          maxLength={16}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby="username-help username-status"
          className="h-14 w-full rounded-xl border-none bg-surface-container-low px-10 font-medium text-on-surface transition-all placeholder:text-outline-variant focus:ring-2 focus:ring-on-tertiary-container/30"
          placeholder="driver_name"
        />
        {availability === "checking" && <LoaderCircle className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-outline-variant" />}
        {availability === "available" && <CheckCircle2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-teal" />}
      </div>
      <p id="username-help" className="text-xs leading-5 text-on-secondary-container">
        4–16 characters. Letters, numbers, and underscores only. Usernames cannot be changed yet.
      </p>
      <p id="username-status" aria-live="polite" className="min-h-5 text-xs font-medium">
        {validation && !validation.success && <span className="text-destructive">{validation.error.errors[0].message}</span>}
        {validation?.success && availability === "available" && <span className="text-teal">Username is available.</span>}
        {validation?.success && availability === "taken" && <span className="text-destructive">Username is unavailable.</span>}
      </p>
    </div>
  );
}

