import { createAdminClient } from "@/lib/supabase/admin";
import { deleteStoredObject } from "@/lib/storage/r2";

export async function deleteStoredObjectOrQueue(
  storageReference: string,
  reason: string,
) {
  try {
    await deleteStoredObject(storageReference);
  } catch (error) {
    const { error: queueError } = await createAdminClient()
      .from("storage_cleanup_jobs")
      .upsert({
        storage_reference: storageReference,
        reason,
        status: "pending",
        last_error: error instanceof Error ? error.message.slice(0, 1000) : "Storage deletion failed",
        next_attempt_at: new Date().toISOString(),
        completed_at: null,
      }, { onConflict: "storage_reference" });

    if (queueError) {
      console.error("Failed to queue storage cleanup", queueError.message);
    }
  }
}

export async function runStorageCleanup(limit = 50) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: expiredAssemblies, error: assemblyError } = await admin
    .rpc("expire_community_post_assemblies", { p_limit: limit });
  if (assemblyError) throw new Error(assemblyError.message);
  const { data: expired, error: expiredError } = await admin
    .from("community_upload_reservations")
    .update({ status: "expired" })
    .eq("status", "issued")
    .lte("expires_at", now)
    .select("storage_reference");
  if (expiredError) throw new Error(expiredError.message);

  if (expired?.length) {
    const { error } = await admin.from("storage_cleanup_jobs").upsert(
      expired.map((entry) => ({
        storage_reference: entry.storage_reference,
        reason: "expired_upload_reservation",
        status: "pending",
        next_attempt_at: now,
      })),
      { onConflict: "storage_reference" },
    );
    if (error) throw new Error(error.message);
  }

  const { data: jobs, error: jobsError } = await admin
    .from("storage_cleanup_jobs")
    .select("id, storage_reference, attempt_count")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (jobsError) throw new Error(jobsError.message);

  let completed = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    try {
      await deleteStoredObject(job.storage_reference);
      const { error } = await admin.from("storage_cleanup_jobs").update({
        status: "completed",
        attempt_count: job.attempt_count + 1,
        last_error: null,
        completed_at: new Date().toISOString(),
      }).eq("id", job.id);
      if (error) throw new Error(error.message);
      completed += 1;
    } catch (error) {
      const attempts = job.attempt_count + 1;
      await admin.from("storage_cleanup_jobs").update({
        status: "failed",
        attempt_count: attempts,
        last_error: error instanceof Error ? error.message.slice(0, 1000) : "Storage deletion failed",
        next_attempt_at: new Date(Date.now() + Math.min(24 * 60, 2 ** attempts) * 60_000).toISOString(),
      }).eq("id", job.id);
      failed += 1;
    }
  }

  return {
    expired: expired?.length ?? 0,
    expiredAssemblies: expiredAssemblies ?? 0,
    completed,
    failed,
  };
}
