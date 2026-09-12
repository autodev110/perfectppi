"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, LockKeyhole, MapPin, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_EVENT_TYPES, COMMUNITY_EVENT_TYPE_LABELS, type CommunityEventType } from "@/features/social/events-policy";

type GroupOption = { id: string; name: string };

export function CommunityEventCreateForm({ groups }: { groups: GroupOption[] }) {
  const router = useRouter();
  const clientRequestId = useRef(crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const start = new Date(String(formData.get("startsAt")));
      const end = new Date(String(formData.get("endsAt")));
      const capacity = String(formData.get("capacity") ?? "").trim();
      const groupId = String(formData.get("groupId") ?? "").trim();
      const response = await fetch("/api/community/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: clientRequestId.current,
          title: formData.get("title"),
          description: formData.get("description"),
          eventType: formData.get("eventType"),
          startsAt: Number.isNaN(start.getTime()) ? "" : start.toISOString(),
          endsAt: Number.isNaN(end.getTime()) ? "" : end.toISOString(),
          generalLocation: formData.get("generalLocation"),
          exactLocation: formData.get("exactLocation"),
          capacity: capacity ? Number(capacity) : null,
          requirements: String(formData.get("requirements") ?? "").trim() || null,
          groupId: groupId || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "The event could not be created. Please try again.");
        return;
      }
      router.push(`/community/events/${payload.data.id}`);
      router.refresh();
    });
  }

  return (
    <form action={submit} className="space-y-6">
      <section className="grid gap-5 rounded-[1.75rem] bg-surface-container-lowest p-6 shadow-sm ghost-border sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="text-sm font-bold">Event title</span><Input name="title" required minLength={3} maxLength={120} className="mt-2" placeholder="Saturday cars and coffee" /></label>
        <label><span className="text-sm font-bold">Type</span><select name="eventType" className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" defaultValue={COMMUNITY_EVENT_TYPES[0]}>{COMMUNITY_EVENT_TYPES.map((type) => <option key={type} value={type}>{COMMUNITY_EVENT_TYPE_LABELS[type as CommunityEventType]}</option>)}</select></label>
        <label><span className="text-sm font-bold">Group, optional</span><select name="groupId" className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Community-wide</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label><span className="text-sm font-bold">Starts</span><Input name="startsAt" type="datetime-local" required className="mt-2" /></label>
        <label><span className="text-sm font-bold">Ends</span><Input name="endsAt" type="datetime-local" required className="mt-2" /></label>
        <label className="sm:col-span-2"><span className="text-sm font-bold">Description</span><Textarea name="description" required minLength={10} maxLength={500} rows={4} className="mt-2" placeholder="What attendees should expect" /></label>
        <label><span className="text-sm font-bold">General area</span><Input name="generalLocation" required minLength={2} maxLength={120} className="mt-2" placeholder="Midtown Atlanta" /><span className="mt-1 block text-xs text-on-surface-variant">Shown during discovery. Keep it approximate.</span></label>
        <label><span className="text-sm font-bold">Capacity, optional</span><Input name="capacity" type="number" min={2} max={1000} className="mt-2" placeholder="No limit" /></label>
        <label className="sm:col-span-2"><span className="flex items-center gap-2 text-sm font-bold"><LockKeyhole className="h-4 w-4" />Exact attendee instructions</span><Textarea name="exactLocation" required minLength={2} maxLength={500} rows={3} className="mt-2" placeholder="Exact address, entrance, parking, and check-in details" /><span className="mt-1 block text-xs text-on-surface-variant">Only you and members marked Going can see this.</span></label>
        <label className="sm:col-span-2"><span className="text-sm font-bold">Requirements, optional</span><Textarea name="requirements" maxLength={300} rows={2} className="mt-2" placeholder="Helmet rules, vehicle requirements, arrival instructions" /></label>
      </section>

      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
        <p className="flex items-center gap-2 font-bold"><ShieldAlert className="h-4 w-4" />Safe events only</p>
        <p className="mt-1">Street racing, takeovers, dangerous public-road driving, and live attendee tracking are prohibited. Events are free during this release; PerfectPPI does not collect tickets or payments.</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="flex items-center gap-2 text-xs text-on-surface-variant"><MapPin className="h-4 w-4" />Times are saved in UTC and shown in each member&rsquo;s local time.</p>
        <Button type="submit" disabled={pending}><CalendarPlus className="mr-2 h-4 w-4" />{pending ? "Creating..." : "Create event"}</Button>
      </div>
      {error ? <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p> : null}
    </form>
  );
}
