import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertCircle, Building2, Check, Plug, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  approvePartnerConnect,
  createOrganizationForConnect,
  declinePartnerConnect,
} from "@/features/partner/connect-actions";
import { isPkceChallenge } from "@/features/partner/crypto";
import { browserConnectCallback, partnerSystem } from "@/features/partner/systems";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ partner: string }>;
  searchParams: Promise<{
    state?: string;
    code_challenge?: string;
    shop?: string;
    error?: string;
  }>;
}

// ============================================================================
// Where a partner's "Connect Perfect PPI" button lands.
//
// The shop name in the URL is only a label. Which account gets connected is
// decided later by the partner's backend, and the code can only reach the
// partner's configured callback, so a forged link cannot connect anything.
// ============================================================================

const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export default async function PartnerConnectPage({ params, searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const { partner } = await params;
  const query = await searchParams;

  const system = partnerSystem(partner);
  if (!system?.browserConnect) notFound();

  const state = query.state ?? "";
  const challenge = query.code_challenge ?? "";
  const shop = (query.shop ?? "").trim().slice(0, 120);

  if (!STATE_PATTERN.test(state) || !isPkceChallenge(challenge)) {
    return (
      <ConnectFailure
        title={uiText("ui.this_connection_link_is_not_valid_9f1a150c2f")}
        detail={`Start again from ${system.label}: open Inspections and choose Connect Perfect PPI.`}
      />
    );
  }

  if (!browserConnectCallback(system)) {
    return (
      <ConnectFailure
        title={uiText("ui.connections_are_not_available_right_now_438269732f", { arg0: String(system.label) })}
        detail="This Perfect PPI deployment has no valid application address configured for it. Contact support."
      />
    );
  }

  const here = new URLSearchParams({ state, code_challenge: challenge });
  if (shop) here.set("shop", shop);
  const returnPath = `/connect/${system.id}?${here}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(returnPath)}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: techProfile } = profile
    ? await supabase
        .from("technician_profiles")
        .select("organization_id")
        .eq("profile_id", profile.id)
        .maybeSingle()
    : { data: null };

  const hidden = (
    <>
      <input type="hidden" name="partner" value={system.id} />
      <input type="hidden" name="state" value={state} />
      <input type="hidden" name="code_challenge" value={challenge} />
      <input type="hidden" name="shop" value={shop} />
    </>
  );

  if (!profile || profile.role === "admin") {
    return (
      <ConnectFailure
        title={uiText("ui.this_account_cannot_connect_an_organization_93eac3e944")}
        detail="Sign in with the account that manages your Perfect PPI organization."
        signInPath={`/login?redirect=${encodeURIComponent(returnPath)}`}
      />
    );
  }

  // Belongs to an organization someone else manages: the decision is theirs.
  if (profile.role !== "org_manager" && techProfile?.organization_id) {
    return (
      <ConnectFailure
        title={uiText("ui.only_your_organization_manager_can_connect_e2c30c7f0e")}
        detail={`Ask them to choose Connect Perfect PPI in ${system.label}. Once it is connected you can link your own account from there.`}
        signInPath={`/login?redirect=${encodeURIComponent(returnPath)}`}
      />
    );
  }

  // No organization yet. This is the common case for a shop new to Perfect PPI.
  if (profile.role !== "org_manager") {
    return (
      <ConnectShell title={uiText("ui.set_up_your_shop_to_connect_003b1aba4a", { arg0: String(system.label) })}>
        <p className="text-sm text-muted-foreground">{uiText("ui.perfect_ppi_connects_to_an_organization_crea_3c5435166e")}</p>
        {query.error === "organization_failed" && (
          <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{uiText("ui.the_organization_could_not_be_created_check__3c974488a0")}</p>
        )}
        <form action={createOrganizationForConnect} className="space-y-4">
          {hidden}
          <div className="space-y-2">
            <Label htmlFor="organization_name">{uiText("ui.organization_name_9a807d52ba")}</Label>
            <Input
              id="organization_name"
              name="organization_name"
              defaultValue={shop}
              required
              minLength={2}
              maxLength={200}
            />
          </div>
          <Button type="submit" className="w-full">{uiText("ui.create_organization_and_continue_f53babcf60")}</Button>
        </form>
        <form action={declinePartnerConnect}>
          {hidden}
          <Button type="submit" variant="ghost" className="w-full">{uiText("ui.cancel_19766ed6cc")}</Button>
        </form>
      </ConnectShell>
    );
  }

  const organizationId = techProfile?.organization_id ?? null;
  if (!organizationId) {
    return (
      <ConnectFailure
        title={uiText("ui.this_account_is_not_attached_to_an_organizat_984d882c93")}
        detail="Contact support so we can look into it."
        signInPath={`/login?redirect=${encodeURIComponent(returnPath)}`}
      />
    );
  }
  const admin = createAdminClient();
  const [{ data: organization }, { data: existing }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    admin
      .from("partner_connections")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("source_system", system.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  return (
    <ConnectShell title={uiText("ui.connect_to_perfect_ppi_9ff996438a", { arg0: String(system.label) })}>
      {query.error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{uiText("ui.something_went_wrong_and_nothing_was_connect_c8f18972dc")}</p>
      )}

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium">{organization?.name ?? uiText("ui.your_organization_8fd3f0c72d")}</p>
            {shop && (
              <p className="break-words text-muted-foreground">
                {`${system.label} shop: ${shop}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {existing && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          {uiText("ui.this_organization_is_already_connected_to_co_3fa4412af1", { arg0: String(system.label) })}
        </p>
      )}

      <div className="space-y-2 text-sm">
        <p className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{uiText("ui.staff_can_send_vehicles_to_your_technicians__32663a2973", { arg0: String(system.label) })}</span>
        </p>
        <p className="flex items-start gap-2">
          <Send className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{uiText("ui.each_finished_report_and_vsc_determination_i_4808991695", { arg0: String(system.label) })}</span>
        </p>
        <p className="flex items-start gap-2">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{uiText("ui.you_can_revoke_this_at_any_time_from_integra_8f5240f8de")}</span>
        </p>
      </div>

      <Separator />

      <div className="flex gap-3">
        <form action={approvePartnerConnect} className="flex-1">
          {hidden}
          <Button type="submit" className="w-full">{uiText("ui.connect_1a2303ede0")}</Button>
        </form>
        <form action={declinePartnerConnect} className="flex-1">
          {hidden}
          <Button type="submit" variant="outline" className="w-full">{uiText("ui.cancel_19766ed6cc")}</Button>
        </form>
      </div>
    </ConnectShell>
  );
}

function ConnectShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Plug className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">{uiText("ui.connection_request_cd97ea1cff")}</span>
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">{children}</CardContent>
      </Card>
    </div>
  );
}

function ConnectFailure({
  title,
  detail,
  signInPath,
}: {
  title: string;
  detail: string;
  signInPath?: string;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">{uiText("ui.cannot_connect_e504e13a88")}</span>
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{detail}</p>
          <div className="flex flex-wrap gap-2">
            {signInPath && (
              <Button asChild>
                <Link href={signInPath}>{uiText("ui.sign_in_with_a_different_account_f558d6a3b9")}</Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/">{uiText("ui.back_to_perfect_ppi_61369874b6")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
