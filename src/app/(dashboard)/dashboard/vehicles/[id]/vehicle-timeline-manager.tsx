"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate, formatMileage } from "@/lib/utils/formatting";
import type { Database } from "@/types/database";

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
  if (!response.ok) throw new Error(payload?.error ?? "The change could not be saved. Please try again.");
}

export function VehicleMaintenanceManager({ vehicleId, events }: { vehicleId: string; events: MaintenanceEvent[] }) {
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
      setError(cause instanceof Error ? cause.message : "The maintenance event could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this maintenance event? This cannot be undone.")) return;
    setError(null);
    try {
      await requestJson(`/api/vehicles/${vehicleId}/maintenance/${id}`, "DELETE");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The maintenance event could not be deleted.");
    }
  }

  return (
    <div className="space-y-6">
      <TimelineIntro title="Maintenance Timeline" description="Keep service history and upcoming due dates together. Costs and private notes are never shared." />
      <details className="rounded-xl border bg-muted/20 p-4" open={events.length === 0}>
        <summary className="cursor-pointer font-semibold">Add maintenance event</summary>
        <form action={create} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service type *" name="service_type" required maxLength={160} placeholder="Oil and filter change" />
            <Field label="Service date *" name="serviced_on" type="date" required />
            <Field label="Mileage" name="mileage" type="number" min={0} />
            <Field label="Provider" name="provider" maxLength={160} />
            <Field label="Cost (USD, private)" name="cost" type="number" min={0} step="0.01" />
            <Field label="Next due date" name="next_due_on" type="date" />
            <Field label="Next due mileage" name="next_due_mileage" type="number" min={0} />
          </div>
          <TextField label="Parts and fluids" name="parts_fluids" maxLength={3000} />
          <TextField label="Public notes" name="public_notes" maxLength={5000} />
          <TextField label="Private notes" name="private_notes" maxLength={5000} />
          <ShareToggle />
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add Maintenance Event"}</Button>
        </form>
      </details>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {events.length === 0 ? <EmptyTimeline label="No maintenance events yet." /> : (
        <div className="space-y-3">
          {events.map((event) => (
            <article key={event.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-4">
                <div><p className="font-semibold">{event.service_type}</p><p className="text-sm text-muted-foreground">{formatDate(event.serviced_on)}</p></div>
                <span className="text-xs text-muted-foreground">{event.is_public ? "Shared" : "Private"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {event.mileage != null && <span>{formatMileage(event.mileage)} mi</span>}
                {event.provider && <span>{event.provider}</span>}
                {event.cost_cents != null && <span>{formatCurrency(event.cost_cents)} private</span>}
                {event.next_due_on && <span>Next due {formatDate(event.next_due_on)}</span>}
                {event.next_due_mileage != null && <span>Due at {formatMileage(event.next_due_mileage)} mi</span>}
              </div>
              {event.parts_fluids && <p className="mt-3 whitespace-pre-wrap text-sm"><strong>Parts/fluids:</strong> {event.parts_fluids}</p>}
              {event.public_notes && <p className="mt-2 whitespace-pre-wrap text-sm">{event.public_notes}</p>}
              {event.private_notes && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm"><strong>Private:</strong> {event.private_notes}</p>}
              <Button className="mt-3" size="sm" variant="ghost" onClick={() => remove(event.id)}>Delete</Button>
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
  return <label className="flex items-start gap-3 rounded-xl border p-3"><input className="mt-1" type="checkbox" name="is_public" /><span><span className="block text-sm font-medium">Show on public Vehicle Passport</span><span className="block text-xs text-muted-foreground">Only the public fields above are shared. Cost and private notes remain private.</span></span></label>;
}
