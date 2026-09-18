"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

import { useTranslator } from "@/lib/i18n/client";

export function PageReveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const uiText = useTranslator();
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className={cn(
        "motion-reduce:animate-none",
        className,
      )}
      style={{
        animation: uiText("ui.page_reveal_420ms_cubic_bezier_0_22_1_0_36_1_7e5f35e322", { arg0: String(delayMs) }),
      }}
    >
      {children}
    </div>
  );
}
