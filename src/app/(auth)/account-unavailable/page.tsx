"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/features/auth/hooks";

/**
 * Terminal screen for a valid session whose profile row cannot be read.
 *
 * It lives in the (auth) group so it inherits the sign-in chrome without
 * picking up a role guard, and it is deliberately absent from the middleware's
 * AUTH_ROUTES — landing here must not bounce an authenticated visitor onward,
 * because bouncing is what produced the redirect loop this page replaces.
 *
 * Signing out is the escape hatch: it clears the session, which makes /login
 * reachable again.
 */
export default function AccountUnavailablePage() {
  const signOut = useSignOut();

  return (
    <div className="space-y-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <AlertTriangle className="h-6 w-6 text-on-secondary-container" />
      </div>

      <div className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          We can&apos;t load your account
        </h1>
        <p className="text-muted-foreground">
          You&apos;re signed in, but your account is currently unavailable. This
          may be temporary or may require help from support.
        </p>
      </div>

      <div className="space-y-3">
        <Button asChild className="w-full">
          <Link href="/dashboard">Try again</Link>
        </Button>
        <Button variant="outline" className="w-full" onClick={signOut}>
          Sign out
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/support">Contact support</Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        You can still read our policies, contact support, and exercise your
        privacy rights while product access is unavailable.
      </p>
    </div>
  );
}
