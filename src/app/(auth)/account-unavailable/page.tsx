"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/features/auth/hooks";
import type { EnforcementNotice } from "@/lib/moderation/enforcement-notice";

type Status = {
  available: boolean;
  notice: EnforcementNotice | null;
  actions: Array<{ id: string; label: string; ends_at: string | null }>;
  support_path: string;
};

/**
 * Terminal screen for a valid session that cannot use the product.
 *
 * Two cases share it: a suspended or closed account, which gets the
 * enforcement notice (what happened, for how long, how to ask for a review —
 * plan 17.4/18.6), and a profile row that cannot be read, which gets the
 * neutral "try again" wording.
 *
 * It lives in the (auth) group so it inherits the sign-in chrome without
 * picking up a role guard, and it is deliberately absent from the middleware's
 * AUTH_ROUTES — landing here must not bounce an authenticated visitor onward.
 * Signing out is the escape hatch.
 */
export default function AccountUnavailablePage() {
  const signOut = useSignOut();
  const [status, setStatus] = useState<Status | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/enforcement", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as { data: Status }).data : null))
      .catch(() => null)
      .then((data) => { if (!cancelled) setStatus(data); });
    return () => { cancelled = true; };
  }, []);

  const notice = status?.notice ?? null;
  const enforced = Boolean(notice && status && !status.available);

  return (
    <div className="space-y-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        {enforced ? <ShieldAlert className="h-6 w-6 text-on-secondary-container" /> : <AlertTriangle className="h-6 w-6 text-on-secondary-container" />}
      </div>

      {status === undefined ? (
        <div className="space-y-2" aria-busy="true">
          <h1 className="font-heading text-3xl font-bold tracking-tight">Checking your account…</h1>
        </div>
      ) : enforced && notice ? (
        <div className="space-y-3">
          <h1 className="font-heading text-3xl font-bold tracking-tight">{notice.title}</h1>
          <p className="text-muted-foreground">{notice.body}</p>
          <p className="text-sm text-muted-foreground">{notice.stillAvailable}</p>
          <p className="text-sm">{notice.nextStep}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            We can&apos;t load your account
          </h1>
          <p className="text-muted-foreground">
            You&apos;re signed in, but your account is currently unavailable. This
            may be temporary or may require help from support.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {!enforced ? (
          <Button asChild className="w-full">
            <Link href="/dashboard">Try again</Link>
          </Button>
        ) : null}
        <Button asChild variant={enforced ? "default" : "ghost"} className="w-full">
          <Link href={status?.support_path ?? "/support"}>{enforced ? "Contact support to request a review" : "Contact support"}</Link>
        </Button>
        <Button variant="outline" className="w-full" onClick={signOut}>
          Sign out
        </Button>
        {enforced ? (
          <Button asChild variant="ghost" className="w-full">
            <Link href="/privacy-choices">Privacy choices and data requests</Link>
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        You can still read our policies, contact support, and exercise your
        privacy rights while product access is unavailable.
      </p>
    </div>
  );
}
