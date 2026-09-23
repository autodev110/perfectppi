import type { InspectionScope } from "@/types/enums";
import { CORNERS, PANEL_LABELS, type BodyPanel, type Corner } from "../../../features/ppi/inspection-schema.ts";
import { CHECKLIST_ROWS, type DisplayStatus, type Finding } from "../../../features/ppi/inspection-rules.ts";
import { CERTIFICATION_TEXT, HISTORICAL_CERTIFICATION_NOTE } from "../../../features/ppi/certification.ts";
import type { InspectionReportV2 } from "../../../features/ppi/inspection-report.ts";

// ============================================================================
// InspectionReportV2 → ReportViewModelV1: the only place facts become display
// strings for the PDF. It formats; it never infers a missing fact.
// ============================================================================

export type VmStatus = DisplayStatus | "unavailable";

export interface TireViewModel {
  status: VmStatus;
  partial: boolean;
  tread: string;
  pressure: string;
  size: string;
  service: string;
  dot: string;
  identity_short: string;
  cracking: string;
  cracking_status: VmStatus;
  wear: string;
  wear_status: VmStatus;
  damage_short: string;
  fitment: string;
}

export interface ReportViewModel {
  scope: InspectionScope;
  sample: boolean;
  report_ref: string;
  vehicle: string;
  vin: string;
  mileage: string;
  date: string;
  inspector: string;
  certified: boolean;
  certification_text: string;
  certification_time: string;
  placard_short: string;
  checklist: { heading: string; rows: { row_id: string; label: string; status: VmStatus; partial: boolean }[] }[];
  tires: Record<Corner, TireViewModel>;
  body: { ref: string; panel: string; status: VmStatus; text: string }[];
  markers: { ref: string; x: number; y: number; status: VmStatus }[];
  priority: string;
  priority_status: VmStatus;
  overview: { title: string; status: VmStatus; observation: string; action: string }[];
  limitations: string;
  detail_url: string | null;
  detail_label: string;
}

const STATUS_FROM_ACTION: Record<string, VmStatus> = {
  urgent: "urgent",
  service_recommended: "service",
  monitor: "monitor",
  none: "checked",
};

export function formatReportDate(iso: string | null | undefined, timeZone: string, withTime = false): string {
  if (!iso) return "Not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } : {}),
    timeZone,
  }).format(date);
}

export function reportReference(submissionId: string, outputVersion: number): string {
  return `PPI-${submissionId.replace(/-/g, "").slice(0, 8).toUpperCase()} / v${outputVersion}`;
}

function panelMarkers(
  findings: Finding[],
  positions: Record<string, [number, number]>,
  collisionStep: number,
): ReportViewModel["markers"] {
  const used: [number, number][] = [];
  return findings
    .filter((finding) => finding.ref.startsWith("B"))
    .map((finding) => {
      const panel = finding.panels[0] as BodyPanel | undefined;
      const [x, initialY] = finding.marker ? [finding.marker.x, finding.marker.y] : positions[panel ?? "other_body_panel"] ?? [0.5, 0.66];
      let y = initialY;
      // Keep each marker on its own panel; nudge along the panel instead of
      // moving it to another panel when two findings share a location.
      let guard = 0;
      while (used.some(([ux, uy]) => Math.abs(ux - x) < 0.06 && Math.abs(uy - y) < 0.05) && guard < 6) {
        y = Math.min(0.97, y + collisionStep);
        guard += 1;
      }
      used.push([x, y]);
      return { ref: finding.ref.slice(1), x, y, status: STATUS_FROM_ACTION[finding.action] ?? "unknown" };
    });
}

function placardShort(report: InspectionReportV2): string {
  const placard = report.facts.placard;
  if (placard.observation_state !== "observed" || !placard.value) {
    return placard.observation_state === "not_recorded" ? "Not recorded" : "Unavailable - fitment not verified";
  }
  const unit = (axle: { unit?: string }) => (axle.unit === "kpa" ? "kPa" : "psi");
  const front = placard.value.front;
  const rear = placard.value.rear;
  const sameSize = (front.size ?? "") === (rear.size ?? "");
  const samePressure = (front.pressure ?? "") === (rear.pressure ?? "");
  const sizes = sameSize ? front.size ?? "-" : `F ${front.size ?? "-"} / R ${rear.size ?? "-"}`;
  const pressures = samePressure
    ? `F/R ${front.pressure ?? "-"} ${unit(front)} cold`
    : `F ${front.pressure ?? "-"} / R ${rear.pressure ?? "-"} ${unit(front)} cold`;
  return `${sizes} | ${pressures}`;
}

