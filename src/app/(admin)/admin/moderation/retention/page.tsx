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

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ notice?: string }> };

export default async function ModerationRetentionPage({ searchParams }: PageProps) {
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
        <p className="text-xs text-muted-foreground"><Link href="/admin/moderation" className="underline">Queue</Link> / retention</p>
        <h1 className="font-heading text-2xl font-bold">Evidence Retention</h1>
        <p className="text-muted-foreground">
          Closed moderation cases are purged only after an approved retention period (plan 19.3). No period means
          <strong> not eligible</strong>, never &ldquo;purge now&rdquo;. Legal holds always override expiry. The worker runs daily.
        </p>
      </div>

      {notice ? <p className="rounded-md border px-3 py-2 text-sm" role="status">{notice}</p> : null}

      {!hasCommunityPolicy ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          No retention period is recorded for <code>community_safety</code>, the basis every Community case uses. Per the
          retention register this period is awaiting Trust &amp; Safety / counsel approval; production launch is blocked
          until one is recorded here. Until then closed cases keep their evidence restricted and are never purged.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Closed cases awaiting a policy" value={status.closedCasesAwaitingPolicy ?? 0} />
        <Stat label="Cases eligible now" value={status.casesEligibleNow ?? 0} />
        <Stat label="Cases purged" value={status.casesPurged ?? 0} />
        <Stat label="Under legal hold (never purged)" value={status.casesUnderLegalHold ?? 0} />
        <Stat label="Archived posts eligible (30d, unreported)" value={status.archivedPostsEligibleNow ?? 0} />
        <Stat label="Purges in the last 30 days" value={status.purgeEventsLast30d ?? 0} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Approved retention periods</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(policies ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : null}
          {(policies ?? []).map((policy) => (
            <div key={policy.basis} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
              <div className="min-w-56 flex-1 text-sm">
                <code>{policy.basis}</code> · <Badge variant="secondary">{policy.retention_days} days</Badge>
                <p className="text-xs text-muted-foreground">Approved {formatDate(policy.approved_at)} · {policy.approval_reference}</p>
              </div>
              {canSetPolicy ? (
                <form action={clearRetentionPolicy} className="flex items-center gap-2">
                  <input type="hidden" name="basis" value={policy.basis} />
                  <Input name="reason" required minLength={10} maxLength={500} placeholder="Reason to clear (audited)" className="max-w-xs" />
                  <Button size="sm" variant="outline" type="submit">Clear</Button>
                </form>
              ) : null}
            </div>
          ))}
          {canSetPolicy ? (
            <form action={setRetentionPolicy} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_2fr_auto]">
              <Input name="basis" defaultValue="community_safety" pattern="[a-z][a-z0-9_]{2,63}" required placeholder="basis" />
              <Input name="retention_days" type="number" min={1} max={3650} required placeholder="days" className="w-28" />
              <Input name="approval_reference" required minLength={10} maxLength={500} placeholder="Approval reference (ticket, memo, counsel sign-off)" />
              <Button size="sm" type="submit">Record period</Button>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">Recording or clearing a period requires the legal_hold_review capability.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Policy changes</CardTitle></CardHeader>
          <CardContent>
            {(policyEvents ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No changes recorded.</p> : (
              <ul className="space-y-1 text-sm">
                {(policyEvents ?? []).map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-3">
                    <span className="text-muted-foreground">{formatDate(event.created_at)}</span>
                    <span className="font-medium">{event.action}</span>
                    <code>{event.basis}</code>
                    {event.retention_days ? <span>{event.retention_days} days</span> : null}
                    <span className="text-muted-foreground">{event.approval_reference}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Recent purges</CardTitle></CardHeader>
          <CardContent>
            {(purges ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nothing has been purged.</p> : (
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
