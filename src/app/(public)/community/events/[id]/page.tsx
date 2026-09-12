import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Camera, ExternalLink, Images, LockKeyhole, MapPin, ShieldAlert, Users } from "lucide-react";
import { requireRole } from "@/features/auth/guards";
import { getCommunityEvent } from "@/features/social/events";
import { COMMUNITY_EVENT_TYPE_LABELS } from "@/features/social/events-policy";
import { CommunityEventOrganizerControls, CommunityEventRsvpControl } from "@/components/shared/community-event-controls";
import { CommunityReportControl } from "@/components/shared/community-report-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommunityPostArticle } from "@/components/shared/community-post-article";

export const dynamic = "force-dynamic";

function eventTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}

export default async function CommunityEventPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const event = await getCommunityEvent((await params).id);
  if (!event) notFound();
  const officialUpdates = event.announcement.comments.filter((comment) => event.official_update_comment_ids.includes(comment.id));

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community/events">Events</Link></Button>
        <article className="overflow-hidden rounded-[2rem] bg-surface-container-lowest shadow-sm ghost-border">
          <div className="bg-[radial-gradient(circle_at_top_right,rgba(9,121,105,0.2),transparent_48%)] p-7 sm:p-10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-wrap gap-2"><Badge>{COMMUNITY_EVENT_TYPE_LABELS[event.event_type]}</Badge>{event.group ? <Badge variant="outline">{event.group.name}</Badge> : null}{event.status === "cancelled" ? <Badge variant="destructive">Cancelled</Badge> : null}</div>
              {event.announcement.report_context ? <CommunityReportControl entityType="community_post" entityId={event.announcement.id} reportContext={event.announcement.report_context} /> : null}
            </div>
            <h1 className="mt-5 font-heading text-3xl font-extrabold tracking-tight sm:text-5xl">{event.title}</h1>
            <p className="mt-4 whitespace-pre-wrap leading-relaxed text-on-surface-variant">{event.announcement.content.split("\n\n")[1] ?? event.announcement.content}</p>
          </div>

          <div className="grid gap-8 border-t p-7 sm:p-10 md:grid-cols-[1fr_0.8fr]">
            <div className="space-y-6">
              <div className="space-y-3 text-sm"><p className="flex gap-3"><CalendarDays className="mt-0.5 h-5 w-5 text-primary" /><span><strong>Starts:</strong> {eventTime(event.starts_at)}<br /><strong>Ends:</strong> {eventTime(event.ends_at)}</span></p><p className="flex gap-3"><MapPin className="mt-0.5 h-5 w-5 text-primary" /><span><strong>General area:</strong> {event.general_location}</span></p><p className="flex gap-3"><Users className="mt-0.5 h-5 w-5 text-primary" /><span>{event.going_count} going · {event.interested_count} interested{event.capacity ? ` · ${event.capacity} capacity` : ""}</span></p></div>
              {event.requirements ? <div><h2 className="font-heading text-lg font-extrabold">Requirements</h2><p className="mt-2 whitespace-pre-wrap text-sm text-on-surface-variant">{event.requirements}</p></div> : null}
              {event.status === "cancelled" ? <div className="rounded-2xl bg-destructive/10 p-4"><p className="font-bold text-destructive">This event was cancelled.</p><p className="mt-1 text-sm">{event.cancellation_reason}</p></div> : null}
              {event.exact_location ? <div className="rounded-2xl bg-primary/5 p-5"><h2 className="flex items-center gap-2 font-heading text-lg font-extrabold"><LockKeyhole className="h-5 w-5 text-primary" />Attendee instructions</h2><p className="mt-2 whitespace-pre-wrap text-sm">{event.exact_location}</p><p className="mt-2 text-xs text-on-surface-variant">Private to the organizer and Going attendees. Do not repost it publicly.</p></div> : <div className="rounded-2xl bg-surface-container p-5"><p className="flex items-center gap-2 font-bold"><LockKeyhole className="h-4 w-4" />Exact instructions are private</p><p className="mt-1 text-sm text-on-surface-variant">Mark Going to unlock the address and arrival details.</p></div>}
            </div>

            <aside className="space-y-5">
              <div className="rounded-2xl bg-surface-container p-5"><p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Organizer</p><p className="mt-2 font-bold">{event.organizer.display_name ?? event.organizer.username ?? "PerfectPPI member"}</p>{event.organizer.username ? <Link className="text-sm text-primary hover:underline" href={`/profile/${event.organizer.username}`}>@{event.organizer.username}</Link> : null}</div>
              {event.status === "scheduled" && !event.is_organizer ? <CommunityEventRsvpControl eventId={event.id} initialStatus={event.viewer_rsvp} disabled={new Date(event.starts_at) <= new Date()} /> : null}
              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950"><p className="flex items-center gap-2 font-bold"><ShieldAlert className="h-4 w-4" />Meet safely</p><p className="mt-1">Confirm venue rules, use lawful roads, and report unsafe coordination. PerfectPPI does not verify or supervise organizers.</p></div>
              <Button asChild variant="outline" className="w-full"><Link href={`/community/posts/${event.announcement_post_id}`}>Open discussion <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
            </aside>
          </div>
        </article>

        {officialUpdates.length ? <section className="mt-7 rounded-[1.5rem] bg-surface-container-lowest p-6 ghost-border"><h2 className="font-heading text-xl font-extrabold">Organizer updates</h2><div className="mt-4 space-y-3">{officialUpdates.map((update) => <div key={update.id} className="rounded-2xl bg-surface-container p-4"><p className="whitespace-pre-wrap text-sm">{update.content}</p><p className="mt-2 text-xs text-on-surface-variant">{eventTime(update.created_at)}</p></div>)}</div></section> : null}
        {new Date(event.starts_at) <= new Date() ? (
          <section className="mt-7">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary"><Images className="h-4 w-4" />Post-event photo thread</p>
                <h2 className="mt-1 font-heading text-2xl font-extrabold">Photos from the event</h2>
                <p className="mt-1 text-sm text-on-surface-variant">Shared by the organizer and attendees who marked Going.</p>
              </div>
              {event.can_contribute_photos ? <Button asChild><Link href={`/dashboard/posts/new?event=${event.id}`}><Camera className="mr-2 h-4 w-4" />Add photos</Link></Button> : null}
            </div>
            {event.photo_posts.length ? (
              <div className="space-y-5">{event.photo_posts.map((post) => <CommunityPostArticle key={post.id} post={post} viewerId={viewer.id} />)}</div>
            ) : (
              <div className="rounded-[1.5rem] bg-surface-container-lowest p-7 text-center ghost-border">
                <Images className="mx-auto h-8 w-8 text-on-surface-variant/50" />
                <p className="mt-3 font-bold">No event photos yet</p>
                <p className="mt-1 text-sm text-on-surface-variant">The first approved photo post will appear here.</p>
              </div>
            )}
          </section>
        ) : null}
        {event.is_organizer && event.status === "scheduled" ? <section className="mt-7 rounded-[1.5rem] bg-surface-container-lowest p-6 ghost-border"><h2 className="mb-5 font-heading text-xl font-extrabold">Organizer tools</h2><CommunityEventOrganizerControls eventId={event.id} /></section> : null}
      </div>
    </main>
  );
}
