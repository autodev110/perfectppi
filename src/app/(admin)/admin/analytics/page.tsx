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

export const dynamic = "force-dynamic";

const eventLabels: Record<string, string> = {
  profile_completed: "Profiles completed",
  garage_vehicle_added: "Garage vehicles added",
  garage_vehicle_updated: "Garage vehicles updated",
  report_viewed: "Authorized reports viewed",
  listing_viewed: "Listings viewed",
  listing_saved: "Listings saved",
  seller_message_started: "Seller conversations started",
  inspection_requested: "Inspections requested",
  search_performed: "Searches",
  contact_match_found: "Contacts matched to members",
  invite_shared: "Invites shared",
  signup_from_invite: "Signups from invites",
  factory_spec_recorded: "Factory specs recorded",
  factory_conflict_refused: "Factory conflicts refused",
  custom_build_declared: "Custom builds declared",
  build_stage_created: "Build stages created",
  inspection_completed: "Inspections completed",
  group_joined: "Groups joined",
  community_post_published: "Community posts published",
  question_published: "Questions published",
  build_update_published: "Build updates published",
  maintenance_update_published: "Maintenance updates published",
  answer_accepted: "Answers accepted",
  group_detail_viewed: "Groups opened by non-members",
  media_upload_reserved: "Uploads started",
  media_upload_attached: "Uploads attached",
  unwanted_contact_reported: "Unwanted-contact reports",
  blocked_contact_attempt: "Contact attempts stopped by a block",
  app_session_started: "App sessions",
  app_crash_detected: "App crash reports",
};

const intentLabels: Record<string, string> = {
  shopper: "Shopper",
  owner: "Owner",
  enthusiast: "Enthusiast",
  technician: "Technician",
  undetermined: "Undetermined",
};

function percent(value: number | null, suffix = "") {
  return value === null ? "No data" : `${value.toLocaleString()}%${suffix}`;
}

const operationLabels: Record<string, string> = {
  community_feed: "Community feed",
  marketplace_directory: "Marketplace directory",
  saved_content: "Saved content",
  group_posts: "Group posts",
  group_search: "Group search",
  group_members: "Group members",
  group_faq: "Group FAQ",
  people_search: "People search",
  unified_search: "Unified search",
};

const funnelLabels: Record<string, string> = {
  listing_viewed: "Listing views",
  report_viewed: "Report opens",
  seller_message_started: "Seller conversations",
  inspection_requested: "Inspection requests",
  inspection_completed: "Completed inspections",
};

function hours(value: number | null) {
  return value === null ? "No data" : `${value.toLocaleString()} hr`;
}

