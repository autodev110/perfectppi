// A member's own enforcement status (plan 17.4 / 18.6). Readable while the
// account is suspended — this is the one thing a suspended member must be
// able to see — so it authenticates the session itself instead of going
// through requireApiRole's availability gate.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createApiClient } from "@/lib/supabase/server";
import { actionLabel, blocksAccountAccess, enforcementNotice, type EnforcementAction, type EnforcementNotice } from "@/lib/moderation/enforcement-notice";

export type EnforcementStatus = {
  /** False while a suspension or ban is active. */
  available: boolean;
  notice: EnforcementNotice | null;
  actions: Array<EnforcementAction & { label: string }>;
  support_path: string;
};

export async function getMyEnforcementStatus(): Promise<EnforcementStatus | null> {
  const supabase = await createApiClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (!profile) return null;

  const now = new Date().toISOString();
  const { data } = await admin
    .from("user_enforcement_actions")
    .select("id, action_type, reason_code, starts_at, ends_at")
    .eq("profile_id", profile.id)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(10);
  const actions: EnforcementAction[] = data ?? [];
  return {
    available: !actions.some((action) => blocksAccountAccess(action.action_type)),
    notice: enforcementNotice(actions),
    actions: actions.map((action) => ({ ...action, label: actionLabel(action.action_type) })),
    support_path: "/support",
  };
}
