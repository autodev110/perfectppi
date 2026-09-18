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

import { getRequestTranslator } from "@/lib/i18n/server";

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
  const uiText = await getRequestTranslator();
  const { profile, capabilities } = await requireModerationCapability("queue_read");
  const { id } = await params;
  const { notice } = await searchParams;
  const detail = await getModerationCase(id, capabilities);
  if (!detail) notFound();

  const { case: moderationCase } = detail;
  const canDecide = capabilities.has("content_decide");
  const canEnforce = capabilities.has("account_enforce");
  const canLegalHold = capabilities.has("legal_hold_review");
  const canExport = capabilities.has("evidence_export") && (!moderationCase.legal_hold || canLegalHold);
  const isMine = moderationCase.assigned_moderator_id === profile.id;
  const claimedByOther = detail.claimLive && !isMine;
  const isOpen = moderationCase.state !== "closed";
  const decisionLocked = !isOpen || claimedByOther || !canDecide
    || (moderationCase.state === "escalated" && !canLegalHold);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground"><Link href="/admin/moderation" className="underline">{uiText("ui.queue_3b2fe03e36")}</Link>{uiText("ui.case_889f5c66ab")}{moderationCase.id.slice(0, 8)}</p>
          <h1 className="font-heading text-2xl font-bold">
            {moderationCase.entity_type.replaceAll("_", " ")} · {moderationCase.state.replaceAll("_", " ")}
          </h1>
          <p className="text-sm text-muted-foreground">{uiText("ui.priority_60fdce82f5")}{moderationCase.priority}{uiText("ui.sla_due_024f804222")}{formatDate(moderationCase.sla_due_at)}{uiText("ui.decision_v_002cab9ecb")}{moderationCase.decision_version}
            {moderationCase.resolution ? uiText("ui.text_913ac5c53d", { arg0: String(moderationCase.resolution.replaceAll("_", " ")) }) : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {canExport ? (
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/admin/moderation/cases/${moderationCase.id}/export`} download>{uiText("ui.export_evidence_caab91492e")}</a>
            </Button>
          ) : null}
          {moderationCase.legal_hold ? <Badge variant="destructive">{uiText("ui.legal_hold_45046e8968")}</Badge> : null}
          {detail.claimLive && detail.assignee ? (
            <Badge variant={isMine ? "default" : "outline"}>
              {isMine ? uiText("ui.claimed_by_you_169127a1f7") : uiText("ui.claimed_by_e943effc75", { arg0: String(detail.assignee.username ?? detail.assignee.display_name) })}
              {moderationCase.claim_expires_at ? uiText("ui.until_8bd2f89a43", { arg0: String(formatDate(moderationCase.claim_expires_at)) }) : ""}
            </Badge>
          ) : null}
        </div>
      </div>

      {notice ? (
        <p className="rounded-md border px-3 py-2 text-sm" role="status">{notice}</p>
      ) : null}
      {claimedByOther ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{uiText("ui.another_moderator_is_working_on_this_case_yo_cf939b35aa")}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{uiText("ui.reported_revision_10394bae5c")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {detail.evidence ? (
                <>
                  <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm">
                    {snapshotField(detail.evidence.snapshot, "content") ?? uiText("ui.snapshot_has_no_text_1093d52db0")}
                  </p>
                  <p className="text-xs text-muted-foreground">{uiText("ui.revision_e330d85ff9")}{moderationCase.revision_id.slice(0, 8)}{uiText("ui.captured_bedbb68084")}{formatDate(detail.evidence.capturedAt)}{uiText("ui.sha256_d87c031686")}{detail.evidence.sha256.slice(0, 12)}…
                    {snapshotField(detail.evidence.snapshot, uiText("ui.audienceatreport_3ec333a332")) ? uiText("ui.audience_at_report_a08d4e86a3", { arg0: String(snapshotField(detail.evidence.snapshot, "audienceAtReport")) }) : ""}
                    {snapshotField(detail.evidence.snapshot, "orphaned") ? uiText("ui.original_content_was_removed_before_the_case_2f3724b8c4") : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{uiText("ui.no_evidence_snapshot_is_attached_to_this_cas_2e8cbf37c1")}</p>
              )}
              {detail.currentContent && detail.currentContent.content !== snapshotField(detail.evidence?.snapshot, "content") ? (
                <div>
                  <p className="text-xs font-semibold">{uiText("ui.current_content_differs_from_the_reported_re_1d2aac1663")}</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-xl border p-3 text-sm">{detail.currentContent.content}</p>
                </div>
              ) : null}
              {detail.currentContent ? (
                <p className="text-xs text-muted-foreground">{uiText("ui.current_status_5c93d6b7e3")}{detail.currentContent.status} / {detail.currentContent.moderation_status}
                  {detail.currentContent.audience ? uiText("ui.audience_2c66012bba", { arg0: String(detail.currentContent.audience) }) : ""}
                </p>
              ) : null}
              {detail.media.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {detail.media.map((media) => (
                    <div key={media.id} className="space-y-1">
                      {moderationCase.legal_hold && !canLegalHold ? (
                        <div className="flex aspect-square items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">{uiText("ui.locked_14493f5f54")}</div>
                      ) : media.media_type === "video" ? (
                        <video src={`/api/moderation/media/${media.id}`} controls preload="metadata" className="aspect-square w-full rounded-lg border bg-black object-contain" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/moderation/media/${media.id}`} alt={uiText("ui.evidence_media_7161042fef")} className="aspect-square w-full rounded-lg border object-cover" />
                      )}
                      <p className="text-[11px] text-muted-foreground">{media.moderation_status.replaceAll("_", " ")}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{uiText("ui.reports_b807b0beed")}{detail.reports.length})</CardTitle></CardHeader>
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
                      ? uiText("ui.reporter_7f8c2e8626", { arg0: String(report.reporter ? `@${report.reporter.username ?? report.reporter.display_name}` : uiText("ui.deleted_account_94e802c636")) })
                      : uiText("ui.reporter_identity_restricted_b918cb0819")}
                  </p>
                </div>
              ))}
              {detail.appeals.map((appeal) => (
                <div key={appeal.id} className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                  <p className="font-medium">{uiText("ui.appeal_e44f7f8c1a")}{appeal.status}</p>
                  <p className="mt-1 whitespace-pre-wrap">{appeal.statement}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{uiText("ui.timeline_9dcff98e27")}</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {detail.events.map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-muted-foreground">{formatDate(event.created_at)}</span>
                    <span className="font-medium">{event.event_type.replaceAll("_", " ")}</span>
                    <span className="text-muted-foreground">
                      {event.actor_type}{event.actor ? uiText("ui.text_7d049489b9", { arg0: String(event.actor.username ?? event.actor.display_name) }) : ""}
                      {event.previous_status && event.previous_status !== event.next_status ? uiText("ui.text_7c1ffaf5f1", { arg0: String(event.previous_status), arg1: String(event.next_status) }) : ""}
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
            <CardHeader><CardTitle className="text-base">{uiText("ui.work_on_this_case_226611bb3c")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isOpen && canDecide ? (
                <div className="flex flex-wrap gap-2">
                  {!isMine || !detail.claimLive ? (
                    <form action={claimModerationCase}>
                      <input type="hidden" name="case_id" value={moderationCase.id} />
                      <Button size="sm" variant="outline" type="submit" disabled={claimedByOther}>
                        {detail.claimLive && isMine ? uiText("ui.renew_claim_9d8c9d34ea") : uiText("ui.claim_15_min_56e5e13cdc")}
                      </Button>
                    </form>
                  ) : (
                    <>
                      <form action={claimModerationCase}>
                        <input type="hidden" name="case_id" value={moderationCase.id} />
                        <Button size="sm" variant="outline" type="submit">{uiText("ui.renew_claim_9d8c9d34ea")}</Button>
                      </form>
                      <form action={releaseModerationCase}>
                        <input type="hidden" name="case_id" value={moderationCase.id} />
                        <Button size="sm" variant="ghost" type="submit">{uiText("ui.release_e020e3c67b")}</Button>
                      </form>
                    </>
                  )}
                </div>
              ) : null}

              {decisionLocked ? (
                <p className="text-sm text-muted-foreground">
                  {!isOpen
                    ? uiText("ui.this_case_is_closed_8c5aa5543b")
                    : claimedByOther
                      ? uiText("ui.decisions_are_blocked_while_another_moderato_3fcc0296c3")
                      : !canDecide
                        ? uiText("ui.you_can_read_this_case_but_do_not_hold_conte_1e55c8d142")
                        : uiText("ui.escalated_cases_can_only_be_decided_by_a_leg_a7e8b81444")}
                </p>
              ) : (
                <form action={decideModerationCase} className="space-y-3">
                  <input type="hidden" name="case_id" value={moderationCase.id} />
                  {/* Compare-and-swap token: a stale value is refused server-side. */}
                  <input type="hidden" name="decision_version" value={moderationCase.decision_version} />
                  <label className="block text-xs font-semibold">{uiText("ui.policy_category_required_to_remove_8903784ec6")}<select name="policy_category" defaultValue="" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                      <option value="">{uiText("ui.choose_a_category_42d2f266df")}</option>
                      {REPORT_REASON_CODES.map((code) => (
                        <option key={code} value={code}>{REPORT_REASON_LABELS[code]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold">{uiText("ui.rationale_required_to_remove_or_escalate_rec_2fefeb759f")}<Textarea name="rationale" rows={3} maxLength={2000} className="mt-1" />
                  </label>
                  {canEnforce ? (
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <label className="block text-xs font-semibold">{uiText("ui.account_action_ff17cf80c5")}<select name="enforcement" defaultValue="none" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                          <option value="none">{uiText("ui.none_dc937b5989")}</option>
                          <option value="warning">{uiText("ui.warning_e981ddae45")}</option>
                          <option value="posting_hold">{uiText("ui.posting_hold_6b0a7c88de")}</option>
                          <option value="media_hold">{uiText("ui.media_hold_cba8a08d4e")}</option>
                          <option value="reporting_hold">{uiText("ui.reporting_hold_51cf9215d8")}</option>
                          <option value="suspension">{uiText("ui.temporary_suspension_3495d45354")}</option>
                          <option value="ban">{uiText("ui.ban_520ed297c9")}</option>
                        </select>
                      </label>
                      <label className="block text-xs font-semibold">{uiText("ui.days_e08c0aa8f5")}<input name="enforcement_days" type="number" min={1} max={365} defaultValue={7} className="mt-1 h-10 w-20 rounded-md border bg-background px-3 text-sm" />
                      </label>
                    </div>
                  ) : (
                    <>
                      <input type="hidden" name="enforcement" value="none" />
                      <p className="text-xs text-muted-foreground">{uiText("ui.account_enforcement_requires_the_account_enf_fd6ae5808e")}</p>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" name="decision" value="restore">
                      {moderationCase.entity_type === "community_comment" ? uiText("ui.restore_comment_e325fc4f1b") : uiText("ui.restore_post_94c7ed6ee4")}
                    </Button>
                    <Button size="sm" variant="destructive" name="decision" value="remove">{uiText("ui.remove_from_community_5d8bf03e74")}</Button>
                    {canLegalHold && moderationCase.state !== "escalated" ? (
                      <Button size="sm" variant="outline" name="decision" value="escalate">{uiText("ui.preserve_and_escalate_2cb637d93c")}</Button>
                    ) : null}
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{uiText("ui.author_d95082a2ee")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{detail.author ? uiText("ui.text_d513a96df3", { arg0: String(detail.author.username ?? detail.author.display_name) }) : uiText("ui.account_unavailable_7283040535")}</p>
              <p className="text-xs text-muted-foreground">
                {detail.authorHistory.priorCases.length}{uiText("ui.other_case_7f0ecd05dd")}{detail.authorHistory.priorCases.length === 1 ? "" : uiText("ui.s_043a718774")} ·{" "}
                {detail.authorHistory.priorCases.filter((entry) => entry.resolution === "violation_removed").length}{uiText("ui.confirmed_violation_s_c2378f94b2")}</p>
              {detail.authorHistory.enforcement.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {detail.authorHistory.enforcement.map((action) => (
                    <li key={action.id}>
                      {action.action_type.replaceAll("_", " ")} · {formatDate(action.starts_at)}
                      {action.ends_at ? uiText("ui.text_c7f0cd3f5c", { arg0: String(formatDate(action.ends_at)) }) : ""}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">{uiText("ui.no_enforcement_history_1b857ec45a")}</p>}
              {detail.priorRevisionCases.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {detail.priorRevisionCases.length}{uiText("ui.earlier_case_s_on_this_content_312e5b0c92")}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{uiText("ui.internal_notes_d8ecfc0765")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {detail.notes.length === 0 ? <p className="text-xs text-muted-foreground">{uiText("ui.no_notes_yet_57bde4deb2")}</p> : null}
              {detail.notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{note.note}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {note.author ? uiText("ui.text_d513a96df3", { arg0: String(note.author.username ?? note.author.display_name) }) : uiText("ui.moderator_cfde2ca518")} · {formatDate(note.created_at)}
                  </p>
                </div>
              ))}
              <form action={addModerationCaseNote} className="space-y-2">
                <input type="hidden" name="case_id" value={moderationCase.id} />
                <Textarea name="note" rows={2} maxLength={2000} placeholder={uiText("ui.add_an_internal_note_append_only_223f241f65")} required />
                <Button size="sm" variant="outline" type="submit">{uiText("ui.add_note_63565c0485")}</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
