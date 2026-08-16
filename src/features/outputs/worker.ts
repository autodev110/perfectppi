import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  OUTPUT_JOB_LEASE_SECONDS,
  backoffDelayMs,
} from "@/features/partner/constants";
import { setIntegrationStatus } from "@/features/partner/events";
import { OutputJobError, runOutputGenerationJob } from "./pipeline";
import type { Json } from "@/types/database";

// ============================================================================
// Output generation worker.
//
// Jobs are claimed atomically with FOR UPDATE SKIP LOCKED and held under a
// lease, so several workers (the cron tick and the post-submit kick) can run at
// once, and a worker that dies mid-flight releases its job when the lease
// expires rather than wedging it forever.
// ============================================================================

export interface WorkerTickResult {
  claimed: number;
  completed: number;
  failed: number;
  retrying: number;
  /** Submissions that had no job at all and were enqueued by the sweep. */
  reconciled: number;
  jobs: Array<{
    jobId: string;
    submissionId: string;
    outputVersion: number;
    outcome: "completed" | "retrying" | "failed";
    error?: string;
  }>;
}

export async function runOutputWorkerTick(options?: {
  limit?: number;
  workerId?: string;
}): Promise<WorkerTickResult> {
  const admin = createAdminClient();
  const workerId = options?.workerId ?? `worker-${randomUUID().slice(0, 8)}`;

  // Recover submissions whose enqueue never landed. Failing this must not stop
  // the tick — the queue that already exists is the more important work.
  let reconciled = 0;
  const { data: swept, error: sweepError } = await admin.rpc(
    "reconcile_output_generation_jobs",
    { p_limit: 20 },
  );
  if (sweepError) {
    console.error("outputs: reconciliation sweep failed", sweepError.message);
  } else {
    reconciled = swept ?? 0;
    if (reconciled > 0) {
      console.warn(`outputs: reconciliation enqueued ${reconciled} orphaned submission(s)`);
    }
  }

  const { data: claimed, error } = await admin.rpc("claim_output_generation_jobs", {
    p_worker_id: workerId,
    p_limit: options?.limit ?? 3,
    p_lease_seconds: OUTPUT_JOB_LEASE_SECONDS,
  });

  if (error) {
    console.error("outputs: claim failed", error.message);
    throw new Error(`Failed to claim output jobs: ${error.message}`);
  }

  const jobs = claimed ?? [];
  const result: WorkerTickResult = {
    claimed: jobs.length,
    completed: 0,
    failed: 0,
    retrying: 0,
    reconciled,
    jobs: [],
  };

  for (const job of jobs) {
    try {
      await setIntegrationStatusForSubmission(job.ppi_submission_id, "outputs_generating");

      await runOutputGenerationJob({
        submissionId: job.ppi_submission_id,
        outputVersion: job.output_version,
      });

      await admin
        .from("output_generation_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          last_error: null,
          locked_at: null,
          lock_expires_at: null,
          locked_by: null,
        })
        .eq("id", job.id);

      result.completed += 1;
      result.jobs.push({
        jobId: job.id,
        submissionId: job.ppi_submission_id,
        outputVersion: job.output_version,
        outcome: "completed",
      });
    } catch (rawError) {
      const jobError =
        rawError instanceof OutputJobError
          ? rawError
          : new OutputJobError("database", String(rawError));

      // attempt_count was already incremented by the claim.
      const exhausted = jobError.permanent || job.attempt_count >= job.max_attempts;
      const nextAttemptAt = new Date(
        Date.now() + backoffDelayMs(job.attempt_count),
      ).toISOString();

      await admin
        .from("output_generation_jobs")
        .update({
          status: exhausted ? "failed" : "pending",
          next_attempt_at: exhausted ? job.next_attempt_at : nextAttemptAt,
          last_error: {
            category: jobError.category,
            message: jobError.message,
            permanent: jobError.permanent,
            attempt: job.attempt_count,
            at: new Date().toISOString(),
          } as unknown as Json,
          locked_at: null,
          lock_expires_at: null,
          locked_by: null,
        })
        .eq("id", job.id);

      if (exhausted) {
        await setIntegrationStatusForSubmission(job.ppi_submission_id, "outputs_failed");
        result.failed += 1;
      } else {
        result.retrying += 1;
      }

      console.error(
        `outputs: job ${job.id} attempt ${job.attempt_count} failed (${jobError.category})`,
        jobError.message,
      );

      result.jobs.push({
        jobId: job.id,
        submissionId: job.ppi_submission_id,
        outputVersion: job.output_version,
        outcome: exhausted ? "failed" : "retrying",
        error: jobError.message,
      });
    }
  }

  return result;
}

async function setIntegrationStatusForSubmission(
  submissionId: string,
  status: "outputs_generating" | "outputs_failed",
): Promise<void> {
  const admin = createAdminClient();
  const { data: submission } = await admin
    .from("ppi_submissions")
    .select("ppi_request_id")
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission) return;

  await setIntegrationStatus(
    submission.ppi_request_id,
    status,
    status === "outputs_generating"
      ? { event: "inspection.outputs_generating" }
      : undefined,
  );
}

/**
 * Enqueue-and-nudge, used right after a submission lands.
 *
 * The enqueue is the durable part; the immediate tick is only an optimisation
 * so the technician does not wait for the next cron. If this process is killed
 * before the tick finishes, the job is still sitting in the queue with its
 * lease expired, and the cron picks it up.
 */
export async function enqueueOutputGeneration(params: {
  submissionId: string;
  trigger?: "submission" | "manual_retry" | "manual_regeneration";
  requestedBy?: string | null;
  forceNewVersion?: boolean;
}): Promise<{ jobId: string; outputVersion: number } | { error: string }> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("enqueue_output_generation_job", {
    p_submission_id: params.submissionId,
    p_trigger_reason: params.trigger ?? "submission",
    p_requested_by: params.requestedBy ?? undefined,
    p_force_new_version: params.forceNewVersion ?? false,
  });

  if (error) {
    console.error("outputs: enqueue failed", error.message);
    return { error: error.message };
  }

  const job = Array.isArray(data) ? data[0] : data;
  if (!job) return { error: "Failed to enqueue output generation" };

  return { jobId: job.id, outputVersion: job.output_version };
}
