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
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const FLAG_DESCRIPTIONS: Record<FeatureFlagCode, string> = {
  social_profiles: uiText("ui.member_social_profile_pages_369b69901c"),
  friends_discovery: uiText("ui.friend_requests_and_people_discovery_f31535b821"),
  groups: uiText("ui.group_directory_join_leave_and_group_posts_80d995ff34"),
  group_creation: uiText("ui.member_created_groups_phase_1c_ae2e2d0bf7"),
  community_text_posts: uiText("ui.new_community_text_posts_and_comments_kill_s_df27606c72"),
  community_photo_uploads: uiText("ui.new_still_photo_attachments_on_community_pos_99b6062b77"),
  community_video_uploads: uiText("ui.new_community_video_attachments_off_for_this_19ab1f987f"),
  automated_post_moderation: uiText("ui.general_purpose_ai_gate_before_ordinary_text_7763e864b5"),
  specialist_image_safeguard: uiText("ui.required_known_illegal_image_safeguard_photo_80a4ff434f"),
  report_auto_hide: uiText("ui.first_valid_report_hides_content_globally_pe_801853b8c7"),
  events: uiText("ui.meets_and_events_9e24c6345a"),
};

const SAFETY_CONTROLS: ReadonlySet<FeatureFlagCode> = new Set([
  "specialist_image_safeguard",
  "report_auto_hide",
]);

// Where each flag is checked today. A flag with no enforcement point is
// recorded configuration only; do not present it as a working kill switch.
const ENFORCED_BY: Partial<Record<FeatureFlagCode, string>> = {
  social_profiles: uiText("ui.member_profile_apis_pages_and_share_previews_d49d806e88"),
  friends_discovery: uiText("ui.people_discovery_and_friendship_expansion_c20535bc3b"),
  groups: uiText("ui.group_reads_membership_moderation_images_and_26b5dbe157"),
  group_creation: uiText("ui.member_group_creation_2b571dee3f"),
  community_text_posts: uiText("ui.post_comment_creation_composer_ui_42b3c1a9d5"),
  community_photo_uploads: uiText("ui.upload_reservations_media_attach_composer_ui_4f91fe09c4"),
  community_video_uploads: uiText("ui.upload_reservations_media_attach_ios_web_pic_3a5f763244"),
  automated_post_moderation: uiText("ui.post_comment_and_photo_publication_path_caf516e250"),
  specialist_image_safeguard: uiText("ui.launch_mode_photo_gate_7ba32d581b"),
  events: uiText("ui.event_reads_creation_rsvp_updates_and_photo__f3b913560c"),
};

export default async function AdminFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);
  const { error: actionError, changed } = await searchParams;
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
  const { data: storageStatus } = await createAdminClient().rpc("community_media_storage_status");
  const storage = storageStatus && typeof storageStatus === "object" && !Array.isArray(storageStatus)
    ? Object.fromEntries(Object.entries(storageStatus).map(([key, value]) => [key, Number(value ?? 0)]))
    : {};
  const legacyPublic = storage.legacyPublicObjects ?? 0;
  const unverified = storage.unverifiedRetirements ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.feature_flags_c60c04dc77")}</h1>
        <p className="text-muted-foreground">{uiText("ui.server_authoritative_launch_configuration_fo_89597892a7")}<Badge variant="secondary">{snapshot.environment}</Badge>{uiText("ui.environment_effective_version_d03c5e48ab")}{snapshot.version}{uiText("ui.ordinary_changes_propagate_within_30_seconds_527a036686")}</p>
        {snapshot.emergencyOff.length > 0 ? (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{uiText("ui.emergency_override_active_perfectppi_emergen_886a8ad5c1")}{snapshot.emergencyOff.join(", ")}{uiText("ui.forced_off_regardless_of_the_values_below_3b8fcb7837")}</p>
        ) : null}
        {actionError ? (
          <p role="alert" className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
        {changed ? (
          <p role="status" className="mt-2 rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {changed}{uiText("ui.updated_the_change_is_audited_below_and_live_f72469ad3e")}</p>
        ) : null}
        {snapshot.source === "safe_defaults" ? (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{uiText("ui.the_flag_table_could_not_be_read_safe_defaul_5ea3cbfa6f")}</p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{uiText("ui.community_media_storage_bf5bae3f23")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className={legacyPublic > 0 || unverified > 0 ? "text-destructive" : "text-muted-foreground"}>
            {legacyPublic > 0
              ? uiText("ui.object_s_still_have_a_permanent_public_url_t_34dd7dc571", { arg0: String(legacyPublic) })
              : unverified > 0
                ? uiText("ui.retired_url_s_are_awaiting_external_verifica_3aea214b47", { arg0: String(unverified) })
                : uiText("ui.no_community_object_has_a_permanent_public_u_fa49c6a1cf")}
          </p>
          <p className="text-xs text-muted-foreground">{uiText("ui.private_66a6fd2346")}{storage.privateObjects ?? 0}{uiText("ui.quarantined_7692f06fbc")}{storage.quarantinedObjects ?? 0}{uiText("ui.legacy_public_a5e9ac2eff")}{legacyPublic}{uiText("ui.unverified_retirements_38f1eb3885")}{unverified}
          </p>
        </CardContent>
      </Card>

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
                  <Badge variant={effective ? "default" : "outline"}>{effective ? uiText("ui.on_b8d31e8527") : uiText("ui.off_b4dc66dde8")}</Badge>
                  {forcedOff ? <Badge variant="destructive">{uiText("ui.emergency_off_58ed2c3993")}</Badge> : null}
                  {SAFETY_CONTROLS.has(code) ? <Badge variant="secondary">{uiText("ui.safety_control_4b2b20f0ce")}</Badge> : null}
                  {ENFORCED_BY[code] ? null : <Badge variant="outline">{uiText("ui.not_yet_enforced_0fbbedcfd2")}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{FLAG_DESCRIPTIONS[code]}</p>
                <p className="text-xs text-muted-foreground">
                  {ENFORCED_BY[code]
                    ? uiText("ui.enforced_by_6449be19b9", { arg0: String(ENFORCED_BY[code]) })
                    : uiText("ui.recorded_configuration_only_no_server_path_c_fd8756b8cf")}
                </p>
                {row ? (
                  <p className="text-xs text-muted-foreground">{uiText("ui.v_4c94485e0c")}{row.version}{uiText("ui.last_change_2f8a42602a")}{formatDate(row.updated_at)} · {row.reason}
                  </p>
                ) : null}
                <form action={setFeatureFlagForm} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="flag_code" value={code} />
                  <input type="hidden" name="enabled" value={row?.enabled ? "false" : "true"} />
                  <div className="min-w-64 flex-1">
                    <Input name="reason" required minLength={10} maxLength={500} placeholder={uiText("ui.reason_for_this_change_recorded_in_the_audit_1f0cf137c1")} />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    variant={row?.enabled ? "outline" : "default"}
                  >
                    {row?.enabled ? uiText("ui.turn_off_06f0e210b2") : uiText("ui.turn_on_5a1f096a0d")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{uiText("ui.recent_changes_f66a12ef4f")}</CardTitle>
        </CardHeader>
        <CardContent>
          {changes && changes.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {changes.map((change) => (
                <li key={`${change.flag_code}-${change.version}`} className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">{formatDate(change.created_at)}</span>
                  <code>{change.flag_code}</code>
                  <span>{String(change.previous_enabled ?? uiText("ui.unset_6cbf83e080"))} → {String(change.next_enabled)}</span>
                  <span className="text-muted-foreground">{change.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{uiText("ui.no_changes_recorded_yet_0dbc9c4de6")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
