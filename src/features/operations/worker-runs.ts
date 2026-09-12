import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const OPERATIONAL_WORKER_CODES = [
  "outputs",
  "deliveries",
  "storage_cleanup",
  "community_media_migration",
  "retention_purge",
  "moderation_outbox",
  "marketplace_saved_searches",
] as const;

export type OperationalWorkerCode = (typeof OPERATIONAL_WORKER_CODES)[number];

/**
 * Records only timing and outcome metadata. Worker results and exception text
 * may contain user or provider data, so neither is persisted or sent in alerts.
 */
export async function runTrackedWorker<T>(
  workerCode: OperationalWorkerCode,
  task: () => Promise<T>,
): Promise<T> {
  const admin = createAdminClient();
  const startedAt = Date.now();
  const { data: run, error: startError } = await admin
    .from("operational_worker_runs")
    .insert({ worker_code: workerCode })
    .select("id")
    .single();

  if (startError) {
    console.error("worker run tracking start failed", { workerCode, code: startError.code });
  }

  try {
    const result = await task();
    await finishRun(run?.id, workerCode, startedAt, "succeeded");
    return result;
  } catch (error) {
    await finishRun(run?.id, workerCode, startedAt, "failed");
    await sendFailureAlert(workerCode, run?.id ?? null);
    throw error;
  }
}

async function finishRun(
  runId: string | undefined,
  workerCode: OperationalWorkerCode,
  startedAt: number,
  status: "succeeded" | "failed",
) {
  if (!runId) return;
  const { error } = await createAdminClient()
    .from("operational_worker_runs")
    .update({
      status,
      completed_at: new Date().toISOString(),
      duration_ms: Math.max(0, Date.now() - startedAt),
      error_code: status === "failed" ? "worker_failed" : null,
    })
    .eq("id", runId)
    .eq("status", "running");
  if (error) console.error("worker run tracking completion failed", { workerCode, code: error.code });
}

async function sendFailureAlert(workerCode: OperationalWorkerCode, runId: string | null) {
  const configured = process.env.MODERATION_ALERT_WEBHOOK_URL;
  if (!configured) return;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    console.error("worker failure alert URL is invalid", { workerCode });
    return;
  }
  if (url.protocol !== "https:") {
    console.error("worker failure alert URL must use HTTPS", { workerCode });
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "operational_worker_failed",
        workerCode,
        runId,
        occurredAt: new Date().toISOString(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error("worker failure alert delivery failed", { workerCode, status: response.status });
  } catch {
    console.error("worker failure alert delivery failed", { workerCode });
  }
}
