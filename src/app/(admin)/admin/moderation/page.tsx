import Link from "next/link";
import { requireModerationCapability } from "@/features/moderation/capabilities";
import { reviewModerationItem } from "@/features/moderation/actions";
import { getModerationQueue } from "@/features/moderation/queries";
import {
  QUEUE_TAB_LABELS,
  QUEUE_TABS,
  getModerationQueueCases,
  getModerationQueueFilterOptions,
  MODERATION_CASE_ENTITY_TYPES,
  type ModerationQueueFilters,
  type QueueTab,
} from "@/features/moderation/case-queries";
import { REPORT_REASON_CODES, REPORT_REASON_LABELS } from "@/features/moderation/report-reasons";
import { getModerationOperationsStatus } from "@/features/moderation/outbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils/formatting";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{
  tab?: string; error?: string; reviewed?: string; q?: string; reason?: string;
  entity?: string; group?: string; age?: string; media?: string; repeated?: string;
  enforced?: string; assigned?: string;
}> };

const SCANNER_HELP =
  uiText("ui.the_specialist_image_safeguard_is_on_but_no__f16d2f3942")
  + uiText("ui.photos_are_held_and_cannot_be_approved_until_6d5da9edd2");

const MEDIA_TAB = "media";

export default async function ModerationPage({ searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const { profile, capabilities } = await requireModerationCapability("queue_read");
  const params = await searchParams;
  const tab = (QUEUE_TABS as readonly string[]).includes(params.tab ?? "")
    ? (params.tab as QueueTab)
    : params.tab === MEDIA_TAB ? MEDIA_TAB : "new";
  const filters: ModerationQueueFilters = {
    query: params.q,
    reason: REPORT_REASON_CODES.includes(params.reason as (typeof REPORT_REASON_CODES)[number]) ? params.reason : undefined,
    entityType: MODERATION_CASE_ENTITY_TYPES.includes(params.entity as (typeof MODERATION_CASE_ENTITY_TYPES)[number])
      ? params.entity as (typeof MODERATION_CASE_ENTITY_TYPES)[number]
      : undefined,
    groupId: params.group,
    age: params.age === "over_24h" || params.age === "over_72h" || params.age === "over_7d" ? params.age : undefined,
    media: params.media === "yes" || params.media === "no" ? params.media : undefined,
    repeated: params.repeated === "yes" || params.repeated === "no" ? params.repeated : undefined,
    enforced: params.enforced === "yes" || params.enforced === "no" ? params.enforced : undefined,
    assigneeId: params.assigned,
  };

  // The media queue is loaded for every tab so its count and the scanner
  // warning are visible wherever a moderator lands.
  const [cases, mediaItems, ops, filterOptions] = await Promise.all([
    tab === MEDIA_TAB ? Promise.resolve([]) : getModerationQueueCases(tab as QueueTab, filters),
    getModerationQueue("pending_review"),
    getModerationOperationsStatus(),
    getModerationQueueFilterOptions(),
  ]);
  const heldMedia = mediaItems.filter((item) => item.entity_type === "community_post_media" || item.entity_type === "vehicle_media");
  const scannerMissing = heldMedia.some((item) => item.reason_codes.includes("specialist_scan_not_configured"));
  const opsAlarm = (ops.casesOverdue ?? 0) > 0 || (ops.urgentUnacknowledged ?? 0) > 0
    || (ops.outboxDeadLettered ?? 0) > 0 || (ops.casesOpen ?? 0) > 25 || (ops.casesOver24hShare ?? 0) > 20;
  const canDecide = capabilities.has("content_decide");
  const canEnforce = capabilities.has("account_enforce");
  const canLegalHold = capabilities.has("legal_hold_review");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{uiText("ui.moderation_review_a5456eee7c")}</h1>
          <p className="text-muted-foreground">{uiText("ui.reported_community_content_ordered_by_risk_a_ea4f8a38ec")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[...capabilities].map((capability) => (
            <Badge key={capability} variant="secondary">{capability.replaceAll("_", " ")}</Badge>
          ))}
          <Button size="sm" variant="outline" asChild><Link href="/admin/moderation/access">{uiText("ui.access_ec5ba0abb7")}</Link></Button>
        </div>
      </div>

      {params.error ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{params.error}</p> : null}
      {params.reviewed ? <p className="rounded-xl border border-teal/30 bg-teal/5 p-3 text-sm text-teal">{uiText("ui.decision_recorded_e9ff0ef792")}{params.reviewed.replaceAll("_", " ")}).</p> : null}
      {scannerMissing ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          {SCANNER_HELP} <Link href="/admin/flags" className="font-semibold underline">{uiText("ui.open_flags_53876efe14")}</Link>
        </p>
      ) : null}
      {tab !== MEDIA_TAB && heldMedia.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {heldMedia.length}{uiText("ui.photo_c6d30c8447")}{heldMedia.length === 1 ? "" : uiText("ui.s_043a718774")}{uiText("ui.waiting_in_4b40ff3f92")}<Link href={`/admin/moderation?tab=${MEDIA_TAB}`} className="font-semibold underline">{uiText("ui.media_scans_fa85f2ce14")}</Link>.
        </p>
      ) : null}

      <Card className={opsAlarm ? "border-destructive/40" : undefined}>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 p-4 text-sm">
          <span><strong>{ops.casesOpen ?? 0}</strong>{uiText("ui.open_dee82cf50f")}</span>
          <span className={(ops.casesOverdue ?? 0) > 0 ? "text-destructive" : undefined}><strong>{ops.casesOverdue ?? 0}</strong>{uiText("ui.overdue_c907a3d4b6")}</span>
          <span><strong>{ops.casesDueWithin2h ?? 0}</strong>{uiText("ui.due_within_2h_7430715f34")}</span>
          <span className={(ops.urgentUnacknowledged ?? 0) > 0 ? "text-destructive" : undefined}><strong>{ops.urgentUnacknowledged ?? 0}</strong>{uiText("ui.urgent_unacknowledged_15m_dfc8584d85")}</span>
          <span className={(ops.casesOver24hShare ?? 0) > 20 ? "text-destructive" : undefined}><strong>{ops.casesOver24hShare ?? 0}%</strong>{uiText("ui.older_than_24h_7f5fab2417")}</span>
          <span>{uiText("ui.notifications_4597fd7c8b")}<strong>{ops.outboxPending ?? 0}</strong>{uiText("ui.pending_b7dab51974")}<strong>{ops.outboxProcessing ?? 0}</strong>{uiText("ui.processing_7b647f7beb")}{" "}
            <span className={(ops.outboxDeadLettered ?? 0) > 0 ? "text-destructive" : undefined}><strong>{ops.outboxDeadLettered ?? 0}</strong>{uiText("ui.dead_lettered_d72f8e99d3")}</span>
            {(ops.outboxOldestPendingMinutes ?? 0) > 15 ? uiText("ui.oldest_m_cbf7755fab", { arg0: String(ops.outboxOldestPendingMinutes) }) : ""}
          </span>
          {opsAlarm ? <span className="text-destructive">{uiText("ui.guardrail_exceeded_see_plan_18_5_20_3_e8528c402c")}</span> : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {QUEUE_TABS.map((entry) => (
          <Button key={entry} size="sm" variant={tab === entry ? "default" : "outline"} asChild>
            <Link href={`/admin/moderation?tab=${entry}`}>{QUEUE_TAB_LABELS[entry]}</Link>
          </Button>
        ))}
        <Button size="sm" variant={tab === MEDIA_TAB ? "default" : "outline"} asChild>
          <Link href={`/admin/moderation?tab=${MEDIA_TAB}`}>{uiText("ui.media_scans_fa85f2ce14")}{heldMedia.length > 0 ? uiText("ui.text_f69559cbe8", { arg0: String(heldMedia.length) }) : ""}</Link>
        </Button>
      </div>

      {tab !== MEDIA_TAB ? (
        <form method="get" action="/admin/moderation" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="tab" value={tab} />
          <label className="text-xs font-semibold xl:col-span-2">{uiText("ui.case_id_content_id_or_exact_username_9414ad5408")}<Input name="q" defaultValue={params.q ?? ""} placeholder={uiText("ui.uuid_or_username_529a4dc5c7")} className="mt-1" />
          </label>
          <label className="text-xs font-semibold">{uiText("ui.reason_f81ab834de")}<select name="reason" defaultValue={params.reason ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">{uiText("ui.any_reason_2eb96f9d91")}</option>
              {REPORT_REASON_CODES.map((code) => <option key={code} value={code}>{REPORT_REASON_LABELS[code]}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">{uiText("ui.content_47bd29075f")}<select name="entity" defaultValue={params.entity ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">{uiText("ui.all_content_cd588d55d6")}</option>
              {MODERATION_CASE_ENTITY_TYPES.map((type) => <option key={type} value={type}>{type.replace(/^community_/, "").replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">{uiText("ui.group_34ca0e7660")}<select name="group" defaultValue={params.group ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">{uiText("ui.any_group_e88be32faf")}</option>
              {filterOptions.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">{uiText("ui.age_39b7370f30")}<select name="age" defaultValue={params.age ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">{uiText("ui.any_age_353d9c2d57")}</option><option value="over_24h">{uiText("ui.over_24_hours_6863dc12ac")}</option><option value="over_72h">{uiText("ui.over_72_hours_e875c949e1")}</option><option value="over_7d">{uiText("ui.over_7_days_53db8d195c")}</option>
            </select>
          </label>
          <label className="text-xs font-semibold">{uiText("ui.media_d357175cfe")}<select name="media" defaultValue={params.media ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">{uiText("ui.with_or_without_media_43106d792c")}</option><option value="yes">{uiText("ui.has_media_78819b85a8")}</option><option value="no">{uiText("ui.no_media_0f040516f6")}</option>
            </select>
          </label>
          <label className="text-xs font-semibold">{uiText("ui.repeat_reports_d6bd2182a0")}<select name="repeated" defaultValue={params.repeated ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">{uiText("ui.any_report_count_8fdfcaa4d4")}</option><option value="yes">{uiText("ui.more_than_one_4f7cf60617")}</option><option value="no">{uiText("ui.one_report_01995b204b")}</option>
            </select>
          </label>
          <label className="text-xs font-semibold">{uiText("ui.author_enforcement_075e4909a7")}<select name="enforced" defaultValue={params.enforced ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">{uiText("ui.any_state_224776b255")}</option><option value="yes">{uiText("ui.active_restriction_f1343ea0d3")}</option><option value="no">{uiText("ui.no_active_restriction_09a250538d")}</option>
            </select>
          </label>
          <label className="text-xs font-semibold">{uiText("ui.assigned_moderator_060d107816")}<select name="assigned" defaultValue={params.assigned ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">{uiText("ui.anyone_or_unassigned_886498ae15")}</option>
              {filterOptions.moderators.map((moderator) => <option key={moderator.id} value={moderator.id}>@{moderator.username ?? moderator.display_name ?? uiText("ui.moderator_cfde2ca518")}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2 xl:col-span-3">
            <Button type="submit">{uiText("ui.apply_filters_d80ab19b7e")}</Button>
            <Button variant="outline" asChild><Link href={`/admin/moderation?tab=${tab}`}>{uiText("ui.clear_83b12c2216")}</Link></Button>
          </div>
        </form>
      ) : null}

      {tab !== MEDIA_TAB ? (
        cases.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">{uiText("ui.no_cases_in_this_queue_7eb14ac0cd")}</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {cases.map((entry) => (
              <Link key={entry.id} href={`/admin/moderation/cases/${entry.id}`} className="block">
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {entry.entity_type.replaceAll("_", " ")}{uiText("ui.case_19b6a6c254")}{entry.id.slice(0, 8)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.author ? uiText("ui.text_d513a96df3", { arg0: String(entry.author.username ?? entry.author.display_name ?? "member") }) : uiText("ui.author_unavailable_f950e01011")}
                          {" · "}{uiText("ui.created_d711dfc224")}{formatDate(entry.created_at)}
                          {entry.first_reported_at ? uiText("ui.first_report_450f32ff86", { arg0: String(formatDate(entry.first_reported_at)) }) : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={entry.priority === "urgent" ? "destructive" : entry.priority === "high" ? "default" : "secondary"}>
                          {entry.priority}
                        </Badge>
                        <Badge variant="outline">{entry.state.replaceAll("_", " ")}</Badge>
                        {entry.slaOverdue ? <Badge variant="destructive">{uiText("ui.sla_overdue_a269e8630e")}</Badge> : null}
                        {entry.hasMedia ? <Badge variant="outline">{uiText("ui.media_721c9525ad")}</Badge> : null}
                        {entry.hasAppeal ? <Badge variant="outline">{uiText("ui.appeal_da7e2d4b40")}</Badge> : null}
                        {entry.authorHasActiveEnforcement ? <Badge variant="destructive">{uiText("ui.author_restricted_49ae7942eb")}</Badge> : null}
                        {entry.priorViolations > 0 ? <Badge variant="destructive">{uiText("ui.repeat_2df3c159c2")}{entry.priorViolations})</Badge> : null}
                        {entry.legal_hold ? <Badge variant="destructive">{uiText("ui.legal_hold_45046e8968")}</Badge> : null}
                      </div>
                    </div>
                    {entry.contentPreview ? (
                      <p className="line-clamp-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">{entry.contentPreview}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{entry.reportCount}{uiText("ui.unique_report_19af614eba")}{entry.reportCount === 1 ? "" : uiText("ui.s_043a718774")}</span>
                      <span>{entry.reasonCodes.map((code) => code.replaceAll("_", " ")).join(", ") || uiText("ui.no_reasons_59bef9a826")}</span>
                      <span>{uiText("ui.sla_due_c917405e1e")}{formatDate(entry.sla_due_at)}</span>
                      <span>{uiText("ui.revision_a45bf55284")}{entry.revision_id.slice(0, 8)}{uiText("ui.v_63e470a096")}{entry.decision_version}</span>
                      {entry.group ? <span>{uiText("ui.group_9f1e4c1069")}{entry.group.name}</span> : null}
                      {entry.assignee ? <span>{uiText("ui.assigned_to_9eba1d4649")}{entry.assignee.username ?? entry.assignee.display_name}</span> : null}
                      {entry.resolution ? <span>{entry.resolution.replaceAll("_", " ")}</span> : null}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )
      ) : heldMedia.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{uiText("ui.no_media_awaiting_review_a84f4ddfa6")}</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {heldMedia
            .map((item) => {
              const author = Array.isArray(item.author) ? item.author[0] : item.author;
              return (
                <Card key={item.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{item.entity_type.replaceAll("_", " ")}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {author?.display_name ?? author?.username ?? uiText("ui.perfectppi_user_77df1ce619")} · {formatDate(item.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{item.status.replaceAll("_", " ")}</Badge>
                        <Badge variant={item.risk_level === "critical" ? "destructive" : "secondary"}>{item.risk_level}{uiText("ui.risk_56ce854bc6")}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {item.status === "legal_hold" ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{uiText("ui.preview_is_locked_for_legal_hold_content_fol_ee1c428847")}</div>
                    ) : item.media?.media_type === "video" ? (
                      <video src={`/api/moderation/media/${item.entity_id}`} controls preload="metadata" className="max-h-80 w-full rounded-xl border bg-black object-contain" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/moderation/media/${item.entity_id}`} alt={uiText("ui.moderation_preview_7059fe6f09")} className="max-h-80 rounded-xl border object-contain" />
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{uiText("ui.reasons_486796ed11")}{item.reason_codes.join(", ") || uiText("ui.none_140bedbf9c")}</span>
                      <span>{uiText("ui.provider_e0f3fde9df")}{item.model_provider}</span>
                    </div>
                    {item.reason_codes.includes("specialist_scan_not_configured") ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{uiText("ui.held_because_the_specialist_scanner_is_not_c_2117c59592")}</p>
                    ) : null}
                    {canDecide && !(item.status === "legal_hold" && !canLegalHold) ? (
                      <form action={reviewModerationItem} className="space-y-3 rounded-xl border p-4">
                        <input type="hidden" name="item_id" value={item.id} />
                        <Textarea name="notes" rows={2} maxLength={1000} placeholder={uiText("ui.internal_review_notes_ee66c6b68f")} />
                        {canEnforce ? (
                          <select name="enforcement" defaultValue="none" className="h-10 rounded-md border bg-background px-3 text-sm">
                            <option value="none">{uiText("ui.no_account_action_7da0c8a4c5")}</option>
                            <option value="warning">{uiText("ui.issue_warning_6a1eda5ea5")}</option>
                            <option value="posting_hold">{uiText("ui.7_day_posting_hold_bb15ce8109")}</option>
                            <option value="media_hold">{uiText("ui.7_day_media_hold_b94e837377")}</option>
                            <option value="suspension">{uiText("ui.7_day_suspension_b5521d6541")}</option>
                          </select>
                        ) : <input type="hidden" name="enforcement" value="none" />}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" name="decision" value="approve">{uiText("ui.approve_media_9100903513")}</Button>
                          <Button size="sm" variant="destructive" name="decision" value="reject">{uiText("ui.reject_media_8b2b3589d1")}</Button>
                          {canLegalHold ? <Button size="sm" variant="outline" name="decision" value="legal_hold">{uiText("ui.preserve_and_escalate_2cb637d93c")}</Button> : null}
                        </div>
                      </form>
                    ) : (
                      <p className="text-xs text-muted-foreground">{uiText("ui.you_can_view_this_item_but_do_not_hold_the_c_73af996718")}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{uiText("ui.signed_in_as_d293f00044")}{profile.display_name ?? profile.username ?? uiText("ui.moderator_cfde2ca518")}.</p>
    </div>
  );
}
