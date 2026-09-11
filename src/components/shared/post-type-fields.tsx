"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  BUILD_STAGES,
  BUILD_STAGE_LABELS,
  POLL_DURATIONS,
  POLL_DURATION_LABELS,
  type PostType,
} from "@/lib/community/post-types";
import { Plus, X } from "lucide-react";

export type PostTypeFieldState = {
  stage: string;
  parts: string;
  service: string;
  mileage: string;
  cost: string;
  diy: boolean;
  budget: string;
  yearMin: string;
  yearMax: string;
  makes: string;
  useCase: string;
  inspectionId: string;
  pollOptions: string[];
  pollDuration: (typeof POLL_DURATIONS)[number];
};

export const EMPTY_POST_TYPE_FIELDS: PostTypeFieldState = {
  stage: "in_progress", parts: "", service: "", mileage: "", cost: "", diy: false,
  budget: "", yearMin: "", yearMax: "", makes: "", useCase: "", inspectionId: "",
  pollOptions: ["", ""], pollDuration: 72,
};

const list = (value: string) => value.split(",").map((entry) => entry.trim()).filter(Boolean);
const int = (value: string) => (value.trim() === "" ? undefined : Number(value));
const cents = (value: string) => (value.trim() === "" ? undefined : Math.round(Number(value) * 100));

/** Structured `details` for the server, mirroring `parsePostDetails`. */
export function detailsFromFields(postType: PostType, fields: PostTypeFieldState): Record<string, unknown> {
  switch (postType) {
    case "build_update":
      return { stage: fields.stage, ...(list(fields.parts).length ? { parts: list(fields.parts) } : {}) };
    case "maintenance":
      return {
        service: fields.service.trim(),
        ...(int(fields.mileage) !== undefined ? { mileage: int(fields.mileage) } : {}),
        ...(cents(fields.cost) !== undefined ? { cost_cents: cents(fields.cost) } : {}),
        ...(fields.diy ? { diy: true } : {}),
        ...(list(fields.parts).length ? { parts: list(fields.parts) } : {}),
      };
    case "inspection_discussion":
      return { inspection_request_id: fields.inspectionId };
    case "buying_advice":
      return {
        ...(cents(fields.budget) !== undefined ? { budget_cents: cents(fields.budget) } : {}),
        ...(int(fields.yearMin) !== undefined ? { year_min: int(fields.yearMin) } : {}),
        ...(int(fields.yearMax) !== undefined ? { year_max: int(fields.yearMax) } : {}),
        ...(list(fields.makes).length ? { makes: list(fields.makes) } : {}),
        ...(fields.useCase.trim() ? { use_case: fields.useCase.trim() } : {}),
      };
    case "poll":
      return {
        poll: {
          duration_hours: fields.pollDuration,
          options: fields.pollOptions
            .map((label, index) => ({ key: `opt${index + 1}`, label: label.trim() }))
            .filter((option) => option.label.length > 0),
        },
      };
    default:
      return {};
  }
}

export type InspectionOption = { id: string; vehicle_id: string; ppi_type: string; inspection_scope: string; status: string; updated_at: string };

