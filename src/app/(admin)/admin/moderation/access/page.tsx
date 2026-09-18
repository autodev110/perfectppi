import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import {
  CAPABILITY_LABELS,
  MODERATION_CAPABILITIES,
  getModerationCapabilities,
} from "@/features/moderation/capabilities";
import { getModerationAccessDirectory } from "@/features/moderation/case-queries";
import { grantModerationCapability, revokeModerationCapability } from "@/features/moderation/case-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils/formatting";

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ missing?: string; notice?: string }> };

export default async function ModerationAccessPage({ searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const profile = await requireRole(["admin"]);
  const { missing, notice } = await searchParams;
  const [mine, directory] = await Promise.all([
    getModerationCapabilities(profile.id),
    getModerationAccessDirectory(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground"><Link href="/admin/moderation" className="underline">{uiText("ui.queue_3b2fe03e36")}</Link>{uiText("ui.access_9ff4f3828d")}</p>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.moderation_access_0a48338aad")}</h1>
        <p className="text-muted-foreground">{uiText("ui.the_admin_role_grants_no_moderation_authorit_f3b38f699d")}</p>
      </div>

      {missing ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{uiText("ui.you_need_the_ab734010d6")}<code>{missing}</code>{uiText("ui.capability_for_that_page_an_administrator_ca_3cf40819b2")}</p>
      ) : null}
      {notice ? <p className="rounded-md border px-3 py-2 text-sm" role="status">{notice}</p> : null}

      <Card>
        <CardHeader><CardTitle className="text-base">{uiText("ui.your_capabilities_9f9443c8f3")}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {mine.size === 0 ? <p className="text-sm text-muted-foreground">{uiText("ui.none_granted_8db46135b4")}</p> : null}
          {[...mine].map((capability) => <Badge key={capability} variant="secondary">{capability.replaceAll("_", " ")}</Badge>)}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {directory.admins.map((admin) => {
          const held = new Set(admin.grants.map((grant) => grant.capability));
          return (
            <Card key={admin.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  @{admin.username ?? admin.display_name ?? admin.id.slice(0, 8)}
                  {admin.is_developer ? <Badge variant="outline">{uiText("ui.developer_88fa0d759f")}</Badge> : null}
                  {admin.id === profile.id ? <Badge variant="outline">{uiText("ui.you_bb0347a468")}</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {MODERATION_CAPABILITIES.map((capability) => {
                  const active = held.has(capability);
                  const grant = admin.grants.find((entry) => entry.capability === capability);
                  return (
                    <form
                      key={capability}
                      action={active ? revokeModerationCapability : grantModerationCapability}
                      className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
                    >
                      <input type="hidden" name="profile_id" value={admin.id} />
                      <input type="hidden" name="capability" value={capability} />
                      <div className="min-w-56 flex-1">
                        <p className="text-sm font-medium">
                          <code>{capability}</code>{" "}
                          <Badge variant={active ? "default" : "outline"}>{active ? uiText("ui.granted_dd515d1975") : uiText("ui.not_granted_a74b63193c")}</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {CAPABILITY_LABELS[capability]}
                          {grant ? uiText("ui.since_365452c148", { arg0: String(formatDate(grant.granted_at)), arg1: String(grant.reason) }) : ""}
                        </p>
                      </div>
                      <Input name="reason" required minLength={10} maxLength={500} placeholder={uiText("ui.reason_audited_f542e521d0")} className="max-w-xs" />
                      <Button size="sm" variant={active ? "outline" : "default"} type="submit">
                        {active ? uiText("ui.revoke_87e6d00bbf") : uiText("ui.grant_78b7d0379d")}
                      </Button>
                    </form>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{uiText("ui.recent_access_changes_f2cbd9a427")}</CardTitle></CardHeader>
        <CardContent>
          {directory.events.length === 0 ? <p className="text-sm text-muted-foreground">{uiText("ui.no_changes_recorded_87eee7c0c2")}</p> : (
            <ul className="space-y-1 text-sm">
              {directory.events.map((event) => (
                <li key={event.id} className="flex flex-wrap gap-x-3">
                  <span className="text-muted-foreground">{formatDate(event.created_at)}</span>
                  <span className="font-medium">{event.action}</span>
                  <code>{event.capability}</code>
                  <span>{uiText("ui.for_124481947c")}{event.subject?.username ?? event.subject?.display_name ?? uiText("ui.deleted_1185f37d33")}</span>
                  <span className="text-muted-foreground">{uiText("ui.by_27a59bb60f")}{event.actor?.username ?? event.actor?.display_name ?? uiText("ui.system_bbc5e661e1")} · {event.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
