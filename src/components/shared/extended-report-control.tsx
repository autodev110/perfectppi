"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, Loader2 } from "lucide-react";
import type { ExtendedReportEntityType } from "@/features/moderation/extended-reporting";
import { REPORT_REASON_CODES, REPORT_REASON_LABELS, reportReasonRequiresDetails } from "@/features/moderation/report-reasons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ExtendedReportControl({
  entityType,
  entityId,
  label,
  onReported,
}: {
  entityType: ExtendedReportEntityType;
  entityId: string;
  label: string;
  onReported?: () => void;
}) {
  const router = useRouter();
  const [reasonCode, setReasonCode] = useState<(typeof REPORT_REASON_CODES)[number]>("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/community/reports/extended", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          reasonCode,
          details,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The report was not submitted. Please try again.");
      setReported(true);
      onReported?.();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The report was not submitted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (reported) {
    return <p role="status" className="text-sm font-medium text-emerald-700">Report received. This {label.toLowerCase()} is hidden from your view while it is reviewed.</p>;
  }

  return (
    <details className="relative">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm font-semibold text-destructive hover:bg-destructive/10" aria-label={`Report this ${label.toLowerCase()}`}>
        <Flag className="h-4 w-4" aria-hidden="true" /> Report {label.toLowerCase()}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl border bg-background p-4 shadow-xl">
        <div><p className="font-bold">Report {label.toLowerCase()}</p><p className="mt-1 text-xs text-muted-foreground">The item will be hidden from you and sent to the PerfectPPI team. The author will not be told who reported it.</p></div>
        <label className="block text-xs font-semibold">Reason
          <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as typeof reasonCode)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
            {REPORT_REASON_CODES.map((code) => <option key={code} value={code}>{REPORT_REASON_LABELS[code]}</option>)}
          </select>
        </label>
        <Textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={500} rows={3} placeholder={reportReasonRequiresDetails(reasonCode) ? "Details required (at least 10 characters)" : "Optional details"} />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="button" variant="destructive" size="sm" onClick={submit} disabled={busy || (reportReasonRequiresDetails(reasonCode) && details.trim().length < 10)}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Submitting</> : "Submit report"}
        </Button>
      </div>
    </details>
  );
}