export function buildReportViewModel(
  report: InspectionReportV2,
  options: { submissionId: string; outputVersion: number; detailUrl?: string | null; sample?: boolean; diagram: { panel_markers: Record<string, [number, number]>; marker_collision_step: number } },
): ReportViewModel {
  const { facts, assessment } = report;
  const vehicle = [facts.vehicle.year, facts.vehicle.make, facts.vehicle.model, facts.vehicle.trim].filter(Boolean).join(" ") || "Vehicle not recorded";
  const tz = report.time_zone;

  const tires = Object.fromEntries(
    CORNERS.map((corner) => {
      const card = assessment.tires[corner];
      const service = card.load_speed;
      return [
        corner,
        {
          status: card.status,
          partial: card.partial,
          tread: card.tread,
          pressure: card.pressure,
          size: card.size,
          service,
          dot: card.dot,
          identity_short: `${service} / ${card.dot}`,
          cracking: card.cracking,
          cracking_status: card.cracking_status,
          wear: card.wear,
          wear_status: card.wear_status,
          damage_short: `${card.tire_damage} / ${card.wheel_damage}`,
          fitment: card.fitment_label,
        } satisfies TireViewModel,
      ];
    }),
  ) as Record<Corner, TireViewModel>;

  const rowsById = new Map(assessment.checklist.map((row) => [row.row_id, row]));
  const groups: ReportViewModel["checklist"] = [];
  for (const definition of CHECKLIST_ROWS) {
    let group = groups.find((entry) => entry.heading === definition.group);
    if (!group) {
      group = { heading: definition.group, rows: [] };
      groups.push(group);
    }
    const row = rowsById.get(definition.id);
    group.rows.push({
      row_id: definition.id,
      label: definition.label,
      status: row?.status ?? "not_inspected",
      // "*" marks a row whose constituent checks were not all completed.
      partial: row?.inspection_completeness === "partial",
    });
  }

  const bodyFindings = assessment.findings.filter((finding) => finding.ref.startsWith("B"));
  const body = bodyFindings.map((finding) => ({
    ref: finding.ref.slice(1),
    panel: finding.panels[0] ? PANEL_LABELS[finding.panels[0]] : "Location not recorded",
    status: (finding.action === "none" ? "unknown" : STATUS_FROM_ACTION[finding.action]) as VmStatus,
    text: finding.observation,
  }));

  const certification = facts.certification;
  const inspectorRole = facts.inspector.mode === "self" ? "Self-inspector" : "Technician";
  const urgent = assessment.findings.some((finding) => finding.action === "urgent");

  return {
    scope: report.scope,
    sample: Boolean(options.sample),
    report_ref: reportReference(options.submissionId, options.outputVersion),
    vehicle,
    vin: facts.vehicle.vin ?? "Not recorded",
    mileage: typeof facts.vehicle.mileage === "number" ? `${facts.vehicle.mileage.toLocaleString("en-US")} ${facts.vehicle.mileage_unit}` : "Not recorded",
    date: formatReportDate(facts.submission.submitted_at, tz),
    inspector: `${facts.inspector.name?.trim() || "Inspector"} | ${inspectorRole}`,
    certified: Boolean(certification),
    certification_text: CERTIFICATION_TEXT,
    certification_time: certification
      ? `Certified ${formatReportDate(certification.certified_at, tz, true)}`
      : HISTORICAL_CERTIFICATION_NOTE,
    placard_short: placardShort(report),
    checklist: groups,
    tires,
    body,
    markers: panelMarkers(bodyFindings, options.diagram.panel_markers, options.diagram.marker_collision_step),
    priority: report.priority_actions,
    priority_status: urgent ? "urgent" : "checked",
    overview: report.overview.map((block) => ({
      title: block.title,
      status: block.status,
      observation: block.observation,
      action: block.next_step,
    })),
    limitations: report.scope_and_evidence,
    detail_url: options.detailUrl ?? null,
    detail_label: "View full findings and photo evidence",
  };
}

/** A blank view model for the reusable templates. */
export function blankViewModel(scope: InspectionScope): ReportViewModel {
  const emptyTire: TireViewModel = {
    status: "not_inspected",
    partial: false,
    tread: "",
    pressure: "",
    size: "",
    service: "",
    dot: "",
    identity_short: "",
    cracking: "",
    cracking_status: "not_inspected",
    wear: "",
    wear_status: "not_inspected",
    damage_short: "",
    fitment: "",
  };
  const groups: ReportViewModel["checklist"] = [];
  for (const definition of CHECKLIST_ROWS) {
    let group = groups.find((entry) => entry.heading === definition.group);
    if (!group) {
      group = { heading: definition.group, rows: [] };
      groups.push(group);
    }
    group.rows.push({ row_id: definition.id, label: definition.label, status: "not_inspected", partial: false });
  }
  return {
    scope,
    sample: false,
    report_ref: "",
    vehicle: "",
    vin: "",
    mileage: "",
    date: "",
    inspector: "",
    certified: false,
    certification_text: CERTIFICATION_TEXT,
    certification_time: "",
    placard_short: "",
    checklist: groups,
    tires: Object.fromEntries(CORNERS.map((corner) => [corner, emptyTire])) as Record<Corner, TireViewModel>,
    body: [],
    markers: [],
    priority: "",
    priority_status: "checked",
    overview: [],
    limitations: "",
    detail_url: null,
    detail_label: "",
  };
}
