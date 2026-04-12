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

      <nav className="flex-1 space-y-1 px-2">
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
