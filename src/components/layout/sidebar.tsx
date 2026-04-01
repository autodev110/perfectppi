"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Car,
  ClipboardCheck,
  Shield,
  MessageSquare,
  Image,
  User,
  Building2,
  Users,
  Wrench,
  FileText,
  FileSignature,
  CreditCard,
  ScrollText,
  Settings,
} from "lucide-react";
import type { ComponentType } from "react";

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Car,
  ClipboardCheck,
  Shield,
  MessageSquare,
  Image,
  User,
  Building2,
  Users,
  Wrench,
  FileText,
  FileSignature,
  CreditCard,
  ScrollText,
  Settings,
};

interface SidebarItem {
  label: string;
  href: string;
  icon: string;
}

interface SidebarProps {
  items: readonly SidebarItem[];
  title: string;
}

export function Sidebar({ items, title }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="font-heading text-lg font-bold text-primary">
          PerfectPPI
        </Link>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const Icon = iconMap[item.icon] ?? LayoutDashboard;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              item.href !== "/tech" &&
              item.href !== "/org" &&
              item.href !== "/admin" &&
              pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
