import Link from "next/link";
import { requireModerationCapability } from "@/features/moderation/capabilities";
import { reviewModerationItem } from "@/features/moderation/actions";
import { getModerationQueue } from "@/features/moderation/queries";
import {
  QUEUE_TAB_LABELS,
  QUEUE_TABS,
  getModerationQueueCases,
  type QueueTab,
} from "@/features/moderation/case-queries";
import { getModerationOperationsStatus } from "@/features/moderation/outbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils/formatting";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ tab?: string }> };

const MEDIA_TAB = "media";

export default async function ModerationPage({ searchParams }: PageProps) {
  const { profile, capabilities } = await requireModerationCapability("queue_read");
  const params = await searchParams;
  const tab = (QUEUE_TABS as readonly string[]).includes(params.tab ?? "")
    ? (params.tab as QueueTab)
    : params.tab === MEDIA_TAB ? MEDIA_TAB : "new";

  const [cases, mediaItems, ops] = await Promise.all([
    tab === MEDIA_TAB ? Promise.resolve([]) : getModerationQueueCases(tab as QueueTab),
    tab === MEDIA_TAB ? getModerationQueue("pending_review") : Promise.resolve([]),
    getModerationOperationsStatus(),
  ]);
  const opsAlarm = (ops.casesOverdue ?? 0) > 0 || (ops.urgentUnacknowledged ?? 0) > 0
    || (ops.outboxDeadLettered ?? 0) > 0 || (ops.casesOpen ?? 0) > 25 || (ops.casesOver24hShare ?? 0) > 20;
  const canDecide = capabilities.has("content_decide");
  const canEnforce = capabilities.has("account_enforce");
  const canLegalHold = capabilities.has("legal_hold_review");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Moderation Review</h1>
          <p className="text-muted-foreground">
            Reported Community content, ordered by risk and review deadline. Every view and decision is audited.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[...capabilities].map((capability) => (
            <Badge key={capability} variant="secondary">{capability.replaceAll("_", " ")}</Badge>
          ))}
          <Button size="sm" variant="outline" asChild><Link href="/admin/moderation/access">Access</Link></Button>
        </div>
      </div>

      <Card className={opsAlarm ? "border-destructive/40" : undefined}>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 p-4 text-sm">
          <span><strong>{ops.casesOpen ?? 0}</strong> open</span>
          <span className={(ops.casesOverdue ?? 0) > 0 ? "text-destructive" : undefined}><strong>{ops.casesOverdue ?? 0}</strong> overdue</span>
          <span><strong>{ops.casesDueWithin2h ?? 0}</strong> due within 2h</span>
          <span className={(ops.urgentUnacknowledged ?? 0) > 0 ? "text-destructive" : undefined}><strong>{ops.urgentUnacknowledged ?? 0}</strong> urgent unacknowledged (15m)</span>
          <span className={(ops.casesOver24hShare ?? 0) > 20 ? "text-destructive" : undefined}><strong>{ops.casesOver24hShare ?? 0}%</strong> older than 24h</span>
          <span>notifications: <strong>{ops.outboxPending ?? 0}</strong> pending · <strong>{ops.outboxProcessing ?? 0}</strong> processing ·{" "}
            <span className={(ops.outboxDeadLettered ?? 0) > 0 ? "text-destructive" : undefined}><strong>{ops.outboxDeadLettered ?? 0}</strong> dead-lettered</span>
            {(ops.outboxOldestPendingMinutes ?? 0) > 15 ? ` · oldest ${ops.outboxOldestPendingMinutes}m` : ""}
          </span>
          {opsAlarm ? <span className="text-destructive">Guardrail exceeded — see plan 18.5 / 20.3.</span> : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {QUEUE_TABS.map((entry) => (
          <Button key={entry} size="sm" variant={tab === entry ? "default" : "outline"} asChild>
            <Link href={`/admin/moderation?tab=${entry}`}>{QUEUE_TAB_LABELS[entry]}</Link>
          </Button>
        ))}
        <Button size="sm" variant={tab === MEDIA_TAB ? "default" : "outline"} asChild>
          <Link href={`/admin/moderation?tab=${MEDIA_TAB}`}>Media scans</Link>
        </Button>
      </div>

      {tab !== MEDIA_TAB ? (
        cases.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No cases in this queue.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {cases.map((entry) => (
              <Link key={entry.id} href={`/admin/moderation/cases/${entry.id}`} className="block">
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {entry.entity_type.replaceAll("_", " ")} · case {entry.id.slice(0, 8)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.author ? `@${entry.author.username ?? entry.author.display_name ?? "member"}` : "author unavailable"}
                          {" · "}created {formatDate(entry.created_at)}
                          {entry.first_reported_at ? ` · first report ${formatDate(entry.first_reported_at)}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={entry.priority === "urgent" ? "destructive" : entry.priority === "high" ? "default" : "secondary"}>
                          {entry.priority}
                        </Badge>
                        <Badge variant="outline">{entry.state.replaceAll("_", " ")}</Badge>
                        {entry.slaOverdue ? <Badge variant="destructive">SLA overdue</Badge> : null}
                        {entry.hasMedia ? <Badge variant="outline">media</Badge> : null}
                        {entry.hasAppeal ? <Badge variant="outline">appeal</Badge> : null}
                        {entry.priorViolations > 0 ? <Badge variant="destructive">repeat ({entry.priorViolations})</Badge> : null}
                        {entry.legal_hold ? <Badge variant="destructive">legal hold</Badge> : null}
                      </div>
                    </div>
                    {entry.contentPreview ? (
                      <p className="line-clamp-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">{entry.contentPreview}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{entry.reportCount} unique report{entry.reportCount === 1 ? "" : "s"}</span>
                      <span>{entry.reasonCodes.map((code) => code.replaceAll("_", " ")).join(", ") || "no reasons"}</span>
                      <span>SLA due {formatDate(entry.sla_due_at)}</span>
                      <span>revision {entry.revision_id.slice(0, 8)} · v{entry.decision_version}</span>
                      {entry.assignee ? <span>assigned to @{entry.assignee.username ?? entry.assignee.display_name}</span> : null}
                      {entry.resolution ? <span>{entry.resolution.replaceAll("_", " ")}</span> : null}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )
      ) : mediaItems.filter((item) => item.entity_type === "community_post_media" || item.entity_type === "vehicle_media").length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No media awaiting review.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {mediaItems
            .filter((item) => item.entity_type === "community_post_media" || item.entity_type === "vehicle_media")
            .map((item) => {
              const author = Array.isArray(item.author) ? item.author[0] : item.author;
              return (
                <Card key={item.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{item.entity_type.replaceAll("_", " ")}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {author?.display_name ?? author?.username ?? "PerfectPPI user"} · {formatDate(item.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{item.status.replaceAll("_", " ")}</Badge>
                        <Badge variant={item.risk_level === "critical" ? "destructive" : "secondary"}>{item.risk_level} risk</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {item.status === "legal_hold" ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                        Preview is locked for legal-hold content. Follow the approved escalation process.
                      </div>
                    ) : item.media?.media_type === "video" ? (
                      <video src={`/api/moderation/media/${item.entity_id}`} controls preload="metadata" className="max-h-80 w-full rounded-xl border bg-black object-contain" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/moderation/media/${item.entity_id}`} alt="Moderation preview" className="max-h-80 rounded-xl border object-contain" />
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Reasons: {item.reason_codes.join(", ") || "none"}</span>
                      <span>Provider: {item.model_provider}</span>
                    </div>
                    {canDecide && !(item.status === "legal_hold" && !canLegalHold) ? (
                      <form action={reviewModerationItem} className="space-y-3 rounded-xl border p-4">
                        <input type="hidden" name="item_id" value={item.id} />
                        <Textarea name="notes" rows={2} maxLength={1000} placeholder="Internal review notes" />
                        {canEnforce ? (
                          <select name="enforcement" defaultValue="none" className="h-10 rounded-md border bg-background px-3 text-sm">
                            <option value="none">No account action</option>
                            <option value="warning">Issue warning</option>
                            <option value="posting_hold">7-day posting hold</option>
                            <option value="media_hold">7-day media hold</option>
                            <option value="suspension">7-day suspension</option>
                          </select>
                        ) : <input type="hidden" name="enforcement" value="none" />}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" name="decision" value="approve">Approve media</Button>
                          <Button size="sm" variant="destructive" name="decision" value="reject">Reject media</Button>
                          {canLegalHold ? <Button size="sm" variant="outline" name="decision" value="legal_hold">Preserve and Escalate</Button> : null}
                        </div>
                      </form>
                    ) : (
                      <p className="text-xs text-muted-foreground">You can view this item but do not hold the capability to decide it.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Signed in as {profile.display_name ?? profile.username ?? "moderator"}.</p>
    </div>
  );
}
