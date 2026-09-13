import { Activity, Gauge, Target, UserCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/guards";
import { getOperationalQueryMetrics, getProductAnalyticsSummary } from "@/features/analytics/queries";

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
  inspection_completed: "Inspections completed",
  group_joined: "Groups joined",
  community_post_published: "Community posts published",
  question_published: "Questions published",
  build_update_published: "Build updates published",
  maintenance_update_published: "Maintenance updates published",
  answer_accepted: "Answers accepted",
};

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

export default async function ProductAnalyticsPage() {
  await requireRole(["admin"]);
  const [summary, queryMetrics] = await Promise.all([
    getProductAnalyticsSummary(30),
    getOperationalQueryMetrics(),
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
