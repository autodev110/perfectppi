"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate, formatMileage } from "@/lib/utils/formatting";
import type { Database } from "@/types/database";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

type MaintenanceEvent = Database["public"]["Tables"]["vehicle_maintenance_events"]["Row"];

function optionalText(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value || null;
}

function optionalNumber(form: FormData, key: string, multiplier = 1) {
  const value = String(form.get(key) ?? "").trim();
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * multiplier) : null;
}

async function requestJson(url: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? uiText("ui.the_change_could_not_be_saved_please_try_aga_9e39290243"));
}

export function VehicleMaintenanceManager({ vehicleId, events }: { vehicleId: string; events: MaintenanceEvent[] }) {
  const uiText = useTranslator();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(formData: FormData) {
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/vehicles/${vehicleId}/maintenance`, "POST", maintenancePayload(formData));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : uiText("ui.the_maintenance_event_could_not_be_saved_40d3ca084d"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(uiText("ui.delete_this_maintenance_event_this_cannot_be_3339e2af57"))) return;
    setError(null);
    try {
      await requestJson(`/api/vehicles/${vehicleId}/maintenance/${id}`, "DELETE");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : uiText("ui.the_maintenance_event_could_not_be_deleted_2a72e9a4b6"));
    }
  }

  return (
    <div className="space-y-6">
      <TimelineIntro title={uiText("ui.maintenance_timeline_b21f65b206")} description={uiText("ui.keep_service_history_and_upcoming_due_dates__3df828a4c0")} />
      <details className="rounded-xl border bg-muted/20 p-4" open={events.length === 0}>
        <summary className="cursor-pointer font-semibold">{uiText("ui.add_maintenance_event_12e4633895")}</summary>
        <form action={create} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={uiText("ui.service_type_4e99c1c6d6")} name="service_type" required maxLength={160} placeholder={uiText("ui.oil_and_filter_change_5b330a957b")} />
            <Field label={uiText("ui.service_date_00cacd13c1")} name="serviced_on" type="date" required />
            <Field label={uiText("ui.mileage_ffe44a0179")} name="mileage" type="number" min={0} />
            <Field label={uiText("ui.provider_472590ae97")} name="provider" maxLength={160} />
            <Field label={uiText("ui.cost_usd_private_b3d6dc39f9")} name="cost" type="number" min={0} step="0.01" />
            <Field label={uiText("ui.next_due_date_5d2e27bf18")} name="next_due_on" type="date" />
            <Field label={uiText("ui.next_due_mileage_b4596cd18f")} name="next_due_mileage" type="number" min={0} />
          </div>
          <TextField label={uiText("ui.parts_and_fluids_182fea71f5")} name="parts_fluids" maxLength={3000} />
          <TextField label={uiText("ui.public_notes_9e7d46d0df")} name="public_notes" maxLength={5000} />
          <TextField label={uiText("ui.private_notes_72ff78fb2f")} name="private_notes" maxLength={5000} />
          <ShareToggle />
          <Button type="submit" disabled={saving}>{saving ? uiText("ui.saving_dc85af8f2b") : uiText("ui.add_maintenance_event_94b8bb81c0")}</Button>
        </form>
      </details>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {events.length === 0 ? <EmptyTimeline label={uiText("ui.no_maintenance_events_yet_d2317ed6d1")} /> : (
        <div className="space-y-3">
          {events.map((event) => (
            <article key={event.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-4">
                <div><p className="font-semibold">{event.service_type}</p><p className="text-sm text-muted-foreground">{formatDate(event.serviced_on)}</p></div>
                <span className="text-xs text-muted-foreground">{event.is_public ? uiText("ui.shared_e3c4b39d6d") : uiText("ui.private_c63eb6720c")}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {event.mileage != null && <span>{formatMileage(event.mileage)}{uiText("ui.mi_3074dbe604")}</span>}
                {event.provider && <span>{event.provider}</span>}
                {event.cost_cents != null && <span>{formatCurrency(event.cost_cents)}{uiText("ui.private_4163413f80")}</span>}
                {event.next_due_on && <span>{uiText("ui.next_due_335850a2e4")}{formatDate(event.next_due_on)}</span>}
                {event.next_due_mileage != null && <span>{uiText("ui.due_at_1933526533")}{formatMileage(event.next_due_mileage)}{uiText("ui.mi_3074dbe604")}</span>}
              </div>
              {event.parts_fluids && <p className="mt-3 whitespace-pre-wrap text-sm"><strong>{uiText("ui.parts_fluids_72c05ce64b")}</strong> {event.parts_fluids}</p>}
              {event.public_notes && <p className="mt-2 whitespace-pre-wrap text-sm">{event.public_notes}</p>}
              {event.private_notes && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm"><strong>{uiText("ui.private_fb10fb0165")}</strong> {event.private_notes}</p>}
              <Button className="mt-3" size="sm" variant="ghost" onClick={() => remove(event.id)}>{uiText("ui.delete_e2d0a54968")}</Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function maintenancePayload(form: FormData) {
  return {
    service_type: String(form.get("service_type") ?? ""), serviced_on: String(form.get("serviced_on") ?? ""),
    mileage: optionalNumber(form, "mileage"), parts_fluids: optionalText(form, "parts_fluids"),
    provider: optionalText(form, "provider"), cost_cents: optionalNumber(form, "cost", 100),
    public_notes: optionalText(form, "public_notes"), private_notes: optionalText(form, "private_notes"),
    next_due_on: optionalText(form, "next_due_on"), next_due_mileage: optionalNumber(form, "next_due_mileage"),
    is_public: form.get("is_public") === "on",
  };
}

function TimelineIntro({ title, description }: { title: string; description: string }) {
  return <div><h2 className="font-heading text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}

function EmptyTimeline({ label }: { label: string }) {
  return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{label}</p>;
}

function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} {...props} /></div>;
}

function TextField({ label, name, maxLength }: { label: string; name: string; maxLength: number }) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Textarea id={name} name={name} maxLength={maxLength} rows={3} /></div>;
}

function ShareToggle() {
  const uiText = useTranslator();
  return <label className="flex items-start gap-3 rounded-xl border p-3"><input className="mt-1" type="checkbox" name="is_public" /><span><span className="block text-sm font-medium">{uiText("ui.show_on_public_vehicle_passport_b34d6835ed")}</span><span className="block text-xs text-muted-foreground">{uiText("ui.only_the_public_fields_above_are_shared_cost_c61f47bd6e")}</span></span></label>;
}
