import { createClient as createBaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { sendApnsPush, isApnsConfigured, type ApnsPayload } from "./apns";

/**
 * Server-side helper for fan-out push: looks up all device tokens for a
 * profile and pushes the payload to each one. Failures are logged but do not
 * throw — push is best-effort.
 *
 * Uses the service-role Supabase client because the caller is typically a
 * webhook (Stripe / DocuSeal) or a server action operating on behalf of one
 * user pushing to another (e.g. consumer creates request → push to tech).
 */
function getServiceClient() {
  return createBaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function pushToProfile(
  profileId: string,
  payload: ApnsPayload,
): Promise<void> {
  if (!isApnsConfigured()) return;

  const supabase = getServiceClient();
  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("token, platform, env")
    .eq("profile_id", profileId);

  if (!tokens || tokens.length === 0) return;

  const results = await Promise.all(
    tokens
      .filter((t) => t.platform === "ios")
      .map((t) =>
        sendApnsPush({
          deviceToken: t.token,
          env: t.env as "prod" | "sandbox",
          payload,
        }),
      ),
  );

  // Prune device tokens APNs rejects (BadDeviceToken, Unregistered).
  const dead = results.filter(
    (r) =>
      !r.ok &&
      (r.reason === "BadDeviceToken" || r.reason === "Unregistered"),
  );
  if (dead.length > 0) {
    await supabase
      .from("device_tokens")
      .delete()
      .in(
        "token",
        dead.map((d) => d.token),
      );
  }

  // Log non-fatal errors for observability.
  for (const r of results) {
    if (!r.ok) {
      console.warn("[apns] push failed", {
        status: r.status,
        reason: r.reason,
      });
    }
  }
}
