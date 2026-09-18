"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CommunityEventRsvpStatus } from "@/features/social/events";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

async function responseData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? uiText("ui.the_event_could_not_be_updated_98251260f9"));
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
  const uiText = useTranslator();
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
        toast.error(error instanceof Error ? error.message : uiText("ui.your_rsvp_could_not_be_saved_c5849b362c"));
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2" aria-label={uiText("ui.rsvp_1dfe8a8e0c")}>
      {(["going", "interested", "not_going"] as const).map((value) => (
        <Button
          key={value}
          type="button"
          variant={status === value ? "default" : "outline"}
          disabled={disabled || pending}
          onClick={() => update(value)}
        >
          {value === "not_going" ? uiText("ui.not_going_f4d6c49050") : value[0].toUpperCase() + value.slice(1)}
        </Button>
      ))}
    </div>
  );
}

export function CommunityEventOrganizerControls({ eventId }: { eventId: string }) {
  const uiText = useTranslator();
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
        toast.success(result.moderationStatus === "active" ? uiText("ui.event_update_posted_58fc87499b") : uiText("ui.event_update_submitted_for_review_6906594167"));
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : uiText("ui.the_update_could_not_be_posted_11a1f154ab"));
      }
    });
  }

  function cancel() {
    if (!window.confirm(uiText("ui.cancel_this_event_and_notify_going_and_inter_89c49b4519"))) return;
    startTransition(async () => {
      try {
        await responseData(await fetch(`/api/community/events/${eventId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }));
        toast.success(uiText("ui.event_cancelled_and_attendees_notified_1a28723468"));
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : uiText("ui.the_event_could_not_be_cancelled_dfe76c75ad"));
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="event-update" className="text-sm font-bold">{uiText("ui.organizer_update_d5c984092b")}</label>
        <Textarea id="event-update" className="mt-2" rows={3} maxLength={600} value={update} onChange={(event) => setUpdate(event.target.value)} placeholder={uiText("ui.weather_timing_parking_or_other_important_ch_b0ae0887cd")} />
        <Button className="mt-2" type="button" variant="outline" disabled={pending || !update.trim()} onClick={publishUpdate}>{uiText("ui.post_update_fcc4a3125c")}</Button>
      </div>
      <details className="rounded-2xl border border-destructive/20 p-4">
        <summary className="cursor-pointer text-sm font-bold text-destructive">{uiText("ui.cancel_event_e437654aaf")}</summary>
        <label htmlFor="cancel-reason" className="mt-4 block text-xs font-semibold">{uiText("ui.reason_shown_to_attendees_7bc0a22650")}</label>
        <Input id="cancel-reason" className="mt-2" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={uiText("ui.why_is_the_event_cancelled_5515124c1d")} />
        <Button className="mt-3" type="button" variant="destructive" disabled={pending || reason.trim().length < 3} onClick={cancel}>{uiText("ui.cancel_and_notify_attendees_8f12c15fd7")}</Button>
      </details>
    </div>
  );
}
