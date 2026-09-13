export const OPERATIONAL_OPERATION_CODES = [
  "storage_put",
  "storage_get",
  "storage_copy",
  "storage_delete",
  "storage_list",
  "storage_public_probe",
] as const;

export type OperationalOperationCode = (typeof OPERATIONAL_OPERATION_CODES)[number];

/**
 * Emits only slow/failure metadata to the deployment log stream. Inputs,
 * outputs, identifiers, URLs, object keys, and exception text are excluded.
 */
export async function observeOperationalOperation<T>(
  operationCode: OperationalOperationCode,
  task: () => Promise<T>,
  slowThresholdMs = 5_000,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await task();
    const durationMs = elapsedMilliseconds(startedAt);
    if (durationMs >= slowThresholdMs) {
      console.warn("operational service event", {
        event: "operation_slow",
        operationCode,
        durationMs,
      });
    }
    return result;
  } catch (error) {
    console.error("operational service event", {
      event: "operation_failed",
      operationCode,
      durationMs: elapsedMilliseconds(startedAt),
    });
    throw error;
  }
}

function elapsedMilliseconds(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
