import { requireRole } from "@/features/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FEATURE_FLAG_CODES,
  getFeatureFlags,
  type FeatureFlagCode,
} from "@/lib/feature-flags";
import { setFeatureFlagForm } from "@/features/feature-flags/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils/formatting";

export const dynamic = "force-dynamic";

const FLAG_DESCRIPTIONS: Record<FeatureFlagCode, string> = {
  social_profiles: "Member social profile pages.",
  friends_discovery: "Friend requests and people discovery.",
  groups: "Group directory, join, leave, and group posts.",
  group_creation: "Member-created groups (Phase 1C).",
  community_text_posts: "New Community text posts and comments. Kill switch for all publishing.",
  community_photo_uploads: "New still-photo attachments on Community posts.",
  community_video_uploads: "New Community video attachments. Off for this release.",
  automated_post_moderation: "General-purpose AI gate before ordinary text/photo publication. Off in launch mode; posts publish after deterministic checks.",
  specialist_image_safeguard: "Required known-illegal-image safeguard. Photos do not publish while it is unavailable.",
  report_auto_hide: "First valid report hides content globally pending review.",
  events: "Meets and events.",
};

const SAFETY_CONTROLS: ReadonlySet<FeatureFlagCode> = new Set([
  "specialist_image_safeguard",
  "report_auto_hide",
]);

// Where each flag is checked today. A flag with no enforcement point is
// recorded configuration only; do not present it as a working kill switch.
const ENFORCED_BY: Partial<Record<FeatureFlagCode, string>> = {
  community_text_posts: "post + comment creation, composer UI",
  community_photo_uploads: "upload reservations, media attach, composer UI",
  community_video_uploads: "upload reservations, media attach, iOS/web pickers",
  automated_post_moderation: "post, comment, and photo publication path",
  specialist_image_safeguard: "launch-mode photo gate",
};

export default async function AdminFlagsPage() {
  await requireRole(["admin"]);
  const snapshot = await getFeatureFlags({ fresh: true });
  const { data: rows } = await createAdminClient()
    .from("product_feature_flags")
    .select("flag_code, enabled, reason, version, updated_at, updated_by")
    .eq("environment", snapshot.environment);
  const { data: changes } = await createAdminClient()
    .from("product_feature_flag_changes")
    .select("flag_code, previous_enabled, next_enabled, reason, created_at, version")
    .eq("environment", snapshot.environment)
    .order("created_at", { ascending: false })
    .limit(25);
  const byCode = new Map((rows ?? []).map((row) => [row.flag_code, row]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Feature Flags</h1>
        <p className="text-muted-foreground">
          Server-authoritative launch configuration for the <Badge variant="secondary">{snapshot.environment}</Badge> environment.
          Effective version {snapshot.version}. Ordinary changes propagate within 30 seconds.
        </p>
        {snapshot.emergencyOff.length > 0 ? (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Emergency override active (PERFECTPPI_EMERGENCY_OFF): {snapshot.emergencyOff.join(", ")} forced off regardless of the values below.
          </p>
        ) : null}
        {snapshot.source === "safe_defaults" ? (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            The flag table could not be read. Safe defaults are in effect: creation paths off, safety controls on.
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        {FEATURE_FLAG_CODES.map((code) => {
          const row = byCode.get(code);
          const effective = snapshot.flags[code];
          const forcedOff = snapshot.emergencyOff.includes(code);
          return (
            <Card key={code}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <code className="text-sm">{code}</code>
                  <Badge variant={effective ? "default" : "outline"}>{effective ? "on" : "off"}</Badge>
                  {forcedOff ? <Badge variant="destructive">emergency off</Badge> : null}
                  {SAFETY_CONTROLS.has(code) ? <Badge variant="secondary">safety control</Badge> : null}
                  {ENFORCED_BY[code] ? null : <Badge variant="outline">not yet enforced</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{FLAG_DESCRIPTIONS[code]}</p>
                <p className="text-xs text-muted-foreground">
                  {ENFORCED_BY[code]
                    ? `Enforced by: ${ENFORCED_BY[code]}.`
                    : "Recorded configuration only: no server path checks this flag yet, so changing it has no runtime effect."}
                </p>
                {row ? (
                  <p className="text-xs text-muted-foreground">
                    v{row.version} · last change {formatDate(row.updated_at)} · {row.reason}
                  </p>
                ) : null}
                <form action={setFeatureFlagForm} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="flag_code" value={code} />
                  <input type="hidden" name="enabled" value={row?.enabled ? "false" : "true"} />
                  <div className="min-w-64 flex-1">
                    <Input name="reason" required minLength={10} maxLength={500} placeholder="Reason for this change (recorded in the audit log)" />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    variant={row?.enabled ? "outline" : "default"}
                  >
                    {row?.enabled ? "Turn off" : "Turn on"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent changes</CardTitle>
        </CardHeader>
        <CardContent>
          {changes && changes.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {changes.map((change) => (
                <li key={`${change.flag_code}-${change.version}`} className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">{formatDate(change.created_at)}</span>
                  <code>{change.flag_code}</code>
                  <span>{String(change.previous_enabled ?? "unset")} → {String(change.next_enabled)}</span>
                  <span className="text-muted-foreground">{change.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
