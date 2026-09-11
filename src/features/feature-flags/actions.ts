"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  // The RPC enforces active-admin access and requires an explicit safety
  // capability in production; the session preserves the audit actor.
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_product_feature_flag", {
    p_environment: resolveFeatureFlagEnvironment(),
    p_flag_code: parsed.data.flagCode,
    p_enabled: parsed.data.enabled,
    p_reason: parsed.data.reason,
  });
  if (error) {
    // 20260911020000: production changes need the legal_hold_review grant on
    // top of an active admin account. Say so instead of failing silently.
    if (error.message.includes("moderation capability required")) {
      return { error: "Production flags can only be changed by an admin holding the legal_hold_review capability (granted on /admin/moderation/access)." };
    }
    if (error.message.includes("Administrator access required")) {
      return { error: "An active administrator account is required." };
    }
    return { error: "The flag could not be changed." };
  }

  invalidateFeatureFlagCache();
  revalidatePath("/admin/flags");
  return { data: { flagCode: parsed.data.flagCode, enabled: parsed.data.enabled } };
}

export async function setFeatureFlagForm(formData: FormData): Promise<void> {
  const result = await setFeatureFlag(formData);
  if (!result.data) redirect(`/admin/flags?error=${encodeURIComponent(result.error ?? "The flag could not be changed.")}`);
  redirect(`/admin/flags?changed=${encodeURIComponent(result.data.flagCode)}`);
}
