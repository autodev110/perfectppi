"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, LockKeyhole, MapPin, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_EVENT_TYPES, COMMUNITY_EVENT_TYPE_LABELS, type CommunityEventType } from "@/features/social/events-policy";

import { useTranslator } from "@/lib/i18n/client";

type GroupOption = { id: string; name: string };

export function CommunityEventCreateForm({ groups }: { groups: GroupOption[] }) {
  const uiText = useTranslator();
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
        setError(payload?.error ?? uiText("ui.the_event_could_not_be_created_please_try_ag_1f4d6d9fea"));
        return;
      }
      router.push(`/community/events/${payload.data.id}`);
      router.refresh();
    });
  }

  return (
    <form action={submit} className="space-y-6">
      <section className="grid gap-5 rounded-[1.75rem] bg-surface-container-lowest p-6 shadow-sm ghost-border sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="text-sm font-bold">{uiText("ui.event_title_8ec4602ce4")}</span><Input name="title" required minLength={3} maxLength={120} className="mt-2" placeholder={uiText("ui.saturday_cars_and_coffee_3e71c2d388")} /></label>
        <label><span className="text-sm font-bold">{uiText("ui.type_baaddf70fb")}</span><select name="eventType" className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" defaultValue={COMMUNITY_EVENT_TYPES[0]}>{COMMUNITY_EVENT_TYPES.map((type) => <option key={type} value={type}>{COMMUNITY_EVENT_TYPE_LABELS[type as CommunityEventType]}</option>)}</select></label>
        <label><span className="text-sm font-bold">{uiText("ui.group_optional_5a78603ec3")}</span><select name="groupId" className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">{uiText("ui.community_wide_afcfabde54")}</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label><span className="text-sm font-bold">{uiText("ui.starts_96dbedeca7")}</span><Input name="startsAt" type="datetime-local" required className="mt-2" /></label>
        <label><span className="text-sm font-bold">{uiText("ui.ends_e98982c9f2")}</span><Input name="endsAt" type="datetime-local" required className="mt-2" /></label>
        <label className="sm:col-span-2"><span className="text-sm font-bold">{uiText("ui.description_526e0087cc")}</span><Textarea name="description" required minLength={10} maxLength={500} rows={4} className="mt-2" placeholder={uiText("ui.what_attendees_should_expect_dac07188f6")} /></label>
        <label><span className="text-sm font-bold">{uiText("ui.general_area_e0e1218303")}</span><Input name="generalLocation" required minLength={2} maxLength={120} className="mt-2" placeholder={uiText("ui.midtown_atlanta_82cb3b02c8")} /><span className="mt-1 block text-xs text-on-surface-variant">{uiText("ui.shown_during_discovery_keep_it_approximate_cb6b4baa65")}</span></label>
        <label><span className="text-sm font-bold">{uiText("ui.capacity_optional_44517234f6")}</span><Input name="capacity" type="number" min={2} max={1000} className="mt-2" placeholder={uiText("ui.no_limit_f7fcff0d8f")} /></label>
        <label className="sm:col-span-2"><span className="flex items-center gap-2 text-sm font-bold"><LockKeyhole className="h-4 w-4" />{uiText("ui.exact_attendee_instructions_949b3cb35c")}</span><Textarea name="exactLocation" required minLength={2} maxLength={500} rows={3} className="mt-2" placeholder={uiText("ui.exact_address_entrance_parking_and_check_in__72205c3c29")} /><span className="mt-1 block text-xs text-on-surface-variant">{uiText("ui.only_you_and_members_marked_going_can_see_th_109a86a627")}</span></label>
        <label className="sm:col-span-2"><span className="text-sm font-bold">{uiText("ui.requirements_optional_2d977675e0")}</span><Textarea name="requirements" maxLength={300} rows={2} className="mt-2" placeholder={uiText("ui.helmet_rules_vehicle_requirements_arrival_in_d831b9bc56")} /></label>
      </section>

      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
        <p className="flex items-center gap-2 font-bold"><ShieldAlert className="h-4 w-4" />{uiText("ui.safe_events_only_ee9ba894ad")}</p>
        <p className="mt-1">{uiText("ui.street_racing_takeovers_dangerous_public_roa_d0a28e5493")}</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="flex items-center gap-2 text-xs text-on-surface-variant"><MapPin className="h-4 w-4" />{uiText("ui.times_are_saved_in_utc_and_shown_in_each_mem_31d92d1af1")}</p>
        <Button type="submit" disabled={pending}><CalendarPlus className="mr-2 h-4 w-4" />{pending ? uiText("ui.creating_def70944c9") : uiText("ui.create_event_946cbe2dbb")}</Button>
      </div>
      {error ? <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p> : null}
    </form>
  );
}
