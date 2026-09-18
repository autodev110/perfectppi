"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/features/auth/hooks";
import type { EnforcementNotice } from "@/lib/moderation/enforcement-notice";

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
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
          <h1 className="font-heading text-3xl font-bold tracking-tight">{uiText("ui.checking_your_account_caea68eeb9")}</h1>
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
          <h1 className="font-heading text-3xl font-bold tracking-tight">{uiText("ui.we_can_t_load_your_account_62670c847b")}</h1>
          <p className="text-muted-foreground">{uiText("ui.you_re_signed_in_but_your_account_is_current_ca68d366a6")}</p>
        </div>
      )}

      <div className="space-y-3">
        {!enforced ? (
          <Button asChild className="w-full">
            <Link href="/dashboard">{uiText("ui.try_again_d8b8392e2c")}</Link>
          </Button>
        ) : null}
        <Button asChild variant={enforced ? "default" : "ghost"} className="w-full">
          <Link href={status?.support_path ?? "/support"}>{enforced ? uiText("ui.contact_support_to_request_a_review_9f84f24c9a") : uiText("ui.contact_support_814f4ed2d5")}</Link>
        </Button>
        <Button variant="outline" className="w-full" onClick={signOut}>{uiText("ui.sign_out_48f0d3d397")}</Button>
        {enforced ? (
          <Button asChild variant="ghost" className="w-full">
            <Link href="/privacy-choices">{uiText("ui.privacy_choices_and_data_requests_cd4179787b")}</Link>
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{uiText("ui.you_can_still_read_our_policies_contact_supp_926ef3983e")}</p>
    </div>
  );
}
