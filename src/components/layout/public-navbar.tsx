"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/hooks";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

const navLinks = [
  { label: "Inspection", href: "/#features" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Community", href: "/community" },
  { label: "Technicians", href: "/technicians" },
  { label: "Warranty", href: "/#warranty" },
];

export function PublicNavbar() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 glass-nav shadow-sm">
      <div className="flex justify-between items-center px-8 h-16 max-w-7xl mx-auto">
        <Link
          href="/"
          className="text-xl font-black tracking-tighter text-slate-900"
        >
          PerfectPPI
        </Link>

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
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="font-heading font-bold tracking-tight text-sm text-slate-500 px-4 py-2 hover:text-slate-900 transition-colors"
                  >
                    Login
                  </Link>
                  <Link
                    href="/signup"
                    className="bg-primary text-primary-foreground px-6 py-2 rounded-xl font-heading font-bold tracking-tight text-sm hover:opacity-90 transition-opacity"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <button className="p-2" suppressHydrationWarning>
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
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
                    >
                      Dashboard
                    </Link>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => setOpen(false)}
                        className="font-heading font-bold text-sm text-slate-500"
                      >
                        Login
                      </Link>
                      <Link
                        href="/signup"
                        onClick={() => setOpen(false)}
                        className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-heading font-bold text-sm text-center"
                      >
                        Sign up
                      </Link>
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
