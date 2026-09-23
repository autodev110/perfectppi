"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  checkHeldReportEdits,
  releaseHeldReport,
  type ReviewCheckResult,
} from "@/features/outputs/report-review-actions";
import type { ReviewEdits } from "@/features/ppi/report-review";
import { useTranslator } from "@/lib/i18n/client";

export interface ReferenceFinding {
  ref: string;
  title: string;
  action: "urgent" | "service_recommended" | "monitor" | "none";
  observation: string;
  nextStep: string;
  where: string;
}

const ACTION_BADGE: Record<ReferenceFinding["action"], "destructive" | "default" | "secondary" | "outline"> = {
  urgent: "destructive",
  service_recommended: "default",
  monitor: "secondary",
  none: "outline",
};

export function HeldReportEditor({
  outputId,
  token,
  draft: initialDraft,
  overflowing,
  urgentRefs,
  findings,
  blockTitles,
  limits,
  attestation,
}: {
  outputId: string;
  /** The held state this page was opened from; release refuses a newer one. */
  token: string;
  draft: ReviewEdits;
  overflowing: string[];
  urgentRefs: string[];
  findings: ReferenceFinding[];
  blockTitles: Record<string, string>;
  limits: { priority_actions: number; observation: number; next_step: number; scope_and_evidence: number };
  attestation: string;
}) {
  const uiText = useTranslator();
  const [draft, setDraft] = useState<ReviewEdits>(initialDraft);
  const [check, setCheck] = useState<{ result: ReviewCheckResult; draftKey: string } | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState<"check" | "release" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [released, setReleased] = useState<{ requeued: boolean } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const draftKey = useMemo(() => JSON.stringify(draft), [draft]);
  const current = check && check.draftKey === draftKey ? check.result : null;
  const passed = Boolean(current && current.issues.length === 0 && Object.values(current.fits).every(Boolean) && current.previewPdf);

  useEffect(() => {
    if (!current?.previewPdf) {
      setPreviewUrl(null);
      return;
    }
    const bytes = Uint8Array.from(atob(current.previewPdf), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [current?.previewPdf]);

  async function runCheck() {
    setBusy("check");
    setError(null);
    const result = await checkHeldReportEdits(outputId, token, draft);
    if (result.ok) setCheck({ result: result.data, draftKey });
    else setError(result.error);
    setBusy(null);
  }

  async function release() {
    setBusy("release");
    setError(null);
    const result = await releaseHeldReport(outputId, token, draft, attested);
    if (result.ok) setReleased(result.data);
    else setError(result.error);
    setBusy(null);
  }

  function regionState(region: string) {
    if (!current) return overflowing.includes(region) ? "overflow" : "unknown";
    if (current.fits[region] === false || current.issues.some((issue) => issue.region === region)) return "problem";
    return "ok";
  }

  function regionBadge(region: string) {
    const state = regionState(region);
    if (state === "ok") return <Badge variant="secondary">{uiText("ui.fits_71d396e03e")}</Badge>;
    if (state === "problem") return <Badge variant="destructive">{uiText("ui.needs_changes_17fa92a7f7")}</Badge>;
    if (state === "overflow") return <Badge variant="destructive">{uiText("ui.does_not_fit_387d5c4ebd")}</Badge>;
    return null;
  }

  function counter(text: string, max: number) {
    const length = text.replace(/\s+/g, " ").trim().length;
    return <span className={cn("text-xs tabular-nums", length > max ? "text-destructive" : "text-muted-foreground")}>{length}/{max}</span>;
  }

  if (released) {
    return (
      <div className="space-y-3 rounded-lg border border-emerald-600/30 bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30">
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />{uiText("ui.report_released_569d6ec06f")}</p>
        <p className="text-muted-foreground">
          {released.requeued
            ? uiText("ui.the_same_output_version_is_generating_its_fi_fa469fa4ed")
            : uiText("ui.downloads_now_render_the_released_text_no_ge_ef035a8a0c")}
        </p>
        <Link href="/admin/outputs" className="font-medium text-primary">{uiText("ui.back_to_outputs_f757f0fa80")}</Link>
      </div>
    );
  }

  const urgent = findings.filter((finding) => finding.action === "urgent");
  const others = findings.filter((finding) => finding.action !== "urgent");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <section className={cn("space-y-2 rounded-lg border p-4", overflowing.includes("priority_actions") && "border-destructive/50")}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{uiText("ui.priority_actions_f02bab134f")}</h2>
            {regionBadge("priority_actions")}
          </div>
          <p className="text-xs text-muted-foreground">{uiText("ui.if_you_change_this_text_cite_every_urgent_fi_b0c3c719a6")}{urgentRefs.length ? `[${urgentRefs.join(", ")}]` : "[T1]"}.
          </p>
          <Textarea
            rows={5}
            value={draft.priority_actions}
            onChange={(event) => setDraft({ ...draft, priority_actions: event.target.value })}
          />
          <div className="flex items-center justify-between gap-2">
            {urgentRefs.length ? (
              <button
                type="button"
                className="text-xs font-medium text-primary"
                onClick={() => setDraft({ ...draft, priority_actions: `${draft.priority_actions.trim()} [${urgentRefs.join(", ")}]` })}
              >{uiText("ui.add_all_urgent_references_38a43f0f7a")}</button>
            ) : <span />}
            {counter(draft.priority_actions, limits.priority_actions)}
          </div>
        </section>

        {draft.overview.map((block, index) => {
          const region = `overview.${block.category}`;
          const update = (field: "observation" | "next_step", value: string) =>
            setDraft({
              ...draft,
              overview: draft.overview.map((entry, position) => (position === index ? { ...entry, [field]: value } : entry)),
            });
          return (
            <section key={block.category} className={cn("space-y-2 rounded-lg border p-4", overflowing.includes(region) && "border-destructive/50")}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{blockTitles[block.category] ?? block.category}</h2>
                {regionBadge(region)}
              </div>
              <label className="block space-y-1">
                <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">{uiText("ui.observation_d239e9cf6a")}{counter(block.observation, limits.observation)}
                </span>
                <Textarea rows={3} value={block.observation} onChange={(event) => update("observation", event.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">{uiText("ui.next_step_298a9207a7")}{counter(block.next_step, limits.next_step)}
                </span>
                <Textarea rows={2} value={block.next_step} onChange={(event) => update("next_step", event.target.value)} />
              </label>
            </section>
          );
        })}

        <section className={cn("space-y-2 rounded-lg border p-4", overflowing.includes("scope_and_evidence") && "border-destructive/50")}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{uiText("ui.inspection_scope_and_evidence_a70b5206a3")}</h2>
            {regionBadge("scope_and_evidence")}
          </div>
          <Textarea
            rows={3}
            value={draft.scope_and_evidence}
            onChange={(event) => setDraft({ ...draft, scope_and_evidence: event.target.value })}
          />
          <div className="flex justify-end">
            {counter(draft.scope_and_evidence, limits.scope_and_evidence)}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={runCheck} disabled={busy !== null}>
              {busy === "check" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{uiText("ui.check_fit_and_rules_da790759fd")}</Button>
            {previewUrl ? (
              // A download, not a new tab: the app's CSP (object-src 'none')
              // is inherited by blob: documents and would block the PDF viewer.
              <a href={previewUrl} download="report-preview.pdf" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                <FileText className="h-4 w-4" />{uiText("ui.download_two_page_preview_67ee824718")}</a>
            ) : null}
            {check && !current ? <span className="text-xs text-muted-foreground">{uiText("ui.the_text_changed_since_the_last_check_fad829dfc0")}</span> : null}
          </div>

          {current ? (
            current.issues.length || current.renderError || !Object.values(current.fits).every(Boolean) ? (
              <ul className="space-y-1 text-sm">
                {current.issues.map((issue, position) => (
                  <li key={position} className="flex gap-2 text-destructive">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    {issue.message}
                  </li>
                ))}
                {Object.entries(current.fits)
                  .filter(([, fits]) => !fits)
                  .map(([region]) => (
                    <li key={region} className="flex gap-2 text-destructive">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      {region === "priority_actions" || region === "scope_and_evidence"
                        ? uiText("ui.still_does_not_fit_48bf6164eb", { arg0: String(region === "priority_actions" ? uiText("ui.priority_actions_f02bab134f") : uiText("ui.scope_and_evidence_120050dc3a")) })
                        : uiText("ui.still_does_not_fit_48bf6164eb", { arg0: String(blockTitles[region.replace("overview.", "")] ?? region) })}
                    </li>
                  ))}
                {current.renderError ? (
                  <li className="flex gap-2 text-destructive">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    {uiText("ui.the_report_still_does_not_render_on_two_page_e9007a15a8", { arg0: String(current.renderError) })}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />{uiText("ui.every_region_fits_and_both_pages_render_chec_d60bdd71b3")}</p>
            )
          ) : null}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={attested}
              onChange={(event) => setAttested(event.target.checked)}
            />
            <span>{attestation}</span>
          </label>

          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

          <Button type="button" onClick={release} disabled={!passed || !attested || busy !== null}>
            {busy === "release" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{uiText("ui.release_report_6e8f9bf806")}</Button>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="space-y-2 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">{uiText("ui.urgent_findings_825e01e822")}{urgent.length})</h2>
          <p className="text-xs text-muted-foreground">{uiText("ui.every_one_must_stay_in_the_summary_8de6882fb0")}</p>
          <FindingList findings={urgent} />
        </section>
        {others.length ? (
          <section className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">{uiText("ui.other_findings_d6cdfc2990")}{others.length})</h2>
            <FindingList findings={others} />
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function FindingList({ findings }: { findings: ReferenceFinding[] }) {
  return (
    <ul className="max-h-[28rem] space-y-2 overflow-y-auto text-xs">
      {findings.map((finding) => (
        <li key={finding.ref} className="space-y-0.5 rounded-md bg-muted/40 p-2">
          <div className="flex items-center gap-1.5">
            <Badge variant={ACTION_BADGE[finding.action]} className="font-mono">{finding.ref}</Badge>
            <span className="font-medium">{finding.title}</span>
          </div>
          {finding.where ? <p className="text-muted-foreground">{finding.where}</p> : null}
          <p>{finding.observation}</p>
          <p className="text-muted-foreground">{finding.nextStep}</p>
        </li>
      ))}
    </ul>
  );
}
