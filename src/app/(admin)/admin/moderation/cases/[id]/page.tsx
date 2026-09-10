import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModerationCapability } from "@/features/moderation/capabilities";
import { getModerationCase } from "@/features/moderation/case-queries";
import {
  addModerationCaseNote,
  claimModerationCase,
  decideModerationCase,
  releaseModerationCase,
} from "@/features/moderation/case-actions";
import { REPORT_REASON_CODES, REPORT_REASON_LABELS } from "@/features/moderation/report-reasons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils/formatting";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
};

function snapshotField(snapshot: unknown, key: string): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === "string" ? value : value == null ? null : JSON.stringify(value);
}

export default async function ModerationCasePage({ params, searchParams }: PageProps) {
  const { profile, capabilities } = await requireModerationCapability("queue_read");
  const { id } = await params;
  const { notice } = await searchParams;
  const detail = await getModerationCase(id, capabilities);
  if (!detail) notFound();

  const { case: moderationCase } = detail;
  const canDecide = capabilities.has("content_decide");
  const canEnforce = capabilities.has("account_enforce");
  const canLegalHold = capabilities.has("legal_hold_review");
  const isMine = moderationCase.assigned_moderator_id === profile.id;
  const claimedByOther = detail.claimLive && !isMine;
  const isOpen = moderationCase.state !== "closed";
  const decisionLocked = !isOpen || claimedByOther || !canDecide
    || (moderationCase.state === "escalated" && !canLegalHold);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground"><Link href="/admin/moderation" className="underline">Queue</Link> / case {moderationCase.id.slice(0, 8)}</p>
          <h1 className="font-heading text-2xl font-bold">
            {moderationCase.entity_type.replaceAll("_", " ")} · {moderationCase.state.replaceAll("_", " ")}
          </h1>
          <p className="text-sm text-muted-foreground">
            Priority {moderationCase.priority} · SLA due {formatDate(moderationCase.sla_due_at)} · decision v{moderationCase.decision_version}
            {moderationCase.resolution ? ` · ${moderationCase.resolution.replaceAll("_", " ")}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {moderationCase.legal_hold ? <Badge variant="destructive">legal hold</Badge> : null}
          {detail.claimLive && detail.assignee ? (
            <Badge variant={isMine ? "default" : "outline"}>
              {isMine ? "claimed by you" : `claimed by @${detail.assignee.username ?? detail.assignee.display_name}`}
              {moderationCase.claim_expires_at ? ` until ${formatDate(moderationCase.claim_expires_at)}` : ""}
            </Badge>
          ) : null}
        </div>
      </div>

      {notice ? (
        <p className="rounded-md border px-3 py-2 text-sm" role="status">{notice}</p>
      ) : null}
      {claimedByOther ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Another moderator is working on this case. You can review it, but decisions are blocked until their claim expires (plan 20.2).
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Reported revision</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {detail.evidence ? (
                <>
                  <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm">
                    {snapshotField(detail.evidence.snapshot, "content") ?? "Snapshot has no text"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Revision {moderationCase.revision_id.slice(0, 8)} · captured {formatDate(detail.evidence.capturedAt)} · sha256 {detail.evidence.sha256.slice(0, 12)}…
                    {snapshotField(detail.evidence.snapshot, "audienceAtReport") ? ` · audience at report: ${snapshotField(detail.evidence.snapshot, "audienceAtReport")}` : ""}
                    {snapshotField(detail.evidence.snapshot, "orphaned") ? " · original content was removed before the case system existed" : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No evidence snapshot is attached to this case.</p>
              )}
              {detail.currentContent && detail.currentContent.content !== snapshotField(detail.evidence?.snapshot, "content") ? (
                <div>
                  <p className="text-xs font-semibold">Current content (differs from the reported revision)</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-xl border p-3 text-sm">{detail.currentContent.content}</p>
                </div>
              ) : null}
              {detail.currentContent ? (
                <p className="text-xs text-muted-foreground">
                  Current status {detail.currentContent.status} / {detail.currentContent.moderation_status}
                  {detail.currentContent.audience ? ` · audience ${detail.currentContent.audience}` : ""}
                </p>
              ) : null}
              {detail.media.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {detail.media.map((media) => (
                    <div key={media.id} className="space-y-1">
                      {moderationCase.legal_hold && !canLegalHold ? (
                        <div className="flex aspect-square items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">locked</div>
                      ) : media.media_type === "video" ? (
                        <video src={`/api/moderation/media/${media.id}`} controls preload="metadata" className="aspect-square w-full rounded-lg border bg-black object-contain" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/moderation/media/${media.id}`} alt="Evidence media" className="aspect-square w-full rounded-lg border object-cover" />
                      )}
                      <p className="text-[11px] text-muted-foreground">{media.moderation_status.replaceAll("_", " ")}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Reports ({detail.reports.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {detail.reportsByReason.map((entry) => (
                  <Badge key={entry.reason} variant="secondary">{entry.reason.replaceAll("_", " ")} × {entry.count}</Badge>
                ))}
              </div>
              {detail.reports.map((report) => (
                <div key={report.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{report.reason_code.replaceAll("_", " ")}</p>
                  {report.details ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{report.details}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(report.created_at)}
                    {capabilities.has("reporter_identity_read")
                      ? ` · reporter ${report.reporter ? `@${report.reporter.username ?? report.reporter.display_name}` : "deleted account"}`
                      : " · reporter identity restricted"}
                  </p>
                </div>
              ))}
              {detail.appeals.map((appeal) => (
                <div key={appeal.id} className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                  <p className="font-medium">Appeal · {appeal.status}</p>
                  <p className="mt-1 whitespace-pre-wrap">{appeal.statement}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {detail.events.map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-muted-foreground">{formatDate(event.created_at)}</span>
                    <span className="font-medium">{event.event_type.replaceAll("_", " ")}</span>
                    <span className="text-muted-foreground">
                      {event.actor_type}{event.actor ? ` @${event.actor.username ?? event.actor.display_name}` : ""}
                      {event.previous_status && event.previous_status !== event.next_status ? ` · ${event.previous_status} → ${event.next_status}` : ""}
                    </span>
                    {event.notes ? <span className="w-full text-muted-foreground">{event.notes}</span> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Work on this case</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isOpen && canDecide ? (
                <div className="flex flex-wrap gap-2">
                  {!isMine || !detail.claimLive ? (
                    <form action={claimModerationCase}>
                      <input type="hidden" name="case_id" value={moderationCase.id} />
                      <Button size="sm" variant="outline" type="submit" disabled={claimedByOther}>
                        {detail.claimLive && isMine ? "Renew claim" : "Claim (15 min)"}
                      </Button>
                    </form>
                  ) : (
                    <>
                      <form action={claimModerationCase}>
                        <input type="hidden" name="case_id" value={moderationCase.id} />
                        <Button size="sm" variant="outline" type="submit">Renew claim</Button>
                      </form>
                      <form action={releaseModerationCase}>
                        <input type="hidden" name="case_id" value={moderationCase.id} />
                        <Button size="sm" variant="ghost" type="submit">Release</Button>
                      </form>
                    </>
                  )}
                </div>
              ) : null}

              {decisionLocked ? (
                <p className="text-sm text-muted-foreground">
                  {!isOpen
                    ? "This case is closed."
                    : claimedByOther
                      ? "Decisions are blocked while another moderator holds the claim."
                      : !canDecide
                        ? "You can read this case but do not hold content_decide."
                        : "Escalated cases can only be decided by a legal-hold reviewer."}
                </p>
              ) : (
                <form action={decideModerationCase} className="space-y-3">
                  <input type="hidden" name="case_id" value={moderationCase.id} />
                  {/* Compare-and-swap token: a stale value is refused server-side. */}
                  <input type="hidden" name="decision_version" value={moderationCase.decision_version} />
                  <label className="block text-xs font-semibold">
                    Policy category (required to remove)
                    <select name="policy_category" defaultValue="" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                      <option value="">Choose a category</option>
                      {REPORT_REASON_CODES.map((code) => (
                        <option key={code} value={code}>{REPORT_REASON_LABELS[code]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold">
                    Rationale (required to remove or escalate; recorded in the audit trail)
                    <Textarea name="rationale" rows={3} maxLength={2000} className="mt-1" />
                  </label>
                  {canEnforce ? (
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <label className="block text-xs font-semibold">
                        Account action
                        <select name="enforcement" defaultValue="none" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                          <option value="none">None</option>
                          <option value="warning">Warning</option>
                          <option value="posting_hold">Posting hold</option>
                          <option value="media_hold">Media hold</option>
                          <option value="reporting_hold">Reporting hold</option>
                          <option value="suspension">Temporary suspension</option>
                          <option value="ban">Ban</option>
                        </select>
                      </label>
                      <label className="block text-xs font-semibold">
                        Days
                        <input name="enforcement_days" type="number" min={1} max={365} defaultValue={7} className="mt-1 h-10 w-20 rounded-md border bg-background px-3 text-sm" />
                      </label>
                    </div>
                  ) : (
                    <>
                      <input type="hidden" name="enforcement" value="none" />
                      <p className="text-xs text-muted-foreground">Account enforcement requires the account_enforce capability.</p>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" name="decision" value="restore">Restore Post</Button>
                    <Button size="sm" variant="destructive" name="decision" value="remove">Remove from Community</Button>
                    {canLegalHold && moderationCase.state !== "escalated" ? (
                      <Button size="sm" variant="outline" name="decision" value="escalate">Preserve and Escalate</Button>
                    ) : null}
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Author</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{detail.author ? `@${detail.author.username ?? detail.author.display_name}` : "Account unavailable"}</p>
              <p className="text-xs text-muted-foreground">
                {detail.authorHistory.priorCases.length} other case{detail.authorHistory.priorCases.length === 1 ? "" : "s"} ·{" "}
                {detail.authorHistory.priorCases.filter((entry) => entry.resolution === "violation_removed").length} confirmed violation(s)
              </p>
              {detail.authorHistory.enforcement.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {detail.authorHistory.enforcement.map((action) => (
                    <li key={action.id}>
                      {action.action_type.replaceAll("_", " ")} · {formatDate(action.starts_at)}
                      {action.ends_at ? ` → ${formatDate(action.ends_at)}` : ""}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">No enforcement history.</p>}
              {detail.priorRevisionCases.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {detail.priorRevisionCases.length} earlier case(s) on this content.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Internal notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {detail.notes.length === 0 ? <p className="text-xs text-muted-foreground">No notes yet.</p> : null}
              {detail.notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{note.note}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {note.author ? `@${note.author.username ?? note.author.display_name}` : "moderator"} · {formatDate(note.created_at)}
                  </p>
                </div>
              ))}
              <form action={addModerationCaseNote} className="space-y-2">
                <input type="hidden" name="case_id" value={moderationCase.id} />
                <Textarea name="note" rows={2} maxLength={2000} placeholder="Add an internal note (append-only)" required />
                <Button size="sm" variant="outline" type="submit">Add note</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
