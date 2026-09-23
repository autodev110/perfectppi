"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCw } from "lucide-react";
import { t as uiText } from "@/lib/i18n";


interface AppendixStatus {
  status: "not_requested" | "queued" | "running" | "ready" | "incomplete" | "retryable_failure" | "failed";
  photo_count_expected: number | null;
  photo_count_rendered: number | null;
  missing_count: number;
  error: string | null;
}

// Main report download plus the optional, separate photo evidence appendix.
// The checkbox starts unchecked; checking it never changes the two-page report.
export function ReportDownloads({ outputId }: { outputId: string }) {
  const [includeAppendix, setIncludeAppendix] = useState(false);
  const [appendix, setAppendix] = useState<AppendixStatus | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/outputs/${outputId}/appendix`, { cache: "no-store" });
      if (!response.ok) return;
      const { data } = await response.json();
      setAppendix(data);
      if (data.status === "queued" || data.status === "running" || data.status === "retryable_failure") {
        pollTimer.current = setTimeout(() => void refresh(), 5_000);
      }
    } catch {
      // Status is advisory; the download button stays available.
    }
  }, [outputId]);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [refresh]);

  async function requestAppendix(retry = false) {
    setRequesting(true);
    setError(null);
    try {
      const response = await fetch(`/api/outputs/${outputId}/appendix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json.error ?? uiText("ui.could_not_request_the_photo_evidence_appendi_660fe6c922"));
        return;
      }
      setAppendix(json.data);
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(() => void refresh(), 3_000);
    } finally {
      setRequesting(false);
    }
  }

  function downloadReport() {
    window.open(`/api/outputs/${outputId}/pdf`, "_blank", "noopener,noreferrer");
    if (includeAppendix && (!appendix || appendix.status === "not_requested")) {
      void requestAppendix();
    }
  }

  const status = appendix?.status ?? "not_requested";
  const inProgress = status === "queued" || status === "running" || status === "retryable_failure";
  const downloadable = status === "ready" || status === "incomplete";

  return (
    <div className="space-y-3 rounded-xl border bg-white p-4">
      <button
        type="button"
        onClick={downloadReport}
        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />{uiText("ui.download_pdf_6183be0883")}</button>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={includeAppendix}
          onChange={(event) => setIncludeAppendix(event.target.checked)}
        />
        <span>
          <span className="font-medium">{uiText("ui.include_photo_evidence_appendix_2f519e7944")}</span>
          <span className="block text-xs text-muted-foreground">{uiText("ui.create_a_separate_pdf_with_all_findings_and__2155933b8e")}</span>
        </span>
      </label>

      {includeAppendix || status !== "not_requested" ? (
        <div className="space-y-2 text-sm">
          {status === "not_requested" ? (
            <button
              type="button"
              onClick={() => void requestAppendix()}
              disabled={requesting}
              className="inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              {requesting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}{uiText("ui.create_photo_evidence_appendix_ca0f7ed5e5")}</button>
          ) : null}
          {inProgress ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />{uiText("ui.preparing_the_photo_evidence_appendix_fb13fda690")}{appendix?.photo_count_expected ? ` (${appendix.photo_count_expected} photos)` : ""}…
            </p>
          ) : null}
          {status === "incomplete" ? (
            <p className="text-amber-700">{uiText("ui.appendix_incomplete_61a59d26b8")}{appendix?.missing_count ?? 0}{uiText("ui.photo_s_unavailable_the_pdf_lists_each_missi_820d45d5d6")}</p>
          ) : null}
          {status === "failed" ? (
            <p className="text-destructive">{uiText("ui.the_appendix_could_not_be_created_e49e86f618")}{appendix?.error ? ` ${appendix.error}` : ""}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {downloadable ? (
              <a
                href={`/api/outputs/${outputId}/appendix?download=1`}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />{uiText("ui.download_photo_evidence_appendix_3950af66a6")}</a>
            ) : null}
            {status === "incomplete" || status === "failed" ? (
              <button
                type="button"
                onClick={() => void requestAppendix(true)}
                disabled={requesting}
                className="inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCw className="mr-1.5 h-3.5 w-3.5" />{uiText("ui.retry_appendix_4c2cad9031")}</button>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
