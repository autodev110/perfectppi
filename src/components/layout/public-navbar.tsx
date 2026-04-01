"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/hooks";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function PublicNavbar() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-heading text-xl font-bold text-primary">
            {siteConfig.name}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/technicians"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Find a Technician
          </Link>
          {!loading && (
            <>
              {user ? (
                <Button asChild size="sm">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/login">Log in</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href="/signup">Sign up</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </nav>

        {/* Mobile nav */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <nav className="mt-8 flex flex-col gap-4">
              <Link
                href="/technicians"
                onClick={() => setOpen(false)}
                className="text-sm font-medium"
              >
                Find a Technician
              </Link>
              {!loading && (
                <>
                  {user ? (
                    <Button asChild>
                      <Link href="/dashboard" onClick={() => setOpen(false)}>
                        Dashboard
                      </Link>
                    </Button>
                  ) : (
                    <>
                      <Button variant="ghost" asChild>
                        <Link href="/login" onClick={() => setOpen(false)}>
                          Log in
                        </Link>
                      </Button>
                      <Button asChild>
                        <Link href="/signup" onClick={() => setOpen(false)}>
                          Sign up
                        </Link>
                      </Button>
                    </>
                  )}
                </>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
