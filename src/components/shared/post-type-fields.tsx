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

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
  const set = <K extends keyof PostTypeFieldState>(key: K, value: PostTypeFieldState[K]) => onChange({ ...fields, [key]: value });
  const cls = "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm";

  switch (postType) {
    case "build_update":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="build-stage">{uiText("ui.stage_de838855e4")}</Label>
            <select id="build-stage" value={fields.stage} onChange={(e) => set("stage", e.target.value)} className={cls}>
              {BUILD_STAGES.map((stage) => <option key={stage} value={stage}>{BUILD_STAGE_LABELS[stage]}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="build-parts">{uiText("ui.parts_comma_separated_up_to_10_9e46f84f30")}</Label>
            <Input id="build-parts" value={fields.parts} onChange={(e) => set("parts", e.target.value)} placeholder={uiText("ui.coilovers_sway_bar_6ec7d9368e")} maxLength={700} />
          </div>
        </div>
      );
    case "maintenance":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="maint-service">{uiText("ui.service_performed_9d85ff2d26")}</Label>
            <Input id="maint-service" value={fields.service} onChange={(e) => set("service", e.target.value)} placeholder={uiText("ui.oil_and_filter_change_5b330a957b")} maxLength={80} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maint-mileage">{uiText("ui.mileage_optional_a96e5225c2")}</Label>
            <Input id="maint-mileage" type="number" min={0} max={2000000} value={fields.mileage} onChange={(e) => set("mileage", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maint-cost">{uiText("ui.cost_in_usd_optional_22d0fe219d")}</Label>
            <Input id="maint-cost" type="number" min={0} step="0.01" value={fields.cost} onChange={(e) => set("cost", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maint-parts">{uiText("ui.parts_comma_separated_c7a99a7a92")}</Label>
            <Input id="maint-parts" value={fields.parts} onChange={(e) => set("parts", e.target.value)} placeholder={uiText("ui.oem_filter_5w_30_9ddc4d2e33")} maxLength={700} />
          </div>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={fields.diy} onChange={(e) => set("diy", e.target.checked)} className="rounded" />{uiText("ui.did_it_myself_f9d2bc1ee4")}</label>
        </div>
      );
    case "before_after":
      return <p className="text-sm text-muted-foreground">{uiText("ui.add_at_least_two_photos_the_first_is_e44c03eef7")}<strong>{uiText("ui.before_6db7d803e7")}</strong>{uiText("ui.the_second_is_934e8ecfd6")}<strong>{uiText("ui.after_f39592393e")}</strong>{uiText("ui.extra_photos_follow_d9cb45876c")}</p>;
    case "inspection_discussion": {
      const eligible = inspections.filter((inspection) => !vehicleId || inspection.vehicle_id === vehicleId);
      return (
        <div className="space-y-2">
          <Label htmlFor="inspection-id">{uiText("ui.inspection_be272eaa1a")}</Label>
          {eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">{vehicleId ? uiText("ui.no_completed_inspections_for_the_attached_ve_502155a626") : uiText("ui.attach_the_inspected_vehicle_first_5e614d1fcf")}</p>
          ) : (
            <select id="inspection-id" value={fields.inspectionId} onChange={(e) => set("inspectionId", e.target.value)} className={cls} required>
              <option value="">{uiText("ui.choose_an_inspection_d3500704a8")}</option>
              {eligible.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>
                  {inspection.inspection_scope === "dents_tires" ? uiText("ui.dents_tires_6612976b29") : uiText("ui.complete_143b270a32")} · {inspection.status} · {new Date(inspection.updated_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-muted-foreground">{uiText("ui.only_the_inspection_type_scope_status_and_da_a4af43baac")}</p>
        </div>
      );
    }
    case "buying_advice":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="advice-budget">{uiText("ui.budget_in_usd_optional_c2f96a156a")}</Label>
            <Input id="advice-budget" type="number" min={0} step="1" value={fields.budget} onChange={(e) => set("budget", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="advice-makes">{uiText("ui.makes_considered_comma_separated_up_to_5_8ca36678ab")}</Label>
            <Input id="advice-makes" value={fields.makes} onChange={(e) => set("makes", e.target.value)} placeholder={uiText("ui.mazda_toyota_4849ff05d6")} maxLength={250} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="advice-year-min">{uiText("ui.from_year_df00f24a82")}</Label>
            <Input id="advice-year-min" type="number" min={1886} max={2100} value={fields.yearMin} onChange={(e) => set("yearMin", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="advice-year-max">{uiText("ui.to_year_dd45021c5c")}</Label>
            <Input id="advice-year-max" type="number" min={1886} max={2100} value={fields.yearMax} onChange={(e) => set("yearMax", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="advice-use">{uiText("ui.what_it_s_for_optional_0010f3226e")}</Label>
            <Input id="advice-use" value={fields.useCase} onChange={(e) => set("useCase", e.target.value)} placeholder={uiText("ui.daily_driver_with_weekend_track_days_d29910454f")} maxLength={120} />
          </div>
        </div>
      );
    case "poll":
      return (
        <div className="space-y-3">
          <Label>{uiText("ui.options_2_6_ccd1512e35")}</Label>
          {fields.pollOptions.map((option, index) => (
            <div key={index} className="flex gap-2">
              <Input value={option} maxLength={80} placeholder={uiText("ui.option_7bffed9508", { arg0: String(index + 1) })} aria-label={uiText("ui.option_7bffed9508", { arg0: String(index + 1) })}
                onChange={(e) => set("pollOptions", fields.pollOptions.map((entry, i) => (i === index ? e.target.value : entry)))} />
              {fields.pollOptions.length > 2 ? (
                <Button type="button" variant="ghost" size="icon" aria-label={uiText("ui.remove_option_bd765df418")} onClick={() => set("pollOptions", fields.pollOptions.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
              ) : null}
            </div>
          ))}
          {fields.pollOptions.length < 6 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => set("pollOptions", [...fields.pollOptions, ""])}><Plus className="mr-1 h-3.5 w-3.5" />{uiText("ui.add_option_ffbcabd155")}</Button>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="poll-duration">{uiText("ui.runs_for_7b075e3d4c")}</Label>
            <select id="poll-duration" value={fields.pollDuration} onChange={(e) => set("pollDuration", Number(e.target.value) as PostTypeFieldState["pollDuration"])} className={cls}>
              {POLL_DURATIONS.map((hours) => <option key={hours} value={hours}>{POLL_DURATION_LABELS[hours]}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">{uiText("ui.one_vote_per_member_changeable_until_the_pol_fb1f215a39")}</p>
        </div>
      );
    default:
      return null;
  }
}
