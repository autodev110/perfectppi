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
  LogOut,
  Tag,
  Newspaper,
  Star,
  Plug,
} from "lucide-react";
import type { ComponentType } from "react";
import { useSignOut } from "@/features/auth/hooks";

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
  Tag,
  Newspaper,
  Star,
  Plug,
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
  const signOut = useSignOut();

  // Exactly one item highlights: the most specific href that covers the current
  // path. A bare prefix test lit up both "Inspections" (/org/inspections) and
  // "DealerSpace" (/org/inspections/dealerspace) at once.
  //
  // Two rules do the work:
  //   * matching is on a segment boundary, so /org/inspections-archive is not
  //     treated as living under /org/inspections
  //   * a portal root (/org, /tech, /admin, /dashboard — any single-segment
  //     href) matches only itself, so "Dashboard" does not stay lit across the
  //     whole portal
  const activeHref = items.reduce<string | null>((best, item) => {
    const isPortalRoot = item.href.split("/").filter(Boolean).length === 1;
    const matches = isPortalRoot
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

    if (!matches) return best;
    return best === null || item.href.length > best.length ? item.href : best;
  }, null);

  return (
    <aside className="flex h-full w-64 flex-col bg-slate-100 py-6">
      <div className="px-4 mb-8">
        <Link
          href="/"
          className="text-lg font-black tracking-tighter text-slate-900"
        >
          PerfectPPI
        </Link>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
          {title}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 px-2">
        {items.map((item) => {
          const Icon = iconMap[item.icon] ?? LayoutDashboard;
          const isActive = item.href === activeHref;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all",
                isActive
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200"
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1 border-t border-outline-variant/20 px-2 pt-4">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-200"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
