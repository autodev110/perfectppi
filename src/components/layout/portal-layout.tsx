"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Settings, User, Search } from "lucide-react";
import Link from "next/link";
import { NotificationBell } from "@/components/shared/notification-bell";
import { PageReveal } from "@/components/shared/page-reveal";

interface PortalLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  settingsHref: string;
  profileHref: string;
  messagesBase: string;
}

export function PortalLayout({
  children,
  sidebar,
  settingsHref,
  profileHref,
  messagesBase,
}: PortalLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <div className="hidden lg:flex">{sidebar}</div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between px-4 lg:px-8">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>

          <div className="lg:hidden" />

          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
              <input
                type="text"
                placeholder="Search..."
                className="h-9 w-56 rounded-xl bg-surface-container-lowest pl-9 pr-4 text-sm ring-1 ring-outline-variant/20 placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-on-tertiary-container/30 transition-all"
              />
            </div>

            <NotificationBell messagesBase={messagesBase} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-xs font-bold text-white">
                    <User className="h-4 w-4" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={profileHref}>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={settingsHref}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <PageReveal>{children}</PageReveal>
        </main>
      </div>
    </div>
  );
}
