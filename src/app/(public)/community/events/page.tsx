import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, Plus, Users } from "lucide-react";
import { requireRole } from "@/features/auth/guards";
import { eventsEnabled, getCommunityEvents } from "@/features/social/events";
import { COMMUNITY_EVENT_TYPE_LABELS } from "@/features/social/events-policy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: uiText("ui.events_perfectppi_d088432079") };

function eventTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function CommunityEventsPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const enabled = await eventsEnabled();
  const events = enabled ? await getCommunityEvents() : [];

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community">{uiText("ui.community_bb501d7877")}</Link></Button>
        <header className="mb-9 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge className="mb-4 bg-secondary-container text-on-secondary-container hover:bg-secondary-container">{uiText("ui.events_8d14f6e72d")}</Badge>
            <h1 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">{uiText("ui.meet_up_without_oversharing_6ff0cfec64")}</h1>
            <p className="mt-3 max-w-2xl text-on-surface-variant">{uiText("ui.find_free_meets_track_days_shows_shop_events_51ff209390")}</p>
          </div>
          {enabled ? <Button asChild className="h-12 rounded-xl px-6"><Link href="/community/events/new"><Plus className="mr-2 h-4 w-4" />{uiText("ui.create_event_946cbe2dbb")}</Link></Button> : null}
        </header>

        {!enabled ? (
          <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border"><CalendarDays className="mx-auto mb-3 h-10 w-10 text-on-surface-variant/40" /><p className="font-semibold">{uiText("ui.events_are_not_enabled_in_this_environment_b32e51846a")}</p></div>
        ) : events.length === 0 ? (
          <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border"><CalendarDays className="mx-auto mb-3 h-10 w-10 text-on-surface-variant/40" /><p className="font-semibold">{uiText("ui.no_upcoming_events_yet_442805a38a")}</p><p className="mt-1 text-sm text-on-surface-variant">{uiText("ui.create_the_first_safe_get_together_for_your__17c88d7e7f")}</p></div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {events.map((event) => (
              <Link key={event.id} href={`/community/events/${event.id}`} className="group rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm transition-transform hover:-translate-y-0.5 ghost-border">
                <div className="flex items-start justify-between gap-4"><Badge variant="secondary">{COMMUNITY_EVENT_TYPE_LABELS[event.event_type]}</Badge><ChevronRight className="h-5 w-5 text-on-surface-variant transition-transform group-hover:translate-x-1" /></div>
                <h2 className="mt-4 font-heading text-xl font-extrabold">{event.title}</h2>
                <p className="mt-2 text-sm font-semibold">{eventTime(event.starts_at)}</p>
                <p className="mt-2 flex items-center gap-2 text-sm text-on-surface-variant"><MapPin className="h-4 w-4" />{event.general_location}</p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs text-on-surface-variant"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{event.going_count}{uiText("ui.going_7a3c51cf51")}</span><span>· {event.interested_count}{uiText("ui.interested_0df0031e1e")}</span>{event.capacity ? <span>· {event.capacity}{uiText("ui.capacity_6f1eb58a26")}</span> : null}</div>
                <div className="mt-3 flex flex-wrap gap-2">{event.group ? <Badge variant="outline">{event.group.name}</Badge> : null}{event.status === "cancelled" ? <Badge variant="destructive">{uiText("ui.cancelled_d353a99eb4")}</Badge> : null}{event.is_organizer ? <Badge variant="outline">{uiText("ui.you_organize_853b2933e2")}</Badge> : null}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
