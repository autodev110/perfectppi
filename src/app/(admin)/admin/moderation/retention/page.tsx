import Link from "next/link";
import { requireModerationCapability } from "@/features/moderation/capabilities";
import { getRetentionStatus } from "@/features/moderation/retention";
import { clearRetentionPolicy, setRetentionPolicy } from "@/features/moderation/retention-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils/formatting";

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ notice?: string }> };

export default async function ModerationRetentionPage({ searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const { capabilities } = await requireModerationCapability("queue_read");
  const { notice } = await searchParams;
  const admin = createAdminClient();
  const [status, { data: policies }, { data: policyEvents }, { data: purges }] = await Promise.all([
    getRetentionStatus(),
    admin.from("moderation_retention_policies").select("*").order("basis"),
    admin.from("moderation_retention_policy_events").select("*").order("created_at", { ascending: false }).limit(20),
    admin.from("retention_purge_events").select("*").order("created_at", { ascending: false }).limit(30),
  ]);
  const canSetPolicy = capabilities.has("legal_hold_review");
  const hasCommunityPolicy = (policies ?? []).some((policy) => policy.basis === "community_safety");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground"><Link href="/admin/moderation" className="underline">{uiText("ui.queue_3b2fe03e36")}</Link>{uiText("ui.retention_8fe5a499d3")}</p>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.evidence_retention_2fa5ad947c")}</h1>
        <p className="text-muted-foreground">{uiText("ui.closed_moderation_cases_are_purged_only_afte_914180a252")}<strong>{uiText("ui.not_eligible_bf2f825a59")}</strong>{uiText("ui.never_purge_now_legal_holds_always_override__8e1eeb4efe")}</p>
      </div>

      {notice ? <p className="rounded-md border px-3 py-2 text-sm" role="status">{notice}</p> : null}

      {!hasCommunityPolicy ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{uiText("ui.no_retention_period_is_recorded_for_43be798cd4")}<code>{uiText("ui.community_safety_67aaaffd14")}</code>{uiText("ui.the_basis_every_community_case_uses_per_the__c1f5efc858")}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={uiText("ui.closed_cases_awaiting_a_policy_639b3be41e")} value={status.closedCasesAwaitingPolicy ?? 0} />
        <Stat label={uiText("ui.cases_eligible_now_68db7359c9")} value={status.casesEligibleNow ?? 0} />
        <Stat label={uiText("ui.cases_purged_a8d9aa9a27")} value={status.casesPurged ?? 0} />
        <Stat label={uiText("ui.under_legal_hold_never_purged_4c94546020")} value={status.casesUnderLegalHold ?? 0} />
        <Stat label={uiText("ui.archived_posts_eligible_30d_unreported_e60678d6fe")} value={status.archivedPostsEligibleNow ?? 0} />
        <Stat label={uiText("ui.purges_in_the_last_30_days_e12d20df76")} value={status.purgeEventsLast30d ?? 0} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{uiText("ui.approved_retention_periods_ceca642c14")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(policies ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{uiText("ui.none_recorded_ef49549a5e")}</p> : null}
          {(policies ?? []).map((policy) => (
            <div key={policy.basis} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
              <div className="min-w-56 flex-1 text-sm">
                <code>{policy.basis}</code> · <Badge variant="secondary">{policy.retention_days}{uiText("ui.days_b1c503166f")}</Badge>
                <p className="text-xs text-muted-foreground">{uiText("ui.approved_12c6e7cd41")}{formatDate(policy.approved_at)} · {policy.approval_reference}</p>
              </div>
              {canSetPolicy ? (
                <form action={clearRetentionPolicy} className="flex items-center gap-2">
                  <input type="hidden" name="basis" value={policy.basis} />
                  <Input name="reason" required minLength={10} maxLength={500} placeholder={uiText("ui.reason_to_clear_audited_641359c07a")} className="max-w-xs" />
                  <Button size="sm" variant="outline" type="submit">{uiText("ui.clear_83b12c2216")}</Button>
                </form>
              ) : null}
            </div>
          ))}
          {canSetPolicy ? (
            <form action={setRetentionPolicy} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_2fr_auto]">
              <Input name="basis" defaultValue="community_safety" pattern="[a-z][a-z0-9_]{2,63}" required placeholder={uiText("ui.basis_a7a3c8f654")} />
              <Input name="retention_days" type="number" min={1} max={3650} required placeholder={uiText("ui.days_ab51004e9d")} className="w-28" />
              <Input name="approval_reference" required minLength={10} maxLength={500} placeholder={uiText("ui.approval_reference_ticket_memo_counsel_sign__accf44be1b")} />
              <Button size="sm" type="submit">{uiText("ui.record_period_cf76f0f965")}</Button>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">{uiText("ui.recording_or_clearing_a_period_requires_the__29fdc6dd5b")}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{uiText("ui.policy_changes_9417b7997a")}</CardTitle></CardHeader>
          <CardContent>
            {(policyEvents ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{uiText("ui.no_changes_recorded_87eee7c0c2")}</p> : (
              <ul className="space-y-1 text-sm">
                {(policyEvents ?? []).map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-3">
                    <span className="text-muted-foreground">{formatDate(event.created_at)}</span>
                    <span className="font-medium">{event.action}</span>
                    <code>{event.basis}</code>
                    {event.retention_days ? <span>{event.retention_days}{uiText("ui.days_b1c503166f")}</span> : null}
                    <span className="text-muted-foreground">{event.approval_reference}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{uiText("ui.recent_purges_dc171f447f")}</CardTitle></CardHeader>
          <CardContent>
            {(purges ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{uiText("ui.nothing_has_been_purged_7ab490c932")}</p> : (
              <ul className="space-y-1 text-sm">
                {(purges ?? []).map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-3">
                    <span className="text-muted-foreground">{formatDate(event.created_at)}</span>
                    <span className="font-medium">{event.entity_type.replaceAll("_", " ")}</span>
                    <code>{event.entity_id.slice(0, 8)}</code>
                    <span className="text-muted-foreground">{event.basis}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
