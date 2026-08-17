"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { decodeVinDetails } from "@/lib/vehicles/vin-decoder";
import { formatVin } from "@/lib/utils/vin";
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

const readinessMonitorSchema = z.object({
  name: z.string().trim().min(1).max(64),
  isContinuous: z.boolean(),
  supported: z.boolean(),
  complete: z.boolean(),
});

const snapshotSchema = z.object({
  vin: z.string().trim().min(1).max(32).nullable().optional(),
  supportedPids: z.array(z.number().int().min(0).max(255)).default([]),
  monitorStatus: monitorStatusSchema.nullable().optional(),
  storedDTCs: z.array(z.string().trim().min(1).max(12)).default([]),
  pendingDTCs: z.array(z.string().trim().min(1).max(12)).default([]),
  // Mode 0A — survives a battery disconnect, unlike stored and pending codes.
  permanentDTCs: z.array(z.string().trim().min(1).max(12)).default([]),
  // Decoded emissions monitors from the Mode 01 PID 01 status bytes.
  readinessMonitors: z.array(readinessMonitorSchema).max(32).default([]),
  liveReadings: z.array(liveReadingSchema).default([]),
  adapterName: z.string().trim().max(120).nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  rawSupportedPidsResponse: z.string().max(12000).nullable().optional(),
  rawMonitorStatusResponse: z.string().max(12000).nullable().optional(),
  rawVinResponse: z.string().max(12000).nullable().optional(),
  rawStoredDtcsResponse: z.string().max(12000).nullable().optional(),
  rawPendingDtcsResponse: z.string().max(12000).nullable().optional(),
  rawPermanentDtcsResponse: z.string().max(12000).nullable().optional(),
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

async function syncVehicleDetailsFromSnapshot(
  requestId: string,
  snapshotVin: string | null | undefined,
): Promise<void> {
  const normalizedVin = snapshotVin ? formatVin(snapshotVin) : "";
  if (!normalizedVin) return;

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("ppi_requests")
    .select("vehicle_id")
    .eq("id", requestId)
    .single();

  if (!request?.vehicle_id) return;

  const { data: vehicle } = await admin
    .from("vehicles")
    .select("id, vin, year, make, model, trim")
    .eq("id", request.vehicle_id)
    .single();

  if (!vehicle) return;

  const existingVin = vehicle.vin ? formatVin(vehicle.vin) : "";
  if (existingVin && existingVin !== normalizedVin) {
    return;
  }

  const updates: Database["public"]["Tables"]["vehicles"]["Update"] = {};

  if (!existingVin) {
    updates.vin = normalizedVin;
  }

  const needsDecodedFields =
    vehicle.year == null ||
    !vehicle.make?.trim() ||
    !vehicle.model?.trim() ||
    !vehicle.trim?.trim();

  if (needsDecodedFields) {
    try {
      const decoded = await decodeVinDetails(normalizedVin, vehicle.year);
      if (decoded) {
        if (vehicle.year == null && decoded.year != null) {
          updates.year = decoded.year;
        }
        if (!vehicle.make?.trim() && decoded.make) {
          updates.make = decoded.make;
        }
        if (!vehicle.model?.trim() && decoded.model) {
          updates.model = decoded.model;
        }
        if (!vehicle.trim?.trim() && decoded.trim) {
          updates.trim = decoded.trim;
        }
      }
    } catch (error) {
      console.error("[obd] VIN decode sync failed", {
        requestId,
        vehicleId: vehicle.id,
        vin: normalizedVin,
        error,
      });
    }
  }

  if (Object.keys(updates).length === 0) return;

  const { error } = await admin
    .from("vehicles")
    .update(updates)
    .eq("id", vehicle.id);

  if (error) {
    console.error("[obd] Vehicle sync failed", {
      requestId,
      vehicleId: vehicle.id,
      vin: normalizedVin,
      error: error.message,
    });
  }
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
      permanent_dtcs: snapshot.permanentDTCs,
      readiness_monitors: jsonValue(snapshot.readinessMonitors),
      // Counted once on write so a report or queue can flag "not test-ready"
      // without unpacking the jsonb.
      incomplete_monitor_count: snapshot.readinessMonitors.filter(
        (monitor) => monitor.supported && !monitor.complete,
      ).length,
      raw_permanent_dtcs_response: snapshot.rawPermanentDtcsResponse ?? null,
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

  await syncVehicleDetailsFromSnapshot(submission.ppi_request_id, snapshot.vin);

  revalidatePath(`/dashboard/ppi/${submission.ppi_request_id}`);
  revalidatePath(`/tech/ppi/${submission.ppi_request_id}`);
  revalidatePath("/dashboard/vehicles");

  return { data: normalizeRow(data) };
}
