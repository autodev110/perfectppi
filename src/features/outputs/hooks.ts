"use client";

import { useState, useEffect, useCallback } from "react";
import type { StandardizedOutputResponse, VscOutputResponse } from "@/types/api";

export function useOutputs(submissionId: string | null) {
  const [standardized, setStandardized] =
    useState<StandardizedOutputResponse | null>(null);
  const [vsc, setVsc] = useState<VscOutputResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOutputs = useCallback(async () => {
    if (!submissionId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [stdRes, vscRes] = await Promise.all([
        fetch(`/api/ppi/outputs/${submissionId}/standardized`),
        fetch(`/api/ppi/outputs/${submissionId}/vsc`),
      ]);

      if (stdRes.ok) {
        const stdData = await stdRes.json();
        setStandardized(stdData.data);
      } else {
        setStandardized(null);
      }

      if (vscRes.ok) {
        const vscData = await vscRes.json();
        setVsc(vscData.data);
      } else {
        setVsc(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch outputs");
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    fetchOutputs();
  }, [fetchOutputs]);

  return { standardized, vsc, loading, error, refetch: fetchOutputs };
}

/**
 * Drives report generation from the UI.
 *
 * `generate` retries the *pending* version — that is what the "still
 * generating" and "failed" states need, and it is why this hook does not call
 * /outputs/regenerate: forcing a new version while version 1 is still in flight
 * would produce two jobs, two versions, and two artifact sets for one
 * inspection.
 *
 * `regenerate` is the deliberate "produce a fresh version of a report I can
 * already see" action, and belongs only on screens where an output exists.
 *
 * Both now enqueue and return; the queue does the work, so `complete` means
 * "accepted", not "finished". The caller keeps polling for the output itself.
 */
export function useOutputGeneration(submissionId: string | null) {
  const [status, setStatus] = useState<
    "idle" | "generating" | "complete" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    async (path: string) => {
      if (!submissionId) return;

      setStatus("generating");
      setError(null);

      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Generation failed");
        }

        setStatus("complete");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed");
        setStatus("error");
      }
    },
    [submissionId],
  );

  const generate = useCallback(
    () => request("/api/ppi/outputs/retry"),
    [request],
  );

  const regenerate = useCallback(
    () => request("/api/ppi/outputs/regenerate"),
    [request],
  );

  return { status, error, generate, regenerate };
}
