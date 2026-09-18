"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/hooks";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

const navLinks = [
  { label: uiText("ui.inspection_6e4fa13da4"), href: "/#features" },
  { label: uiText("ui.marketplace_c608981d8d"), href: "/marketplace" },
  { label: uiText("ui.community_bb501d7877"), href: "/community" },
  { label: uiText("ui.technicians_8bb7fac529"), href: "/technicians" },
  { label: uiText("ui.warranty_4b72174757"), href: "/#warranty" },
];

export function PublicNavbar() {
  const uiText = useTranslator();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 glass-nav shadow-sm">
      <div className="flex justify-between items-center px-8 h-16 max-w-7xl mx-auto">
        <Link
          href="/"
          className="text-xl font-black tracking-tighter text-slate-900"
        >{uiText("ui.perfectppi_67127e136c")}</Link>

        <div className="hidden md:flex space-x-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-heading font-bold tracking-tight text-sm text-slate-500 hover:text-slate-900 transition-colors duration-200"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center space-x-4">
          {!loading && (
            <>
              {user ? (
                <Link
                  href="/dashboard"
                  className="bg-primary text-primary-foreground px-6 py-2 rounded-xl font-heading font-bold tracking-tight text-sm hover:opacity-90 transition-opacity"
                >{uiText("ui.dashboard_67b6964686")}</Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="font-heading font-bold tracking-tight text-sm text-slate-500 px-4 py-2 hover:text-slate-900 transition-colors"
                  >{uiText("ui.login_9d6322c1f4")}</Link>
                  <Link
                    href="/signup"
                    className="bg-primary text-primary-foreground px-6 py-2 rounded-xl font-heading font-bold tracking-tight text-sm hover:opacity-90 transition-opacity"
                  >{uiText("ui.sign_up_5e2b8e9650")}</Link>
                </>
              )}
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <button className="p-2" aria-label={uiText("ui.open_navigation_0ed77fd261")} suppressHydrationWarning>
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="sr-only">{uiText("ui.navigation_3db65f8c2a")}</SheetTitle>
            <SheetDescription className="sr-only">{uiText("ui.navigate_perfectppi_or_access_your_account_7e3be85274")}</SheetDescription>
            <nav className="mt-8 flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="font-heading font-bold text-sm text-slate-600 hover:text-slate-900"
                >
                  {link.label}
                </Link>
              ))}
              {!loading && (
                <>
                  {user ? (
                    <Link
                      href="/dashboard"
                      onClick={() => setOpen(false)}
                      className="mt-4 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-heading font-bold text-sm text-center"
                    >{uiText("ui.dashboard_67b6964686")}</Link>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => setOpen(false)}
                        className="font-heading font-bold text-sm text-slate-500"
                      >{uiText("ui.login_9d6322c1f4")}</Link>
                      <Link
                        href="/signup"
                        onClick={() => setOpen(false)}
                        className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-heading font-bold text-sm text-center"
                      >{uiText("ui.sign_up_5e2b8e9650")}</Link>
                    </>
                  )}
                </>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
