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

export function useOutputGeneration(submissionId: string | null) {
  const [status, setStatus] = useState<
    "idle" | "generating" | "complete" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!submissionId) return;

    setStatus("generating");
    setError(null);

    try {
      const res = await fetch("/api/ppi/outputs/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Generation failed");
      }

      setStatus("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStatus("error");
    }
  }, [submissionId]);

  return { status, error, generate };
}
