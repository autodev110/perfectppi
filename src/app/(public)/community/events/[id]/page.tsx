import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Camera, CloudSun, ExternalLink, Images, LockKeyhole, MapPin, ShieldAlert, Users } from "lucide-react";
import { requireRole } from "@/features/auth/guards";
import { getCommunityEvent } from "@/features/social/events";
import { COMMUNITY_EVENT_TYPE_LABELS } from "@/features/social/events-policy";
import { CommunityEventOrganizerControls, CommunityEventRsvpControl } from "@/components/shared/community-event-controls";
import { CommunityReportControl } from "@/components/shared/community-report-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommunityPostArticle } from "@/components/shared/community-post-article";

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

function eventTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}

function forecastDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export default async function CommunityEventPage({ params }: { params: Promise<{ id: string }> }) {
  const uiText = await getRequestTranslator();
  const viewer = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const event = await getCommunityEvent((await params).id);
  if (!event) notFound();
  const officialUpdates = event.announcement.comments.filter((comment) => event.official_update_comment_ids.includes(comment.id));

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community/events">{uiText("ui.events_8d14f6e72d")}</Link></Button>
        <article className="overflow-hidden rounded-[2rem] bg-surface-container-lowest shadow-sm ghost-border">
          <div className="bg-[radial-gradient(circle_at_top_right,rgba(9,121,105,0.2),transparent_48%)] p-7 sm:p-10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-wrap gap-2"><Badge>{COMMUNITY_EVENT_TYPE_LABELS[event.event_type]}</Badge>{event.group ? <Badge variant="outline">{event.group.name}</Badge> : null}{event.status === "cancelled" ? <Badge variant="destructive">{uiText("ui.cancelled_d353a99eb4")}</Badge> : null}</div>
              {event.announcement.report_context ? <CommunityReportControl entityType="community_post" entityId={event.announcement.id} reportContext={event.announcement.report_context} /> : null}
            </div>
            <h1 className="mt-5 font-heading text-3xl font-extrabold tracking-tight sm:text-5xl">{event.title}</h1>
            <p className="mt-4 whitespace-pre-wrap leading-relaxed text-on-surface-variant">{event.announcement.content.split("\n\n")[1] ?? event.announcement.content}</p>
          </div>

          <div className="grid gap-8 border-t p-7 sm:p-10 md:grid-cols-[1fr_0.8fr]">
            <div className="space-y-6">
              <div className="space-y-3 text-sm"><p className="flex gap-3"><CalendarDays className="mt-0.5 h-5 w-5 text-primary" /><span><strong>{uiText("ui.starts_24eae43ae9")}</strong> {eventTime(event.starts_at)}<br /><strong>{uiText("ui.ends_05fbc1d601")}</strong> {eventTime(event.ends_at)}</span></p><p className="flex gap-3"><MapPin className="mt-0.5 h-5 w-5 text-primary" /><span><strong>{uiText("ui.general_area_4a59c58096")}</strong> {event.general_location}</span></p><p className="flex gap-3"><Users className="mt-0.5 h-5 w-5 text-primary" /><span>{event.going_count}{uiText("ui.going_ebf99e879a")}{event.interested_count}{uiText("ui.interested_0df0031e1e")}{event.capacity ? uiText("ui.capacity_1875a9529e", { arg0: String(event.capacity) }) : ""}</span></p></div>
              {event.weather ? (
                <div className="rounded-2xl bg-sky-50 p-5 text-sky-950">
                  <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold"><CloudSun className="h-5 w-5" />{uiText("ui.weather_for_4f2e8bdb43")}{forecastDate(event.weather.forecast_date)}</h2>
                  <p className="mt-2 font-bold">{event.weather.condition} · {Math.round(event.weather.temperature_min_c)}–{Math.round(event.weather.temperature_max_c)}{uiText("ui.c_11c4350690")}</p>
                  <p className="mt-1 text-sm">{event.weather.precipitation_probability == null ? uiText("ui.precipitation_chance_unavailable_b25036db8c") : uiText("ui.chance_of_precipitation_26f99be4e6", { arg0: String(event.weather.precipitation_probability) })}{event.weather.wind_gusts_kph == null ? "" : uiText("ui.gusts_up_to_km_h_5f1c81f4aa", { arg0: String(Math.round(event.weather.wind_gusts_kph)) })}</p>
                  <p className="mt-2 text-xs text-sky-900/75">{uiText("ui.approximate_forecast_for_951eca8b9b")}{event.weather.location_label}{uiText("ui.conditions_can_change_c8d783be18")}<a className="underline" href={event.weather.provider_url} target="_blank" rel="noreferrer">{uiText("ui.weather_data_by_2c6b0df667")}{event.weather.provider_name}</a>.</p>
                </div>
              ) : null}
              {event.requirements ? <div><h2 className="font-heading text-lg font-extrabold">{uiText("ui.requirements_e0cdd07f6a")}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-on-surface-variant">{event.requirements}</p></div> : null}
              {event.status === "cancelled" ? <div className="rounded-2xl bg-destructive/10 p-4"><p className="font-bold text-destructive">{uiText("ui.this_event_was_cancelled_7166c4f01a")}</p><p className="mt-1 text-sm">{event.cancellation_reason}</p></div> : null}
              {event.exact_location ? <div className="rounded-2xl bg-primary/5 p-5"><h2 className="flex items-center gap-2 font-heading text-lg font-extrabold"><LockKeyhole className="h-5 w-5 text-primary" />{uiText("ui.attendee_instructions_494b2274c4")}</h2><p className="mt-2 whitespace-pre-wrap text-sm">{event.exact_location}</p><p className="mt-2 text-xs text-on-surface-variant">{uiText("ui.private_to_the_organizer_and_going_attendees_d9beb14188")}</p></div> : <div className="rounded-2xl bg-surface-container p-5"><p className="flex items-center gap-2 font-bold"><LockKeyhole className="h-4 w-4" />{uiText("ui.exact_instructions_are_private_e5bc81c9ad")}</p><p className="mt-1 text-sm text-on-surface-variant">{uiText("ui.mark_going_to_unlock_the_address_and_arrival_3520aaa56a")}</p></div>}
            </div>

            <aside className="space-y-5">
              <div className="rounded-2xl bg-surface-container p-5"><p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">{uiText("ui.organizer_715a9cc0c3")}</p><p className="mt-2 font-bold">{event.organizer.display_name ?? event.organizer.username ?? uiText("ui.perfectppi_member_99bd607db6")}</p>{event.organizer.username ? <Link className="text-sm text-primary hover:underline" href={`/profile/${event.organizer.username}`}>@{event.organizer.username}</Link> : null}</div>
              {event.status === "scheduled" && !event.is_organizer ? <CommunityEventRsvpControl eventId={event.id} initialStatus={event.viewer_rsvp} disabled={new Date(event.starts_at) <= new Date()} /> : null}
              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950"><p className="flex items-center gap-2 font-bold"><ShieldAlert className="h-4 w-4" />{uiText("ui.meet_safely_c0f09f4c3a")}</p><p className="mt-1">{uiText("ui.confirm_venue_rules_use_lawful_roads_and_rep_85c71cf738")}</p></div>
              <Button asChild variant="outline" className="w-full"><Link href={`/community/posts/${event.announcement_post_id}`}>{uiText("ui.open_discussion_44b4c2629f")}<ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
            </aside>
          </div>
        </article>

        {officialUpdates.length ? <section className="mt-7 rounded-[1.5rem] bg-surface-container-lowest p-6 ghost-border"><h2 className="font-heading text-xl font-extrabold">{uiText("ui.organizer_updates_01d6197cc4")}</h2><div className="mt-4 space-y-3">{officialUpdates.map((update) => <div key={update.id} className="rounded-2xl bg-surface-container p-4"><p className="whitespace-pre-wrap text-sm">{update.content}</p><p className="mt-2 text-xs text-on-surface-variant">{eventTime(update.created_at)}</p></div>)}</div></section> : null}
        {new Date(event.starts_at) <= new Date() ? (
          <section className="mt-7">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary"><Images className="h-4 w-4" />{uiText("ui.post_event_photo_thread_d313aba02e")}</p>
                <h2 className="mt-1 font-heading text-2xl font-extrabold">{uiText("ui.photos_from_the_event_8063119b10")}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">{uiText("ui.shared_by_the_organizer_and_attendees_who_ma_81fb9ea05c")}</p>
              </div>
              {event.can_contribute_photos ? <Button asChild><Link href={`/dashboard/posts/new?event=${event.id}`}><Camera className="mr-2 h-4 w-4" />{uiText("ui.add_photos_7b0a3d7449")}</Link></Button> : null}
            </div>
            {event.photo_posts.length ? (
              <div className="space-y-5">{event.photo_posts.map((post) => <CommunityPostArticle key={post.id} post={post} viewerId={viewer.id} />)}</div>
            ) : (
              <div className="rounded-[1.5rem] bg-surface-container-lowest p-7 text-center ghost-border">
                <Images className="mx-auto h-8 w-8 text-on-surface-variant/50" />
                <p className="mt-3 font-bold">{uiText("ui.no_event_photos_yet_ef20078d99")}</p>
                <p className="mt-1 text-sm text-on-surface-variant">{uiText("ui.the_first_approved_photo_post_will_appear_he_4a2b6506fb")}</p>
              </div>
            )}
          </section>
        ) : null}
        {event.is_organizer && event.status === "scheduled" ? <section className="mt-7 rounded-[1.5rem] bg-surface-container-lowest p-6 ghost-border"><h2 className="mb-5 font-heading text-xl font-extrabold">{uiText("ui.organizer_tools_d70e856a4e")}</h2><CommunityEventOrganizerControls eventId={event.id} /></section> : null}
      </div>
    </main>
  );
}
