import { Activity, Clock, Gauge, ShieldCheck, Target, UserCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/guards";
import {
  getGrowthAccuracyKpis,
  getOperationalQueryMetrics,
  getProductAnalyticsSummary,
  getProductEngagementSignals,
  getProductSafetyAnalyticsSummary,
} from "@/features/analytics/queries";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const eventLabels: Record<string, string> = {
  profile_completed: uiText("ui.profiles_completed_8b2962ae7c"),
  garage_vehicle_added: uiText("ui.garage_vehicles_added_63575699f3"),
  garage_vehicle_updated: uiText("ui.garage_vehicles_updated_1346e2338e"),
  report_viewed: uiText("ui.authorized_reports_viewed_a4e4dfb92c"),
  listing_viewed: uiText("ui.listings_viewed_7b8642d6ca"),
  listing_saved: uiText("ui.listings_saved_6d08c924ff"),
  seller_message_started: uiText("ui.seller_conversations_started_1f36ce1245"),
  inspection_requested: uiText("ui.inspections_requested_b17731761b"),
  search_performed: uiText("ui.searches_1cb99ce230"),
  contact_match_found: uiText("ui.contacts_matched_to_members_71a34d40b3"),
  invite_shared: uiText("ui.invites_shared_b4ff8b85d9"),
  signup_from_invite: uiText("ui.signups_from_invites_be3d80c09d"),
  factory_spec_recorded: uiText("ui.factory_specs_recorded_8aa4a106e7"),
  factory_conflict_refused: uiText("ui.factory_conflicts_refused_a824aca029"),
  custom_build_declared: uiText("ui.custom_builds_declared_d7c08457b3"),
  build_stage_created: uiText("ui.build_stages_created_76800e32fa"),
  inspection_completed: uiText("ui.inspections_completed_3974e215d5"),
  group_joined: uiText("ui.groups_joined_6aee95e8bf"),
  community_post_published: uiText("ui.community_posts_published_6dd1635312"),
  question_published: uiText("ui.questions_published_6d30d88f4d"),
  build_update_published: uiText("ui.build_updates_published_05f7a4dbb3"),
  maintenance_update_published: uiText("ui.maintenance_updates_published_8085e6f08e"),
  answer_accepted: uiText("ui.answers_accepted_eeda6875d4"),
  group_detail_viewed: uiText("ui.groups_opened_by_non_members_4198f0aaf5"),
  media_upload_reserved: uiText("ui.uploads_started_401f23cc35"),
  media_upload_attached: uiText("ui.uploads_attached_1af5f55221"),
  unwanted_contact_reported: uiText("ui.unwanted_contact_reports_443888002d"),
  blocked_contact_attempt: uiText("ui.contact_attempts_stopped_by_a_block_629466e2a8"),
  app_session_started: uiText("ui.app_sessions_ac7743a475"),
  app_crash_detected: uiText("ui.app_crash_reports_ed510b2e69"),
};

const intentLabels: Record<string, string> = {
  shopper: uiText("ui.shopper_e6f6a8b53e"),
  owner: uiText("ui.owner_4b1b8aa360"),
  enthusiast: uiText("ui.enthusiast_167cb0eeec"),
  technician: uiText("ui.technician_9041ccc417"),
  undetermined: uiText("ui.undetermined_1dd0274b2e"),
};

function percent(value: number | null, suffix = "") {
  return value === null ? uiText("ui.no_data_3b41ba9c7c") : `${value.toLocaleString()}%${suffix}`;
}

const operationLabels: Record<string, string> = {
  community_feed: uiText("ui.community_feed_0459794e75"),
  marketplace_directory: uiText("ui.marketplace_directory_fc30dce645"),
  saved_content: uiText("ui.saved_content_34a3280540"),
  group_posts: uiText("ui.group_posts_11d7c8b1b2"),
  group_search: uiText("ui.group_search_fcf25c5f01"),
  group_members: uiText("ui.group_members_dd0fd917e7"),
  group_faq: uiText("ui.group_faq_73a7af8ecb"),
  people_search: uiText("ui.people_search_586b960e20"),
  unified_search: uiText("ui.unified_search_57d6df9193"),
};

const funnelLabels: Record<string, string> = {
  listing_viewed: uiText("ui.listing_views_11b1d83821"),
  report_viewed: uiText("ui.report_opens_adc1976654"),
  seller_message_started: uiText("ui.seller_conversations_b1838f02a4"),
  inspection_requested: uiText("ui.inspection_requests_6a303fb063"),
  inspection_completed: uiText("ui.completed_inspections_b16ea6b3c8"),
};

function hours(value: number | null) {
  return value === null ? uiText("ui.no_data_3b41ba9c7c") : `${value.toLocaleString()} hr`;
}

export default async function ProductAnalyticsPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);
  const [summary, quality, queryMetrics, growth, signals] = await Promise.all([
    getProductAnalyticsSummary(30),
    getProductSafetyAnalyticsSummary(30),
    getOperationalQueryMetrics(),
    getGrowthAccuracyKpis(30),
    getProductEngagementSignals(30),
  ]);
  const activationRate = summary.eligibleNewProfiles > 0
    ? Math.round((summary.activatedNewProfiles / summary.eligibleNewProfiles) * 100)
    : 0;
  const maxDailyUsers = Math.max(1, ...summary.dailyActiveUsers.map((entry) => entry.userCount));
  const metrics = [
    { label: uiText("ui.weekly_meaningful_users_53c18dbdac"), value: summary.weeklyMeaningfulUsers, icon: Target },
    { label: uiText("ui.30_day_active_users_1865ad4300"), value: summary.activeUsers, icon: Users },
    { label: uiText("ui.new_user_activation_af92ac0f6b"), value: `${activationRate}%`, icon: UserCheck },
    { label: uiText("ui.analytics_opt_outs_ff84aff5b2"), value: summary.optedOutProfiles, icon: Activity },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">{uiText("ui.product_analytics_9fd4c15283")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{uiText("ui.aggregate_first_party_measures_from_the_last_3d3cf5626e")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>
              <div className="rounded-xl bg-secondary-container p-2 text-on-secondary-container"><Icon className="h-5 w-5" aria-hidden="true" /></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle>{uiText("ui.meaningful_actions_57921610ff")}</CardTitle></CardHeader>
          <CardContent>
            {summary.eventCounts.length === 0 ? <p className="text-sm text-muted-foreground">{uiText("ui.no_opted_in_activity_has_been_recorded_yet_65715da215")}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3">{uiText("ui.action_64cff1319d")}</th><th className="pb-3 text-right">{uiText("ui.events_8d14f6e72d")}</th><th className="pb-3 text-right">{uiText("ui.people_7db2089705")}</th></tr></thead>
                  <tbody>{summary.eventCounts.map((event) => <tr key={event.eventName} className="border-b last:border-0"><td className="py-3 font-medium">{eventLabels[event.eventName] ?? event.eventName.replaceAll("_", " ")}</td><td className="py-3 text-right tabular-nums">{event.eventCount.toLocaleString()}</td><td className="py-3 text-right tabular-nums">{event.userCount.toLocaleString()}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{uiText("ui.daily_active_users_9525743787")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {summary.dailyActiveUsers.length === 0 ? <p className="text-sm text-muted-foreground">{uiText("ui.daily_activity_will_appear_after_the_migrati_a527486bf1")}</p> : summary.dailyActiveUsers.map((entry) => (
              <div key={entry.day} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-xs">
                <span className="text-muted-foreground">{new Intl.DateTimeFormat(uiText("ui.en_dbd3a49d0d"), { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(uiText("ui.t00_00_00z_d9773a2de5", { arg0: String(entry.day) })))}</span>
                <div className="h-2 overflow-hidden rounded-full bg-surface-container"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (entry.userCount / maxDailyUsers) * 100)}%` }} /></div>
                <span className="text-right font-semibold tabular-nums">{entry.userCount}</span>
              </div>
            ))}
            <p className="pt-3 text-xs text-muted-foreground">{summary.optedInProfiles.toLocaleString()}{uiText("ui.profiles_currently_opted_in_events_expire_af_840d770748")}</p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4" aria-labelledby="growth-kpis-heading">
        <div>
          <h2 id="growth-kpis-heading" className="font-heading text-2xl font-extrabold">{uiText("ui.growth_and_garage_accuracy_26c77d63da")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.search_network_activation_invite_conversion__0db0e8dac7")}{growth.windowDays}{uiText("ui.days_914beb1c73")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.search_49c266baaa")}</p><p className="mt-2 text-3xl font-black">{growth.search.searches.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{uiText("ui.searches_by_97c14ee1be")}{growth.search.searchers.toLocaleString()}{uiText("ui.members_c93aa5da28")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.network_activation_5c2bbf700a")}</p><p className="mt-2 text-3xl font-black">{growth.network.activationRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{growth.network.activatedAfterContactMatch}{uiText("ui.of_a4282e4b22")}{growth.network.membersWithContactMatches}{uiText("ui.members_became_friends_within_7_days_of_a_co_f643ebf455")}{growth.network.contactMatches}{uiText("ui.matches_e9cdfecb6c")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.invite_conversion_f3e07cda9e")}</p><p className="mt-2 text-3xl font-black">{growth.invites.conversionRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{growth.invites.signups}{uiText("ui.signups_from_9a6cb92b27")}{growth.invites.shared}{uiText("ui.invites_shared_by_7c98ce9e58")}{growth.invites.inviters}{uiText("ui.members_c93aa5da28")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.factory_spec_coverage_d0741b53aa")}</p><p className="mt-2 text-3xl font-black">{growth.accuracy.factoryCoveragePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{growth.accuracy.vehiclesWithFactorySpec}{uiText("ui.of_a4282e4b22")}{growth.accuracy.vehiclesWithVin}{uiText("ui.vehicles_with_a_vin_53ed7d8a9f")}{growth.accuracy.factoryConflictsRefused}{uiText("ui.contradicting_saves_refused_624fd16501")}{growth.accuracy.membersWithRefusedConflicts}{uiText("ui.members_6fe8470ce3")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.custom_builds_d5a37d411b")}</p><p className="mt-2 text-3xl font-black">{growth.customBuilds.customBuildVehicles.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{uiText("ui.custom_build_vehicles_bd43136152")}{growth.customBuilds.modifiedVehicles}{uiText("ui.modified_22257a498d")}{growth.customBuilds.declared}{uiText("ui.declared_in_window_2c0f33ddf3")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.build_progression_1925373c77")}</p><p className="mt-2 text-3xl font-black">{growth.customBuilds.vehiclesWithStages.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{uiText("ui.vehicles_with_stages_e41ea6d598")}{growth.customBuilds.stagesCreated}{uiText("ui.stages_created_by_09b4617108")}{growth.customBuilds.membersCreatingStages}{uiText("ui.members_c93aa5da28")}</p></CardContent></Card>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="engagement-signals-heading">
        <div>
          <h2 id="engagement-signals-heading" className="font-heading text-2xl font-extrabold">{uiText("ui.discovery_uploads_contact_and_reliability_0e7b5a027b")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.group_discovery_to_join_upload_completion_un_2a81c5b545")}{signals.windowDays}{uiText("ui.days_sessions_and_crash_diagnostics_are_sepa_7327267383")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.group_discovery_join_c9ff11e927")}</p><p className="mt-2 text-3xl font-black">{percent(signals.groupDiscovery.ratePercent)}</p><p className="mt-1 text-xs text-muted-foreground">{signals.groupDiscovery.joiners}{uiText("ui.of_a4282e4b22")}{signals.groupDiscovery.viewers}{uiText("ui.non_members_who_opened_a_group_later_joined__79656af405")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.upload_completion_a6267a82e4")}</p><p className="mt-2 text-3xl font-black">{percent(signals.uploadCompletion.ratePercent)}</p><p className="mt-1 text-xs text-muted-foreground">{signals.uploadCompletion.attached}{uiText("ui.of_a4282e4b22")}{signals.uploadCompletion.reserved}{uiText("ui.started_uploads_were_attached_608a0bdf56")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.unwanted_contact_6469aa6bf1")}</p><p className="mt-2 text-3xl font-black">{signals.unwantedContact.reports}</p><p className="mt-1 text-xs text-muted-foreground">{uiText("ui.profile_message_reports_by_a3c6709f35")}{signals.unwantedContact.reportingUsers}{uiText("ui.members_7c1476a93d")}{signals.unwantedContact.reportsPerThousandMessages === null ? uiText("ui.no_messages_sent_2fed0c0120") : uiText("ui.per_1_000_messages_e9d0d846d6", { arg0: String(signals.unwantedContact.reportsPerThousandMessages) })} · {signals.unwantedContact.blockedAttempts}{uiText("ui.contact_attempts_stopped_by_a_block_d3104d7d70")}{signals.unwantedContact.blockedAttemptUsers}{uiText("ui.members_6fe8470ce3")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.crash_diagnostics_received_feee28af90")}</p><p className="mt-2 text-3xl font-black">{signals.sessions.crashes.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{signals.sessions.sessions.toLocaleString()}{uiText("ui.observed_sessions_from_553d70803e")}{signals.sessions.sessionUsers}{uiText("ui.members_an_exact_crash_free_session_rate_is__235dd47e70")}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>{uiText("ui.meaningful_return_by_observed_intent_27331ac9ca")}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3">{uiText("ui.segment_29ee089cce")}</th><th className="pb-3 text-right">{uiText("ui.d7_eligible_e08cd1fe65")}</th><th className="pb-3 text-right">{uiText("ui.d7_return_1597adc48a")}</th><th className="pb-3 text-right">{uiText("ui.d30_eligible_344bd51eaf")}</th><th className="pb-3 text-right">{uiText("ui.d30_return_4b369b0de5")}</th></tr></thead>
                <tbody>{signals.intentRetention.map((row) => <tr key={row.segment} className="border-b last:border-0"><td className="py-3 font-medium">{intentLabels[row.segment] ?? row.segment}</td><td className="py-3 text-right tabular-nums">{row.d7Eligible.toLocaleString()}</td><td className="py-3 text-right tabular-nums">{percent(row.d7RatePercent)}</td><td className="py-3 text-right tabular-nums">{row.d30Eligible.toLocaleString()}</td><td className="py-3 text-right tabular-nums">{percent(row.d30RatePercent)}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="pt-4 text-xs text-muted-foreground">{uiText("ui.intent_is_observed_not_declared_technician_b_cdd9b1ddf9")}</p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="product-outcomes-heading">
        <div>
          <h2 id="product-outcomes-heading" className="font-heading text-2xl font-extrabold">{uiText("ui.product_outcomes_ea0ddd14d3")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.server_confirmed_actions_from_members_who_ha_d026991b9d")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.friend_acceptance_b2f20576a7")}</p><p className="mt-2 text-3xl font-black">{quality.product.friendAcceptanceRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.product.friendRequestsAccepted}{uiText("ui.accepted_of_4bdb714ff2")}{quality.product.friendRequestsSent}{uiText("ui.sent_2b8ae82932")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.questions_answered_in_24h_e7a62a6f96")}</p><p className="mt-2 text-3xl font-black">{quality.product.answeredWithin24HoursRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.product.questionsAnsweredWithin24Hours}{uiText("ui.of_a4282e4b22")}{quality.product.questionsPublished}{uiText("ui.questions_7fcfdd8806")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.accepted_answers_6d0329f8c8")}</p><p className="mt-2 text-3xl font-black">{quality.product.acceptedAnswerRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.product.questionsWithAcceptedAnswer}{uiText("ui.questions_resolved_7e57b7c051")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.technical_saves_ab6b2f0361")}</p><p className="mt-2 text-3xl font-black">{quality.product.technicalPostSaves}</p><p className="mt-1 text-xs text-muted-foreground">{uiText("ui.from_e484a95dcc")}{quality.product.technicalPostSavers}{uiText("ui.members_c93aa5da28")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.d7_meaningful_return_84d29622bc")}</p><p className="mt-2 text-3xl font-black">{quality.product.d7Retention.ratePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.product.d7Retention.retainedUsers}{uiText("ui.of_a4282e4b22")}{quality.product.d7Retention.eligibleUsers}{uiText("ui.eligible_members_e62ae98e3f")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.d30_meaningful_return_03432bd2cd")}</p><p className="mt-2 text-3xl font-black">{quality.product.d30Retention.ratePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.product.d30Retention.retainedUsers}{uiText("ui.of_a4282e4b22")}{quality.product.d30Retention.eligibleUsers}{uiText("ui.eligible_members_e62ae98e3f")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.retained_group_participants_e7a4d32d52")}</p><p className="mt-2 text-3xl font-black">{quality.product.retainedGroupParticipants}</p><p className="mt-1 text-xs text-muted-foreground">{uiText("ui.returned_to_contribute_after_seven_days_dfbf90cae5")}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.notification_opt_out_f7eb38a59e")}</p><p className="mt-2 text-3xl font-black">{quality.safety.notificationOptOut.ratePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.safety.notificationOptOut.optedOutProfiles}{uiText("ui.of_a4282e4b22")}{quality.safety.notificationOptOut.eligibleProfiles}{uiText("ui.profiles_1c01cef2a8")}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>{uiText("ui.marketplace_related_action_stages_61573d53cb")}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3">{uiText("ui.stage_de838855e4")}</th><th className="pb-3 text-right">{uiText("ui.events_8d14f6e72d")}</th><th className="pb-3 text-right">{uiText("ui.people_7db2089705")}</th></tr></thead>
                <tbody>{quality.product.marketplaceFunnel.map((stage) => <tr key={stage.stage} className="border-b last:border-0"><td className="py-3 font-medium">{funnelLabels[stage.stage]}</td><td className="py-3 text-right tabular-nums">{stage.eventCount.toLocaleString()}</td><td className="py-3 text-right tabular-nums">{stage.userCount.toLocaleString()}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="pt-4 text-xs text-muted-foreground">{uiText("ui.each_row_is_an_independent_aggregate_action__6f71e2af2d")}</p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="safety-quality-heading">
        <div>
          <h2 id="safety-quality-heading" className="font-heading text-2xl font-extrabold">{uiText("ui.safety_quality_c94831c33a")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.operational_moderation_measures_report_detai_6a56ba94a3")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.reports_per_1_000_items_a7d89be3da")}</p><p className="mt-2 text-3xl font-black">{quality.safety.reportsPerThousandItems}</p><p className="mt-1 text-xs text-muted-foreground">{quality.safety.reportCount}{uiText("ui.reports_across_7e9c931f08")}{quality.safety.publishedItems}{uiText("ui.posts_and_comments_398e393529")}</p></div><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" /></CardContent></Card>
          <Card><CardContent className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.median_review_time_e01242b8ed")}</p><p className="mt-2 text-3xl font-black">{hours(quality.safety.review.medianHours)}</p><p className="mt-1 text-xs text-muted-foreground">{uiText("ui.p95_aa11fab1ff")}{hours(quality.safety.review.p95Hours)}{uiText("ui.across_3d3b931bef")}{quality.safety.review.closedCases}{uiText("ui.cases_a5cd8c25db")}</p></div><Clock className="h-5 w-5 text-primary" aria-hidden="true" /></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.confirmed_violations_05187327ef")}</p><p className="mt-2 text-3xl font-black">{quality.safety.decisions.confirmedViolationRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{uiText("ui.restore_rate_6da2702d07")}{quality.safety.decisions.restoreRatePercent}%</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.appeal_overturns_25c64e1e22")}</p><p className="mt-2 text-3xl font-black">{quality.safety.appeals.overturnRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.safety.appeals.overturned}{uiText("ui.of_a4282e4b22")}{quality.safety.appeals.decided}{uiText("ui.decided_appeals_254ca699a2")}</p></CardContent></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>{uiText("ui.queue_and_safeguards_819ba89039")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div><p className="text-muted-foreground">{uiText("ui.open_cases_575f540cf9")}</p><p className="text-2xl font-black">{quality.safety.queue.openCases}</p></div>
              <div><p className="text-muted-foreground">{uiText("ui.overdue_d660945bc2")}</p><p className="text-2xl font-black">{quality.safety.queue.overdueCases}</p></div>
              <div><p className="text-muted-foreground">{uiText("ui.due_within_2h_f8ec4b56fd")}</p><p className="text-2xl font-black">{quality.safety.queue.dueWithin2Hours}</p></div>
              <div><p className="text-muted-foreground">{uiText("ui.urgent_unacknowledged_fca951c02d")}</p><p className="text-2xl font-black">{quality.safety.queue.urgentUnacknowledged}</p></div>
              <div><p className="text-muted-foreground">{uiText("ui.visibility_violations_071aa241a9")}</p><p className="text-2xl font-black">{quality.safety.visibilityIntegrityViolations}</p></div>
              <div><p className="text-muted-foreground">{uiText("ui.hidden_public_media_refs_63dc431a01")}</p><p className="text-2xl font-black">{quality.safety.hiddenMediaPublicReferences}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{uiText("ui.member_safety_actions_1fa5f92b23")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div><p className="text-muted-foreground">{uiText("ui.blocks_1cd5a6687b")}</p><p className="text-2xl font-black">{quality.safety.blocksCreated}</p><p className="text-xs text-muted-foreground">{quality.safety.blockActors}{uiText("ui.members_c93aa5da28")}</p></div>
              <div><p className="text-muted-foreground">{uiText("ui.mutes_f5bfee0e92")}</p><p className="text-2xl font-black">{quality.safety.mutesCreated}</p><p className="text-xs text-muted-foreground">{quality.safety.muteActors}{uiText("ui.members_c93aa5da28")}</p></div>
              <div><p className="text-muted-foreground">{uiText("ui.repeat_violations_50fbcb5124")}</p><p className="text-2xl font-black">{quality.safety.repeatViolationAuthors}</p><p className="text-xs text-muted-foreground">{uiText("ui.authors_with_2_2508a9a89d")}</p></div>
              <div><p className="text-muted-foreground">{uiText("ui.repeated_non_violations_a5ab394e76")}</p><p className="text-2xl font-black">{quality.safety.repeatedNonviolatingReporters}</p><p className="text-xs text-muted-foreground">{uiText("ui.reporter_patterns_for_review_a9ee11cf1c")}</p></div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>{uiText("ui.report_mix_8c6e4416da")}</CardTitle></CardHeader>
          <CardContent>
            {quality.safety.reportBreakdown.length === 0 ? <p className="text-sm text-muted-foreground">{uiText("ui.no_reason_and_surface_cohort_reached_the_fiv_3cf49939be")}</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3">{uiText("ui.surface_0905f7f590")}</th><th className="pb-3">{uiText("ui.reason_f81ab834de")}</th><th className="pb-3 text-right">{uiText("ui.reports_dacca3cba3")}</th></tr></thead><tbody>{quality.safety.reportBreakdown.map((group) => <tr key={`${group.surface}:${group.reasonCode}`} className="border-b last:border-0"><td className="py-3 font-medium">{group.surface === "community_post" ? uiText("ui.posts_a80811cf68") : uiText("ui.comments_355f79f29d")}</td><td className="py-3 capitalize">{group.reasonCode.replaceAll("_", " ")}</td><td className="py-3 text-right tabular-nums">{group.reportCount}</td></tr>)}</tbody></table></div>
            )}
            {quality.safety.reportBreakdownSuppressed ? <p className="pt-4 text-xs text-muted-foreground">{uiText("ui.low_volume_reason_surface_cohorts_are_suppre_540290aa82")}</p> : null}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" aria-hidden="true" />{uiText("ui.database_reliability_56e6b625d4")}</CardTitle>
        </CardHeader>
        <CardContent>
          {queryMetrics.operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{uiText("ui.no_production_read_path_statistics_have_been_0a1a50d396")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3">{uiText("ui.operation_0f044feb6c")}</th>
                    <th className="pb-3 text-right">{uiText("ui.calls_b73a5e2ca6")}</th>
                    <th className="pb-3 text-right">{uiText("ui.average_b38ae2c5b8")}</th>
                    <th className="pb-3 text-right">{uiText("ui.slowest_730a7c50e7")}</th>
                    <th className="pb-3 text-right">{uiText("ui.rows_101f2ff3de")}</th>
                  </tr>
                </thead>
                <tbody>
                  {queryMetrics.operations.map((operation) => (
                    <tr key={operation.operationCode} className="border-b last:border-0">
                      <td className="py-3 font-medium">{operationLabels[operation.operationCode]}</td>
                      <td className="py-3 text-right tabular-nums">{operation.calls.toLocaleString()}</td>
                      <td className="py-3 text-right tabular-nums">{operation.meanExecMs.toLocaleString()}{uiText("ui.ms_20249a0dcc")}</td>
                      <td className="py-3 text-right tabular-nums">{operation.maxExecMs.toLocaleString()}{uiText("ui.ms_20249a0dcc")}</td>
                      <td className="py-3 text-right tabular-nums">{operation.rows.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="pt-4 text-xs text-muted-foreground">{uiText("ui.aggregate_normalized_database_statistics_dee3500729")}{queryMetrics.statsReset
              ? uiText("ui.since_utc_25b00f8f63", { arg0: String(new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(queryMetrics.statsReset))) })
              : uiText("ui.for_the_current_database_statistics_window_44ba913960")}{uiText("ui.sql_text_parameters_content_and_account_iden_cede56ada1")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
