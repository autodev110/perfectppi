import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Building2, Check, Link2, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  checkLinkEligibility,
  loadConsentContext,
} from "@/features/partner/user-links";
import {
  approveAccountLink,
  declineAccountLink,
} from "@/features/partner/link-actions";
import { isPartnerSystem, partnerLabel } from "@/features/partner/systems";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ partner: string; state: string }>;
  searchParams: Promise<{ error?: string }>;
}

// ============================================================================
// The consent screen. Reached from a partner, but authenticated entirely by
// Perfect PPI: the technician signs in here with their existing Perfect PPI
// account, and the link is created only when they press Authorize.
//
// A matching email address is displayed as context and does nothing else — it
// never pre-approves or silently creates the link.
// ============================================================================

function failureCopy(partner: string): Record<string, { title: string; detail: string }> {
  return {
    unknown_transaction: {
      title: uiText("ui.this_link_request_is_not_recognized_ff5ca3ce02"),
      detail: uiText("ui.start_the_connection_again_from_to_get_a_fre_868c8196dd", { arg0: String(partner) }),
    },
    expired: {
      title: uiText("ui.this_link_request_has_expired_5d284ae345"),
      detail: uiText("ui.link_requests_are_valid_for_15_minutes_start_93314137e0", { arg0: String(partner) }),
    },
    already_used: {
      title: uiText("ui.this_link_request_has_already_been_used_d1d5f4e1c8"),
      detail: uiText("ui.each_request_works_once_start_again_from_if__4f03961e64", { arg0: String(partner) }),
    },
    connection_revoked: {
      title: uiText("ui.this_connection_is_no_longer_active_35fd5e1e6e", { arg0: String(partner) }),
      detail: uiText("ui.ask_your_organization_manager_to_reconnect_i_7b4b0f7c2b", { arg0: String(partner) }),
    },
    no_inspection_access: {
      title: uiText("ui.this_account_cannot_be_assigned_inspections_fc5ce52406"),
      detail: uiText("ui.inspections_are_assigned_to_technicians_and__ee7da4205e", { arg0: String(partner) }),
    },
    not_org_member: {
      title: uiText("ui.this_account_is_not_part_of_the_connected_or_9b39170552"),
      detail: uiText("ui.you_can_only_link_an_account_that_belongs_to_3284c26d39", { arg0: String(partner) }),
    },
    profile_missing: {
      title: uiText("ui.we_could_not_find_your_perfect_ppi_profile_0763a3417f"),
      detail: uiText("ui.contact_support_so_we_can_look_into_it_aaaa007351"),
    },
    internal_error: {
      title: uiText("ui.something_went_wrong_ab827e3fe1"),
      detail: uiText("ui.please_try_again_in_a_moment_7ba353b04a"),
    },
  };
}

export default async function PartnerLinkPage({ params, searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const { partner, state } = await params;
  const { error: errorParam } = await searchParams;

  // Only reachable through a partner this deployment knows about. The path never
  // decides the partner shown below: that always comes from the transaction.
  if (!isPartnerSystem(partner)) notFound();
  const linkPath = `/link/${partner}/${state}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(linkPath)}`);
  }

  const context = await loadConsentContext(state);
  if ("error" in context) {
    return <LinkFailure code={context.error} partner={partnerLabel(partner)} />;
  }

  const partnerName = context.data.partnerLabel;

  if (errorParam && failureCopy(partnerName)[errorParam]) {
    return <LinkFailure code={errorParam} partner={partnerName} />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return <LinkFailure code="profile_missing" partner={partnerName} />;
  }

  const eligibility = await checkLinkEligibility(
    profile.id,
    context.data.organizationId,
  );

  if (!eligibility.eligible) {
    return (
      <LinkFailure
        code={eligibility.reason ?? "internal_error"}
        partner={partnerName}
        signedInAs={profile.display_name ?? user.email ?? null}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Link2 className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">{uiText("ui.account_linking_e1f0d6f4fe")}</span>
          </div>
          <CardTitle className="text-xl">{uiText("ui.link_your_perfect_ppi_account_to_a40391212e")}{context.data.partnerLabel}?
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">{context.data.organizationName}</p>
                <p className="text-muted-foreground">{`${partnerName} user `}
                  <span className="font-mono text-xs">{context.data.externalUserId}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <p className="font-medium">{uiText("ui.signed_in_to_perfect_ppi_as_34b376949c")}</p>
            <div className="rounded-lg border p-3">
              <p className="font-semibold">
                {profile.display_name ?? user.email ?? uiText("ui.your_account_dbb5f6371b")}
              </p>
              {profile.username && (
                <p className="text-xs text-muted-foreground">@{profile.username}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
            </div>
            <p className="text-xs text-muted-foreground">{uiText("ui.not_you_5b978f5d00")}{" "}
              <Link
                href={`/login?redirect=${encodeURIComponent(linkPath)}`}
                className="underline"
              >{uiText("ui.sign_in_with_a_different_account_f558d6a3b9")}</Link>
              .
            </p>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <p className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{uiText("ui.inspections_this_user_sends_will_be_assigned_1ccf5854b7", { arg0: String(partnerName) })}</span>
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{uiText("ui.the_two_accounts_stay_separate_never_receive_5cb1223213", { arg0: String(partnerName) })}</span>
            </p>
            <p className="flex items-start gap-2">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{uiText("ui.your_organization_manager_can_revoke_this_li_f06c4e1c40")}</span>
            </p>
          </div>

          <div className="flex gap-3">
            <form action={approveAccountLink} className="flex-1">
              <input type="hidden" name="partner" value={partner} />
              <input type="hidden" name="state" value={state} />
              <Button type="submit" className="w-full">{uiText("ui.authorize_b6741b4ccf")}</Button>
            </form>
            <form action={declineAccountLink} className="flex-1">
              <input type="hidden" name="partner" value={partner} />
              <input type="hidden" name="state" value={state} />
              <Button type="submit" variant="outline" className="w-full">{uiText("ui.cancel_19766ed6cc")}</Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LinkFailure({
  code,
  partner,
  signedInAs,
}: {
  code: string;
  partner: string;
  signedInAs?: string | null;
}) {
  const copies = failureCopy(partner);
  const copy = copies[code] ?? copies.internal_error;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">{uiText("ui.cannot_link_7c835a4576")}</span>
          </div>
          <CardTitle className="text-xl">{copy.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{copy.detail}</p>
          {signedInAs && (
            <p className="text-xs text-muted-foreground">{uiText("ui.signed_in_as_d293f00044")}<span className="font-medium">{signedInAs}</span>.
            </p>
          )}
          <Button variant="outline" asChild>
            <Link href="/">{uiText("ui.back_to_perfect_ppi_61369874b6")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
