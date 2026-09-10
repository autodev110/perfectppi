"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_FLAG_CODES, invalidateFeatureFlagCache, resolveFeatureFlagEnvironment } from "@/lib/feature-flags";

const toggleSchema = z.object({
  flagCode: z.enum(FEATURE_FLAG_CODES),
  enabled: z.boolean(),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
});

export async function setFeatureFlag(formData: FormData) {
  const parsed = toggleSchema.safeParse({
    flagCode: formData.get("flag_code"),
    enabled: formData.get("enabled") === "true",
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  // The RPC enforces the admin gate itself; the session client keeps the
  // actor's identity attached to the audit row.
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_product_feature_flag", {
    p_environment: resolveFeatureFlagEnvironment(),
    p_flag_code: parsed.data.flagCode,
    p_enabled: parsed.data.enabled,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: "The flag could not be changed." };

  invalidateFeatureFlagCache();
  revalidatePath("/admin/flags");
  return { data: { flagCode: parsed.data.flagCode, enabled: parsed.data.enabled } };
}

export async function setFeatureFlagForm(formData: FormData): Promise<void> {
  await setFeatureFlag(formData);
}
