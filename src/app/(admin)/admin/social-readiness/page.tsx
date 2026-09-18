import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { getSocialLaunchReadiness } from "@/features/moderation/launch-readiness";
import type { LaunchReadinessCheck, LaunchReadinessStatus } from "@/features/moderation/launch-readiness-shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/formatting";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<LaunchReadinessStatus, string> = {
  ready: uiText("ui.ready_5fa7aac537"),
  warning: uiText("ui.verify_eea2745e28"),
  blocked: uiText("ui.blocked_18f2a0947f"),
  manual: uiText("ui.manual_b0b9fe24ff"),
};

export default async function SocialReadinessPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);
  const readiness = await getSocialLaunchReadiness();
  const canLaunch = readiness.blockedCount === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold">{uiText("ui.social_launch_readiness_b3007b610c")}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">{uiText("ui.live_automated_checks_from_plan_section_39_p_f49bce8359")}</p>
        </div>
        <Badge variant={canLaunch ? "default" : "destructive"} className="px-3 py-1 text-sm">
          {canLaunch ? uiText("ui.automated_checks_clear_b8abf33489") : uiText("ui.launch_blocker_c7dc39e827", { arg0: String(readiness.blockedCount), arg1: String(readiness.blockedCount === 1 ? "" : "s") })}
        </Badge>
      </div>

      <Card className={canLaunch ? "border-emerald-300/60" : "border-destructive/40"}>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <Summary label={uiText("ui.ready_5fa7aac537")} value={readiness.readyCount} />
          <Summary label={uiText("ui.blocked_18f2a0947f")} value={readiness.blockedCount} destructive={readiness.blockedCount > 0} />
          <Summary label={uiText("ui.needs_verification_3dddf7d417")} value={readiness.warningCount} />
          <div>
            <p className="text-xs text-muted-foreground">{uiText("ui.environment_9e471951a1")}</p>
            <p className="mt-1 font-semibold">{readiness.environment}</p>
            <p className="text-xs text-muted-foreground">{uiText("ui.checked_fb55a4e97d")}{formatDate(readiness.generatedAt)}</p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="automated-readiness-heading">
        <div>
          <h2 id="automated-readiness-heading" className="font-heading text-xl font-bold">{uiText("ui.automated_checks_ad388fff83")}</h2>
          <p className="text-sm text-muted-foreground">{uiText("ui.these_values_are_read_from_the_current_serve_50a8ec09c0")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {readiness.automated.map((check) => <CheckCard key={check.id} check={check} />)}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="manual-readiness-heading">
        <div>
          <h2 id="manual-readiness-heading" className="font-heading text-xl font-bold">{uiText("ui.required_owner_confirmations_f7119936d2")}</h2>
          <p className="text-sm text-muted-foreground">{uiText("ui.these_cannot_be_inferred_from_code_or_enviro_48c2958bc1")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {readiness.manual.map((check) => <CheckCard key={check.id} check={check} />)}
        </div>
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">{uiText("ui.release_rule_1848372ab2")}</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">{uiText("ui.keep_the_production_social_beta_closed_while_39796e77a9")}<Link href="/admin/flags" className="font-semibold underline">{uiText("ui.feature_flags_d651892c22")}</Link>, <Link href="/admin/moderation" className="font-semibold underline">{uiText("ui.moderation_queue_e7f3a4ef55")}</Link>{uiText("ui.and_0a63e3f63f")}<Link href="/admin/moderation/retention" className="font-semibold underline">{uiText("ui.retention_register_63c51c760b")}</Link>.
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
        {check.href ? <Link href={check.href} className="inline-block text-sm font-semibold underline">{uiText("ui.open_related_control_277f66c1fb")}</Link> : null}
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
