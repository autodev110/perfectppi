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

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ missing?: string; notice?: string }> };

export default async function ModerationAccessPage({ searchParams }: PageProps) {
  const profile = await requireRole(["admin"]);
  const { missing, notice } = await searchParams;
  const [mine, directory] = await Promise.all([
    getModerationCapabilities(profile.id),
    getModerationAccessDirectory(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground"><Link href="/admin/moderation" className="underline">Queue</Link> / access</p>
        <h1 className="font-heading text-2xl font-bold">Moderation Access</h1>
        <p className="text-muted-foreground">
          The admin role grants no moderation authority by itself. Each capability is an explicit, reasoned, revocable grant (plan 18.1).
          Developer role switching never confers one.
        </p>
      </div>

      {missing ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          You need the <code>{missing}</code> capability for that page. An administrator can grant it below.
        </p>
      ) : null}
      {notice ? <p className="rounded-md border px-3 py-2 text-sm" role="status">{notice}</p> : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Your capabilities</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {mine.size === 0 ? <p className="text-sm text-muted-foreground">None granted.</p> : null}
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
                  {admin.is_developer ? <Badge variant="outline">developer</Badge> : null}
                  {admin.id === profile.id ? <Badge variant="outline">you</Badge> : null}
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
                          <Badge variant={active ? "default" : "outline"}>{active ? "granted" : "not granted"}</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {CAPABILITY_LABELS[capability]}
                          {grant ? ` · since ${formatDate(grant.granted_at)} · ${grant.reason}` : ""}
                        </p>
                      </div>
                      <Input name="reason" required minLength={10} maxLength={500} placeholder="Reason (audited)" className="max-w-xs" />
                      <Button size="sm" variant={active ? "outline" : "default"} type="submit">
                        {active ? "Revoke" : "Grant"}
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
        <CardHeader><CardTitle className="text-base">Recent access changes</CardTitle></CardHeader>
        <CardContent>
          {directory.events.length === 0 ? <p className="text-sm text-muted-foreground">No changes recorded.</p> : (
            <ul className="space-y-1 text-sm">
              {directory.events.map((event) => (
                <li key={event.id} className="flex flex-wrap gap-x-3">
                  <span className="text-muted-foreground">{formatDate(event.created_at)}</span>
                  <span className="font-medium">{event.action}</span>
                  <code>{event.capability}</code>
                  <span>for @{event.subject?.username ?? event.subject?.display_name ?? "deleted"}</span>
                  <span className="text-muted-foreground">
                    by @{event.actor?.username ?? event.actor?.display_name ?? "system"} · {event.reason}
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