// Structured fields per post type (plan 14.3 step 5). Purely presentational;
// the server and the database trigger validate again.
export function PostTypeFields({
  postType,
  fields,
  onChange,
  inspections,
  vehicleId,
}: {
  postType: PostType;
  fields: PostTypeFieldState;
  onChange: (next: PostTypeFieldState) => void;
  inspections: InspectionOption[];
  vehicleId: string;
}) {
  const set = <K extends keyof PostTypeFieldState>(key: K, value: PostTypeFieldState[K]) => onChange({ ...fields, [key]: value });
  const cls = "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm";

  switch (postType) {
    case "build_update":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="build-stage">Stage</Label>
            <select id="build-stage" value={fields.stage} onChange={(e) => set("stage", e.target.value)} className={cls}>
              {BUILD_STAGES.map((stage) => <option key={stage} value={stage}>{BUILD_STAGE_LABELS[stage]}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="build-parts">Parts (comma-separated, up to 10)</Label>
            <Input id="build-parts" value={fields.parts} onChange={(e) => set("parts", e.target.value)} placeholder="Coilovers, sway bar" maxLength={700} />
          </div>
        </div>
      );
    case "maintenance":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="maint-service">Service performed *</Label>
            <Input id="maint-service" value={fields.service} onChange={(e) => set("service", e.target.value)} placeholder="Oil and filter change" maxLength={80} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maint-mileage">Mileage (optional)</Label>
            <Input id="maint-mileage" type="number" min={0} max={2000000} value={fields.mileage} onChange={(e) => set("mileage", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maint-cost">Cost in USD (optional)</Label>
            <Input id="maint-cost" type="number" min={0} step="0.01" value={fields.cost} onChange={(e) => set("cost", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maint-parts">Parts (comma-separated)</Label>
            <Input id="maint-parts" value={fields.parts} onChange={(e) => set("parts", e.target.value)} placeholder="OEM filter, 5W-30" maxLength={700} />
          </div>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={fields.diy} onChange={(e) => set("diy", e.target.checked)} className="rounded" />
            Did it myself
          </label>
        </div>
      );
    case "before_after":
      return <p className="text-sm text-muted-foreground">Add at least two photos: the first is <strong>before</strong>, the second is <strong>after</strong>. Extra photos follow.</p>;
    case "inspection_discussion": {
      const eligible = inspections.filter((inspection) => !vehicleId || inspection.vehicle_id === vehicleId);
      return (
        <div className="space-y-2">
          <Label htmlFor="inspection-id">Inspection *</Label>
          {eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">{vehicleId ? "No completed inspections for the attached vehicle yet." : "Attach the inspected vehicle first."}</p>
          ) : (
            <select id="inspection-id" value={fields.inspectionId} onChange={(e) => set("inspectionId", e.target.value)} className={cls} required>
              <option value="">Choose an inspection</option>
              {eligible.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>
                  {inspection.inspection_scope === "dents_tires" ? "Dents & tires" : "Complete"} · {inspection.status} · {new Date(inspection.updated_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-muted-foreground">Only the inspection type, scope, status, and date are shown. Findings stay in your report.</p>
        </div>
      );
    }
    case "buying_advice":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="advice-budget">Budget in USD (optional)</Label>
            <Input id="advice-budget" type="number" min={0} step="1" value={fields.budget} onChange={(e) => set("budget", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="advice-makes">Makes considered (comma-separated, up to 5)</Label>
            <Input id="advice-makes" value={fields.makes} onChange={(e) => set("makes", e.target.value)} placeholder="Mazda, Toyota" maxLength={250} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="advice-year-min">From year</Label>
            <Input id="advice-year-min" type="number" min={1886} max={2100} value={fields.yearMin} onChange={(e) => set("yearMin", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="advice-year-max">To year</Label>
            <Input id="advice-year-max" type="number" min={1886} max={2100} value={fields.yearMax} onChange={(e) => set("yearMax", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="advice-use">What it&apos;s for (optional)</Label>
            <Input id="advice-use" value={fields.useCase} onChange={(e) => set("useCase", e.target.value)} placeholder="Daily driver with weekend track days" maxLength={120} />
          </div>
        </div>
      );
    case "poll":
      return (
        <div className="space-y-3">
          <Label>Options (2–6)</Label>
          {fields.pollOptions.map((option, index) => (
            <div key={index} className="flex gap-2">
              <Input value={option} maxLength={80} placeholder={`Option ${index + 1}`} aria-label={`Option ${index + 1}`}
                onChange={(e) => set("pollOptions", fields.pollOptions.map((entry, i) => (i === index ? e.target.value : entry)))} />
              {fields.pollOptions.length > 2 ? (
                <Button type="button" variant="ghost" size="icon" aria-label="Remove option" onClick={() => set("pollOptions", fields.pollOptions.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
              ) : null}
            </div>
          ))}
          {fields.pollOptions.length < 6 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => set("pollOptions", [...fields.pollOptions, ""])}><Plus className="mr-1 h-3.5 w-3.5" />Add option</Button>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="poll-duration">Runs for</Label>
            <select id="poll-duration" value={fields.pollDuration} onChange={(e) => set("pollDuration", Number(e.target.value) as PostTypeFieldState["pollDuration"])} className={cls}>
              {POLL_DURATIONS.map((hours) => <option key={hours} value={hours}>{POLL_DURATION_LABELS[hours]}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">One vote per member, changeable until the poll closes. Votes are private; only counts are shown, after voting or at close. Options cannot change once someone has voted.</p>
        </div>
      );
    default:
      return null;
  }
}
