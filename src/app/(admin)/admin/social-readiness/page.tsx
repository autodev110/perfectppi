import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { getSocialLaunchReadiness } from "@/features/moderation/launch-readiness";
import type { LaunchReadinessCheck, LaunchReadinessStatus } from "@/features/moderation/launch-readiness-shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/formatting";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<LaunchReadinessStatus, string> = {
  ready: "Ready",
  warning: "Verify",
  blocked: "Blocked",
  manual: "Manual",
};

export default async function SocialReadinessPage() {
  await requireRole(["admin"]);
  const readiness = await getSocialLaunchReadiness();
  const canLaunch = readiness.blockedCount === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold">Social Launch Readiness</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Live automated checks from plan section 39, plus approvals that still require a responsible person. A green automated result does not replace the manual sign-offs below.
          </p>
        </div>
        <Badge variant={canLaunch ? "default" : "destructive"} className="px-3 py-1 text-sm">
          {canLaunch ? "Automated checks clear" : `${readiness.blockedCount} launch blocker${readiness.blockedCount === 1 ? "" : "s"}`}
        </Badge>
      </div>

      <Card className={canLaunch ? "border-emerald-300/60" : "border-destructive/40"}>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <Summary label="Ready" value={readiness.readyCount} />
          <Summary label="Blocked" value={readiness.blockedCount} destructive={readiness.blockedCount > 0} />
          <Summary label="Needs verification" value={readiness.warningCount} />
          <div>
            <p className="text-xs text-muted-foreground">Environment</p>
            <p className="mt-1 font-semibold">{readiness.environment}</p>
            <p className="text-xs text-muted-foreground">Checked {formatDate(readiness.generatedAt)}</p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="automated-readiness-heading">
        <div>
          <h2 id="automated-readiness-heading" className="font-heading text-xl font-bold">Automated checks</h2>
          <p className="text-sm text-muted-foreground">These values are read from the current server environment and database on every visit.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {readiness.automated.map((check) => <CheckCard key={check.id} check={check} />)}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="manual-readiness-heading">
        <div>
          <h2 id="manual-readiness-heading" className="font-heading text-xl font-bold">Required owner confirmations</h2>
          <p className="text-sm text-muted-foreground">These cannot be inferred from code or environment variables and remain open until the named owners record their approvals.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {readiness.manual.map((check) => <CheckCard key={check.id} check={check} />)}
        </div>
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">Release rule</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Keep the production social beta closed while any automated check is blocked. Before opening it, resolve warnings, record every required owner confirmation, complete the manual client matrix, and practice the server kill switches. See the <Link href="/admin/flags" className="font-semibold underline">feature flags</Link>, <Link href="/admin/moderation" className="font-semibold underline">moderation queue</Link>, and <Link href="/admin/moderation/retention" className="font-semibold underline">retention register</Link>.
        </CardContent>
      </Card>
    </div>
  );
}

function CheckCard({ check }: { check: LaunchReadinessCheck }) {
  const badgeVariant = check.status === "blocked" ? "destructive" : check.status === "ready" ? "default" : "outline";
  return (
    <Card className={check.status === "blocked" ? "border-destructive/40" : undefined}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{check.label}</h3>
          <Badge variant={badgeVariant}>{STATUS_LABELS[check.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{check.detail}</p>
        {check.href ? <Link href={check.href} className="inline-block text-sm font-semibold underline">Open related control</Link> : null}
      </CardContent>
    </Card>
  );
}

function Summary({ label, value, destructive = false }: { label: string; value: number; destructive?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${destructive ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