export default async function ProductAnalyticsPage() {
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
    { label: "Weekly meaningful users", value: summary.weeklyMeaningfulUsers, icon: Target },
    { label: "30-day active users", value: summary.activeUsers, icon: Users },
    { label: "New-user activation", value: `${activationRate}%`, icon: UserCheck },
    { label: "Analytics opt-outs", value: summary.optedOutProfiles, icon: Activity },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Product Analytics</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Aggregate first-party measures from the last 30 days. Raw activity, content, VINs, locations, and individual account histories are not shown here.
        </p>
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
          <CardHeader><CardTitle>Meaningful actions</CardTitle></CardHeader>
          <CardContent>
            {summary.eventCounts.length === 0 ? <p className="text-sm text-muted-foreground">No opted-in activity has been recorded yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3">Action</th><th className="pb-3 text-right">Events</th><th className="pb-3 text-right">People</th></tr></thead>
                  <tbody>{summary.eventCounts.map((event) => <tr key={event.eventName} className="border-b last:border-0"><td className="py-3 font-medium">{eventLabels[event.eventName] ?? event.eventName.replaceAll("_", " ")}</td><td className="py-3 text-right tabular-nums">{event.eventCount.toLocaleString()}</td><td className="py-3 text-right tabular-nums">{event.userCount.toLocaleString()}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Daily active users</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {summary.dailyActiveUsers.length === 0 ? <p className="text-sm text-muted-foreground">Daily activity will appear after the migration is deployed.</p> : summary.dailyActiveUsers.map((entry) => (
              <div key={entry.day} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-xs">
                <span className="text-muted-foreground">{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${entry.day}T00:00:00Z`))}</span>
                <div className="h-2 overflow-hidden rounded-full bg-surface-container"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (entry.userCount / maxDailyUsers) * 100)}%` }} /></div>
                <span className="text-right font-semibold tabular-nums">{entry.userCount}</span>
              </div>
            ))}
            <p className="pt-3 text-xs text-muted-foreground">{summary.optedInProfiles.toLocaleString()} profiles currently opted in. Events expire after 90 days.</p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4" aria-labelledby="growth-kpis-heading">
        <div>
          <h2 id="growth-kpis-heading" className="font-heading text-2xl font-extrabold">Growth and Garage accuracy</h2>
          <p className="mt-1 text-sm text-muted-foreground">Search, network activation, invite conversion, vehicle-profile accuracy, and custom-build adoption. Garage coverage counts the Garage as it stands; everything else is the last {growth.windowDays} days.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Search</p><p className="mt-2 text-3xl font-black">{growth.search.searches.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">searches by {growth.search.searchers.toLocaleString()} members</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Network activation</p><p className="mt-2 text-3xl font-black">{growth.network.activationRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{growth.network.activatedAfterContactMatch} of {growth.network.membersWithContactMatches} members became friends within 7 days of a contact match ({growth.network.contactMatches} matches)</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Invite conversion</p><p className="mt-2 text-3xl font-black">{growth.invites.conversionRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{growth.invites.signups} signups from {growth.invites.shared} invites shared by {growth.invites.inviters} members</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Factory-spec coverage</p><p className="mt-2 text-3xl font-black">{growth.accuracy.factoryCoveragePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{growth.accuracy.vehiclesWithFactorySpec} of {growth.accuracy.vehiclesWithVin} vehicles with a VIN · {growth.accuracy.factoryConflictsRefused} contradicting saves refused ({growth.accuracy.membersWithRefusedConflicts} members)</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Custom builds</p><p className="mt-2 text-3xl font-black">{growth.customBuilds.customBuildVehicles.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">custom-build vehicles · {growth.customBuilds.modifiedVehicles} modified · {growth.customBuilds.declared} declared in window</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Build progression</p><p className="mt-2 text-3xl font-black">{growth.customBuilds.vehiclesWithStages.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">vehicles with stages · {growth.customBuilds.stagesCreated} stages created by {growth.customBuilds.membersCreatingStages} members</p></CardContent></Card>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="engagement-signals-heading">
        <div>
          <h2 id="engagement-signals-heading" className="font-heading text-2xl font-extrabold">Discovery, uploads, contact, and reliability</h2>
          <p className="mt-1 text-sm text-muted-foreground">Group discovery-to-join, upload completion, unwanted-contact attribution, and reliability observations over the last {signals.windowDays} days. Sessions and crash diagnostics are separate client-observed counts; delayed diagnostics cannot identify which session crashed. Nothing about the device or the crash is collected.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Group discovery → join</p><p className="mt-2 text-3xl font-black">{percent(signals.groupDiscovery.ratePercent)}</p><p className="mt-1 text-xs text-muted-foreground">{signals.groupDiscovery.joiners} of {signals.groupDiscovery.viewers} non-members who opened a group later joined that same group</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Upload completion</p><p className="mt-2 text-3xl font-black">{percent(signals.uploadCompletion.ratePercent)}</p><p className="mt-1 text-xs text-muted-foreground">{signals.uploadCompletion.attached} of {signals.uploadCompletion.reserved} started uploads were attached</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Unwanted contact</p><p className="mt-2 text-3xl font-black">{signals.unwantedContact.reports}</p><p className="mt-1 text-xs text-muted-foreground">profile/message reports by {signals.unwantedContact.reportingUsers} members · {signals.unwantedContact.reportsPerThousandMessages === null ? "no messages sent" : `${signals.unwantedContact.reportsPerThousandMessages} per 1,000 messages`} · {signals.unwantedContact.blockedAttempts} contact attempts stopped by a block ({signals.unwantedContact.blockedAttemptUsers} members)</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Crash diagnostics received</p><p className="mt-2 text-3xl font-black">{signals.sessions.crashes.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{signals.sessions.sessions.toLocaleString()} observed sessions from {signals.sessions.sessionUsers} members. An exact crash-free session rate is not available without session attribution.</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Meaningful return by observed intent</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3">Segment</th><th className="pb-3 text-right">D7 eligible</th><th className="pb-3 text-right">D7 return</th><th className="pb-3 text-right">D30 eligible</th><th className="pb-3 text-right">D30 return</th></tr></thead>
                <tbody>{signals.intentRetention.map((row) => <tr key={row.segment} className="border-b last:border-0"><td className="py-3 font-medium">{intentLabels[row.segment] ?? row.segment}</td><td className="py-3 text-right tabular-nums">{row.d7Eligible.toLocaleString()}</td><td className="py-3 text-right tabular-nums">{percent(row.d7RatePercent)}</td><td className="py-3 text-right tabular-nums">{row.d30Eligible.toLocaleString()}</td><td className="py-3 text-right tabular-nums">{percent(row.d30RatePercent)}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="pt-4 text-xs text-muted-foreground">Intent is observed, not declared: technician by account role, owner by a Garage action, shopper by Marketplace or search activity, enthusiast by Community activity, all within the first seven days. Rates are withheld for segments under five accounts.</p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="product-outcomes-heading">
        <div>
          <h2 id="product-outcomes-heading" className="font-heading text-2xl font-extrabold">Product outcomes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Server-confirmed actions from members who have product analytics enabled.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Friend acceptance</p><p className="mt-2 text-3xl font-black">{quality.product.friendAcceptanceRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.product.friendRequestsAccepted} accepted of {quality.product.friendRequestsSent} sent</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Questions answered in 24h</p><p className="mt-2 text-3xl font-black">{quality.product.answeredWithin24HoursRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.product.questionsAnsweredWithin24Hours} of {quality.product.questionsPublished} questions</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Accepted answers</p><p className="mt-2 text-3xl font-black">{quality.product.acceptedAnswerRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.product.questionsWithAcceptedAnswer} questions resolved</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Technical saves</p><p className="mt-2 text-3xl font-black">{quality.product.technicalPostSaves}</p><p className="mt-1 text-xs text-muted-foreground">From {quality.product.technicalPostSavers} members</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">D7 meaningful return</p><p className="mt-2 text-3xl font-black">{quality.product.d7Retention.ratePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.product.d7Retention.retainedUsers} of {quality.product.d7Retention.eligibleUsers} eligible members</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">D30 meaningful return</p><p className="mt-2 text-3xl font-black">{quality.product.d30Retention.ratePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.product.d30Retention.retainedUsers} of {quality.product.d30Retention.eligibleUsers} eligible members</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Retained group participants</p><p className="mt-2 text-3xl font-black">{quality.product.retainedGroupParticipants}</p><p className="mt-1 text-xs text-muted-foreground">Returned to contribute after seven days</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Notification opt-out</p><p className="mt-2 text-3xl font-black">{quality.safety.notificationOptOut.ratePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.safety.notificationOptOut.optedOutProfiles} of {quality.safety.notificationOptOut.eligibleProfiles} profiles</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Marketplace-related action stages</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3">Stage</th><th className="pb-3 text-right">Events</th><th className="pb-3 text-right">People</th></tr></thead>
                <tbody>{quality.product.marketplaceFunnel.map((stage) => <tr key={stage.stage} className="border-b last:border-0"><td className="py-3 font-medium">{funnelLabels[stage.stage]}</td><td className="py-3 text-right tabular-nums">{stage.eventCount.toLocaleString()}</td><td className="py-3 text-right tabular-nums">{stage.userCount.toLocaleString()}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="pt-4 text-xs text-muted-foreground">Each row is an independent aggregate action count, not person-level journey tracking. Report opens and inspection completions may begin outside Marketplace.</p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="safety-quality-heading">
        <div>
          <h2 id="safety-quality-heading" className="font-heading text-2xl font-extrabold">Safety quality</h2>
          <p className="mt-1 text-sm text-muted-foreground">Operational moderation measures. Report details and reporter identities are excluded.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Reports per 1,000 items</p><p className="mt-2 text-3xl font-black">{quality.safety.reportsPerThousandItems}</p><p className="mt-1 text-xs text-muted-foreground">{quality.safety.reportCount} reports across {quality.safety.publishedItems} posts and comments</p></div><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" /></CardContent></Card>
          <Card><CardContent className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Median review time</p><p className="mt-2 text-3xl font-black">{hours(quality.safety.review.medianHours)}</p><p className="mt-1 text-xs text-muted-foreground">P95 {hours(quality.safety.review.p95Hours)} across {quality.safety.review.closedCases} cases</p></div><Clock className="h-5 w-5 text-primary" aria-hidden="true" /></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Confirmed violations</p><p className="mt-2 text-3xl font-black">{quality.safety.decisions.confirmedViolationRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">Restore rate {quality.safety.decisions.restoreRatePercent}%</p></CardContent></Card>
          <Card><CardContent><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Appeal overturns</p><p className="mt-2 text-3xl font-black">{quality.safety.appeals.overturnRatePercent}%</p><p className="mt-1 text-xs text-muted-foreground">{quality.safety.appeals.overturned} of {quality.safety.appeals.decided} decided appeals</p></CardContent></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Queue and safeguards</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div><p className="text-muted-foreground">Open cases</p><p className="text-2xl font-black">{quality.safety.queue.openCases}</p></div>
              <div><p className="text-muted-foreground">Overdue</p><p className="text-2xl font-black">{quality.safety.queue.overdueCases}</p></div>
              <div><p className="text-muted-foreground">Due within 2h</p><p className="text-2xl font-black">{quality.safety.queue.dueWithin2Hours}</p></div>
              <div><p className="text-muted-foreground">Urgent unacknowledged</p><p className="text-2xl font-black">{quality.safety.queue.urgentUnacknowledged}</p></div>
              <div><p className="text-muted-foreground">Visibility violations</p><p className="text-2xl font-black">{quality.safety.visibilityIntegrityViolations}</p></div>
              <div><p className="text-muted-foreground">Hidden public media refs</p><p className="text-2xl font-black">{quality.safety.hiddenMediaPublicReferences}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Member safety actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div><p className="text-muted-foreground">Blocks</p><p className="text-2xl font-black">{quality.safety.blocksCreated}</p><p className="text-xs text-muted-foreground">{quality.safety.blockActors} members</p></div>
              <div><p className="text-muted-foreground">Mutes</p><p className="text-2xl font-black">{quality.safety.mutesCreated}</p><p className="text-xs text-muted-foreground">{quality.safety.muteActors} members</p></div>
              <div><p className="text-muted-foreground">Repeat violations</p><p className="text-2xl font-black">{quality.safety.repeatViolationAuthors}</p><p className="text-xs text-muted-foreground">Authors with 2+</p></div>
              <div><p className="text-muted-foreground">Repeated non-violations</p><p className="text-2xl font-black">{quality.safety.repeatedNonviolatingReporters}</p><p className="text-xs text-muted-foreground">Reporter patterns for review</p></div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Report mix</CardTitle></CardHeader>
          <CardContent>
            {quality.safety.reportBreakdown.length === 0 ? <p className="text-sm text-muted-foreground">No reason and surface cohort reached the five-report privacy threshold.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3">Surface</th><th className="pb-3">Reason</th><th className="pb-3 text-right">Reports</th></tr></thead><tbody>{quality.safety.reportBreakdown.map((group) => <tr key={`${group.surface}:${group.reasonCode}`} className="border-b last:border-0"><td className="py-3 font-medium">{group.surface === "community_post" ? "Posts" : "Comments"}</td><td className="py-3 capitalize">{group.reasonCode.replaceAll("_", " ")}</td><td className="py-3 text-right tabular-nums">{group.reportCount}</td></tr>)}</tbody></table></div>
            )}
            {quality.safety.reportBreakdownSuppressed ? <p className="pt-4 text-xs text-muted-foreground">Low-volume reason/surface cohorts are suppressed.</p> : null}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" aria-hidden="true" />Database reliability</CardTitle>
        </CardHeader>
        <CardContent>
          {queryMetrics.operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No production read-path statistics have been recorded since the last database statistics reset.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3">Operation</th>
                    <th className="pb-3 text-right">Calls</th>
                    <th className="pb-3 text-right">Average</th>
                    <th className="pb-3 text-right">Slowest</th>
                    <th className="pb-3 text-right">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {queryMetrics.operations.map((operation) => (
                    <tr key={operation.operationCode} className="border-b last:border-0">
                      <td className="py-3 font-medium">{operationLabels[operation.operationCode]}</td>
                      <td className="py-3 text-right tabular-nums">{operation.calls.toLocaleString()}</td>
                      <td className="py-3 text-right tabular-nums">{operation.meanExecMs.toLocaleString()} ms</td>
                      <td className="py-3 text-right tabular-nums">{operation.maxExecMs.toLocaleString()} ms</td>
                      <td className="py-3 text-right tabular-nums">{operation.rows.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="pt-4 text-xs text-muted-foreground">
            Aggregate normalized database statistics{queryMetrics.statsReset
              ? ` since ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(queryMetrics.statsReset))} UTC`
              : " for the current database statistics window"}. SQL text, parameters, content, and account identifiers are not exposed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
