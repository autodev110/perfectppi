"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";
import type {
  ObdDiagnosticSnapshotPayload,
  ObdExchange,
  ObdLiveReading,
  ObdSnapshotResponse,
} from "@/types/api";

type ObdSnapshotRow = Database["public"]["Tables"]["obd_snapshots"]["Row"];

const monitorStatusSchema = z.object({
  milOn: z.boolean(),
  storedDTCCount: z.number().int().min(0),
  rawStatusBytes: z.array(z.number().int().min(0).max(255)),
});

const liveReadingSchema = z.object({
  pid: z.number().int().min(0).max(255),
  name: z.string().min(1).max(120),
  value: z.number(),
  unit: z.string().max(32),
  rawResponse: z.string().max(4000),
});

const snapshotSchema = z.object({
  vin: z.string().trim().min(1).max(32).nullable().optional(),
  supportedPids: z.array(z.number().int().min(0).max(255)).default([]),
  monitorStatus: monitorStatusSchema.nullable().optional(),
  storedDTCs: z.array(z.string().trim().min(1).max(12)).default([]),
  pendingDTCs: z.array(z.string().trim().min(1).max(12)).default([]),
  liveReadings: z.array(liveReadingSchema).default([]),
  adapterName: z.string().trim().max(120).nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  rawSupportedPidsResponse: z.string().max(12000).nullable().optional(),
  rawMonitorStatusResponse: z.string().max(12000).nullable().optional(),
  rawVinResponse: z.string().max(12000).nullable().optional(),
  rawStoredDtcsResponse: z.string().max(12000).nullable().optional(),
  rawPendingDtcsResponse: z.string().max(12000).nullable().optional(),
});

const exchangeSchema = z.object({
  id: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  command: z.string().min(1).max(64),
  rawResponse: z.string().max(12000),
});

const saveObdSnapshotSchema = z.object({
  snapshot: snapshotSchema,
  transcript: z.array(exchangeSchema).default([]),
});

async function getAuthProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  return profile ? { ...profile, supabase } : null;
}

function jsonValue<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function pidToHex(pid: number): string {
  return `0x${pid.toString(16).toUpperCase().padStart(2, "0")}`;
}

function normalizeRow(row: ObdSnapshotRow): ObdSnapshotResponse {
  return {
    ...row,
    live_readings: row.live_readings as unknown as ObdLiveReading[],
    raw_payload: row.raw_payload as unknown as ObdDiagnosticSnapshotPayload,
    raw_transcript: row.raw_transcript as unknown as ObdExchange[],
    monitor_status: row.monitor_status as Record<string, unknown> | null,
  };
}

export async function listObdSnapshots(
  submissionId: string,
  options: { currentOnly?: boolean } = {},
): Promise<ObdSnapshotResponse[]> {
  const supabase = await createClient();
  let query = supabase
    .from("obd_snapshots")
    .select("*")
    .eq("ppi_submission_id", submissionId)
    .order("created_at", { ascending: false });

  if (options.currentOnly) {
    query = query.eq("is_current", true).limit(1);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(normalizeRow);
}

export async function saveObdSnapshot(
  submissionId: string,
  payload: unknown,
): Promise<{ data: ObdSnapshotResponse } | { error: string }> {
  const parsed = saveObdSnapshotSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid OBD snapshot" };
  }

  const ctx = await getAuthProfile();
  if (!ctx) return { error: "Not authenticated" };
  const { supabase, id: profileId } = ctx;

  const { data: submission, error: submissionError } = await supabase
    .from("ppi_submissions")
    .select("id, ppi_request_id, performer_id, status")
    .eq("id", submissionId)
    .single();

  if (submissionError || !submission) {
    return { error: "Submission not found" };
  }
  if (submission.performer_id !== profileId) {
    return { error: "Only the inspection performer can save OBD diagnostics" };
  }
  if (submission.status !== "draft" && submission.status !== "in_progress") {
    return { error: "OBD diagnostics can only be saved before submission" };
  }

  const { snapshot, transcript } = parsed.data;
  const monitor = snapshot.monitorStatus ?? null;

  const { error: updateError } = await supabase
    .from("obd_snapshots")
    .update({ is_current: false })
    .eq("ppi_submission_id", submissionId)
    .eq("is_current", true);

  if (updateError) return { error: updateError.message };

  const { data, error } = await supabase
    .from("obd_snapshots")
    .insert({
      ppi_submission_id: submissionId,
      captured_by: profileId,
      vin: snapshot.vin?.trim().toUpperCase() ?? null,
      adapter_name: snapshot.adapterName ?? null,
      mil_on: monitor?.milOn ?? null,
      stored_dtc_count: monitor?.storedDTCCount ?? null,
      stored_dtcs: snapshot.storedDTCs,
      pending_dtcs: snapshot.pendingDTCs,
      supported_pids: snapshot.supportedPids.map(pidToHex),
      monitor_status: monitor ? jsonValue(monitor) : null,
      live_readings: jsonValue(snapshot.liveReadings),
      raw_payload: jsonValue(snapshot),
      raw_transcript: jsonValue(transcript),
      started_at: snapshot.startedAt ?? null,
      completed_at: snapshot.completedAt ?? null,
      is_current: true,
    })
    .select()
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to save OBD diagnostics" };
  }

  revalidatePath(`/dashboard/ppi/${submission.ppi_request_id}`);
  revalidatePath(`/tech/ppi/${submission.ppi_request_id}`);

  return { data: normalizeRow(data) };
}
