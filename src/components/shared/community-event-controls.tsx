"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CommunityEventRsvpStatus } from "@/features/social/events";

async function responseData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "The event could not be updated.");
  return payload.data as T;
}

export function CommunityEventRsvpControl({
  eventId,
  initialStatus,
  disabled,
}: {
  eventId: string;
  initialStatus: CommunityEventRsvpStatus | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();

  function update(next: CommunityEventRsvpStatus) {
    startTransition(async () => {
      try {
        await responseData(await fetch(`/api/community/events/${eventId}/rsvp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        }));
        setStatus(next);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Your RSVP could not be saved.");
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2" aria-label="RSVP">
      {(["going", "interested", "not_going"] as const).map((value) => (
        <Button
          key={value}
          type="button"
          variant={status === value ? "default" : "outline"}
          disabled={disabled || pending}
          onClick={() => update(value)}
        >
          {value === "not_going" ? "Not going" : value[0].toUpperCase() + value.slice(1)}
        </Button>
      ))}
    </div>
  );
}

export function CommunityEventOrganizerControls({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [update, setUpdate] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function publishUpdate() {
    startTransition(async () => {
      try {
        const result = await responseData<{ moderationStatus: string }>(await fetch(`/api/community/events/${eventId}/updates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: update }),
        }));
        setUpdate("");
        toast.success(result.moderationStatus === "active" ? "Event update posted" : "Event update submitted for review");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The update could not be posted.");
      }
    });
  }

  function cancel() {
    if (!window.confirm("Cancel this event and notify Going and Interested members?")) return;
    startTransition(async () => {
      try {
        await responseData(await fetch(`/api/community/events/${eventId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }));
        toast.success("Event cancelled and attendees notified");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The event could not be cancelled.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="event-update" className="text-sm font-bold">Organizer update</label>
        <Textarea id="event-update" className="mt-2" rows={3} maxLength={600} value={update} onChange={(event) => setUpdate(event.target.value)} placeholder="Weather, timing, parking, or other important changes" />
        <Button className="mt-2" type="button" variant="outline" disabled={pending || !update.trim()} onClick={publishUpdate}>Post update</Button>
      </div>
      <details className="rounded-2xl border border-destructive/20 p-4">
        <summary className="cursor-pointer text-sm font-bold text-destructive">Cancel event</summary>
        <label htmlFor="cancel-reason" className="mt-4 block text-xs font-semibold">Reason shown to attendees</label>
        <Input id="cancel-reason" className="mt-2" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is the event cancelled?" />
        <Button className="mt-3" type="button" variant="destructive" disabled={pending || reason.trim().length < 3} onClick={cancel}>Cancel and notify attendees</Button>
      </details>
    </div>
  );
}
