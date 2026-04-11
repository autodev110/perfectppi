"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PageReveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className={cn(
        "motion-reduce:animate-none",
        className,
      )}
      style={{
        animation: `page-reveal 420ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms both`,
      }}
    >
      {children}
    </div>
  );
}
