import type { InspectionScope } from "@/types/enums";
import { CORNERS, CORNER_LABELS, type Corner } from "../../../features/ppi/inspection-schema.ts";
import { LayoutOverflowError, ReportCanvas, loadLayoutAssets, type StatusName } from "./canvas.ts";
import { blankViewModel, type ReportViewModel, type TireViewModel } from "./view-model.ts";

// ============================================================================
// Two-page inspection report: page 1 "Visual vehicle inspection report", page 2
// "Inspection overview". Exactly two pages for both scopes; overflow raises
// LayoutOverflowError so the pipeline can hold the output for review instead
// of printing clipped text or a third page.
// ============================================================================

export { LayoutOverflowError };

const STATUS_LABEL: Record<string, string> = {
  checked: "Checked",
  monitor: "Monitor",
  service: "Service",
  urgent: "Urgent",
  unknown: "Unknown",
  not_inspected: "Not inspected",
  unavailable: "Unavailable",
  not_applicable: "N/A",
  outside_scope: "Outside scope",
};

const SHORT_STATUS: Record<string, string> = {
  checked: "OK",
  monitor: "Watch",
  service: "Service",
  urgent: "Urgent",
  unknown: "Unknown",
  not_applicable: "N/A",
  not_inspected: "Not insp.",
  outside_scope: "Out of scope",
};

const CORNER_TITLES: [Corner, string][] = CORNERS.map((corner) => [corner, CORNER_LABELS[corner].toUpperCase()]);

function scopeBadge(scope: InspectionScope) {
  return scope === "complete" ? "COMPLETE INSPECTION" : "DENTS & TIRES";
}

function header(c: ReportCanvas, vm: ReportViewModel, title: string, blank: boolean) {
  const T = c.spec.typography;
  const G = c.spec.geometry as unknown as Record<string, number> & { metadata_fields: Record<string, { x: number; y: number; width: number }> };
  c.text("PERFECTPPI", c.M, G.brand_y, { size: T.brand_pt, bold: true, color: c.C.navy });
  const badge = scopeBadge(vm.scope);
  const badgeWidth = c.width(badge, T.scope_badge_pt, true) + G.badge_padding;
  c.rect(c.W - c.M - badgeWidth, G.badge_y, badgeWidth, G.badge_height, { fill: c.C.navy, radius: 3 });
  c.text(badge, c.W - c.M - badgeWidth / 2, G.badge_y + 6, { size: T.scope_badge_pt, bold: true, color: c.C.white, align: "center" });
  c.text(title, c.M, G.header_title_y, { size: T.title_pt, bold: true, color: c.C.navy, maxWidth: c.W - 2 * c.M });
  const subtitle = title.startsWith("Visual")
    ? "Findings at the time of inspection. See the overview for priorities and next steps."
    : "Condition, context and practical next steps, organized by inspection category.";
  c.text(subtitle, c.M, G.subtitle_y, { size: T.subtitle_pt, color: c.C.muted });
  c.rect(c.M, G.metadata_y, c.W - 2 * c.M, G.metadata_height, { fill: c.C.paper, radius: 4 });
  const fields: [string, string, string][] = [
    ["vehicle", "Vehicle", vm.vehicle],
    ["report_reference", "Report reference", vm.report_ref],
    ["vin", "VIN", vm.vin],
    ["odometer", "Odometer", vm.mileage],
    ["inspection_date", "Inspection date", vm.date],
  ];
  for (const [key, label, value] of fields) {
    const geometry = G.metadata_fields[key];
    c.text(label.toUpperCase(), geometry.x, geometry.y, { size: T.metadata_label_pt, bold: true, color: c.C.muted });
    if (blank) {
      c.line(geometry.x, geometry.y + 20, geometry.x + geometry.width, geometry.y + 20);
      continue;
    }
    // Long identity strings step down to the reviewed minimum, then wrap to a
    // second line inside the metadata panel; nothing is silently cut.
    const sizes = [T.metadata_value_pt, 8.4, T.metadata_value_min_pt];
    const size = c.fitSize(value, sizes, geometry.width, true);
    if (size !== null) {
      c.text(value, geometry.x, geometry.y + 10, { size, bold: true, maxWidth: geometry.width });
    } else {
      c.paragraph(value, geometry.x, geometry.y + 9, geometry.width, 18, { size: T.metadata_value_min_pt, leading: 8.5, bold: true, region: `header.${key}` });
    }
  }
}

function legend(c: ReportCanvas) {
  const T = c.spec.typography;
  const G = c.spec.geometry as unknown as Record<string, number> & { legend_items_x: number[] };
  const items: [StatusName, string][] = [
    ["checked", "Checked"],
    ["monitor", "Monitor"],
    ["service", "Service recommended"],
    ["urgent", "Urgent"],
    ["unknown", "Unknown / not inspected"],
  ];
  items.forEach(([status, label], index) => c.status(status, G.legend_items_x[index], G.legend_y, { label, size: T.legend_pt }));
  c.text("N/A = not applicable. A missing or unavailable check is never marked as checked.", c.M, G.legend_y + 15, { size: T.legend_note_pt, color: c.C.muted });
}

function footer(c: ReportCanvas, vm: ReportViewModel, page: number, total: number, blank: boolean, appendix = false) {
  const T = c.spec.typography;
  const G = c.spec.geometry as unknown as Record<string, number>;
  c.line(c.M, G.footer_rule_y, c.W - c.M, G.footer_rule_y);
  const label = blank ? "BLANK TEMPLATE" : vm.sample ? "FICTIONAL EXAMPLE - NOT AN INSPECTION RECORD" : vm.report_ref;
  c.text(label, c.M, G.footer_y, { size: T.footer_pt, bold: true, color: c.C.muted });
  c.text(`${appendix ? "APPENDIX | " : ""}${page} / ${total}`, c.W - c.M, G.footer_y, { size: T.footer_page_pt, bold: true, color: c.C.muted, align: "right" });
}

function section(c: ReportCanvas, title: string, x: number, y: number, w: number, note?: string) {
  const T = c.spec.typography;
  c.text(title, x, y, { size: T.section_pt, bold: true, color: c.C.navy });
  if (note) c.text(note, x + w, y + 0.5, { size: T.section_note_pt, color: c.C.muted, align: "right" });
  c.line(x, y + 16, x + w, y + 16, c.C.navy, 0.8);
}

function certification(c: ReportCanvas, vm: ReportViewModel, blank: boolean) {
  const T = c.spec.typography;
  const y = (c.spec.geometry as unknown as Record<string, number>).certification_y;
  c.line(c.M, y - 9, c.W - c.M, y - 9, c.C.navy, 0.8);
  c.text("INSPECTOR CERTIFICATION", c.M, y, { size: T.certification_heading_pt, bold: true, color: c.C.navy });
  c.rect(c.M, y + 17, 7, 7, { stroke: c.C.muted });
  if (!blank && vm.certified) {
    c.line(c.M + 1.1, y + 20.5, c.M + 3, y + 22.5, c.C.navy, 0.9);
    c.line(c.M + 3, y + 22.5, c.M + 6, y + 18.5, c.C.navy, 0.9);
  }
  c.paragraph(vm.certification_text, c.M + 14, y + 15, c.W - 2 * c.M - 14, 12, { size: T.certification_text_pt, region: "certification" });
  if (blank) {
    c.text("Inspector / role:", c.M, y + 34, { size: 8.1, color: c.C.muted });
    c.line(106, y + 43, 330, y + 43);
    c.text("Date / time:", 352, y + 34, { size: 8.1, color: c.C.muted });
    c.line(404, y + 43, c.W - c.M, y + 43);
    return;
  }
  const nameSize = c.fitSize(vm.inspector, [T.certification_name_pt, 7.4], 305, true) ?? T.certification_name_pt;
  c.text(vm.inspector, c.M, y + 34, { size: nameSize, bold: true, maxWidth: 305 });
  c.text(vm.certification_time, c.W - c.M, y + 34, { size: T.certification_time_pt, color: c.C.muted, align: "right", maxWidth: 230 });
}

function tireCard(c: ReportCanvas, tire: TireViewModel, label: string, x: number, y: number, w: number, h: number, blank: boolean, compact: boolean) {
  const T = c.spec.typography;
  c.rect(x, y, w, h, { fill: c.C.white, stroke: c.C.line, radius: 4 });
  c.rect(x, y, w, 21, { fill: c.C.paper, radius: 4 });
  c.text(label, x + 9, y + 6, { size: T.tire_label_pt, bold: true, color: c.C.navy });
  if (!blank) {
    c.status(tire.status, x + w - 55, y + 6, { label: `${STATUS_LABEL[tire.status] ?? tire.status}${tire.partial ? "*" : ""}`, size: T.tire_status_pt });
  }
  if (compact) {
    const rows: [string, string, StatusName | null][] = [
      ["Tread", tire.tread, null],
      ["Pressure", tire.pressure, null],
      ["Size", tire.size, null],
      ["Load / speed", tire.service, null],
      ["DOT", tire.dot, null],
      ["Cracking", tire.cracking, tire.cracking_status],
      ["Wear", tire.wear, tire.wear_status],
      ["Tire / rim", tire.damage_short, null],
      ["Fitment", tire.fitment, null],
    ];
    let yy = y + 28;
    const step = (c.spec.geometry.complete as Record<string, number>).tire_row_step;
    for (const [rowLabel, value, status] of rows) {
      if (blank) {
        c.text(rowLabel, x + 8, yy, { size: 7.2, color: c.C.muted });
        c.line(x + 64, yy + 8, x + w - 8, yy + 8);
      } else {
        const text = `${rowLabel}: ${value}`;
        const maxWidth = w - (status ? 26 : 16);
        const preferred = rowLabel === "Tire / rim" ? T.compact_damage_pt : T.compact_measurement_pt;
        const size = c.fitSize(text, [preferred, 7.2, T.small_label_min_pt], maxWidth);
        if (size === null) throw new LayoutOverflowError(`Tire card value too long: ${text}`, `tire.${label}`);
        c.text(text, x + 8, yy, { size, maxWidth });
        if (status) c.status(status, x + w - 12, yy);
      }
      yy += step;
    }
    return;
  }
  const rows: [string, keyof TireViewModel, StatusName | null][] = [
    ["Tread", "tread", null],
    ["Pressure", "pressure", null],
    ["Tire size", "size", null],
    ["Load / speed / DOT", "identity_short", null],
    ["Cracking", "cracking", tire.cracking_status],
    ["Uneven wear", "wear", tire.wear_status],
    ["Tire / rim damage", "damage_short", null],
    ["Placard fitment", "fitment", null],
  ];
  const geometry = c.spec.geometry.dents_tires as Record<string, number>;
  let yy = y + 31;
  for (const [rowLabel, key, status] of rows) {
    c.text(rowLabel, x + 10, yy, { size: T.expanded_label_pt, color: c.C.muted });
    if (blank) {
      c.line(x + geometry.tire_value_x, yy + 8, x + w - 10, yy + 8);
    } else {
      const value = String(tire[key] ?? "");
      const maxWidth = w - geometry.tire_value_x - (status ? 26 : 10);
      const size = c.fitSize(value, [T.expanded_value_pt, 7.4, T.small_label_min_pt], maxWidth, key === "tread");
      if (size === null) throw new LayoutOverflowError(`Tire card value too long: ${value}`, `tire.${label}`);
      c.text(value, x + geometry.tire_value_x, yy, { size, bold: key === "tread", maxWidth });
      if (status) c.status(status, x + w - 17, yy);
    }
    yy += geometry.tire_row_step;
  }
}

/** Original simplified top-view silhouette; left/right are the vehicle's. */
function carTop(c: ReportCanvas, x: number, y: number, w: number, h: number, markers: ReportViewModel["markers"]) {
  const bodyX = x + w * 0.23;
  const bodyW = w * 0.54;
  c.rect(bodyX, y + 5, bodyW, h - 10, { fill: c.C.white, stroke: c.C.muted, radius: Math.min(12, w * 0.13) });
  for (const wheelX of [x + w * 0.11, x + w * 0.78]) {
    for (const wheelY of [y + h * 0.19, y + h * 0.66]) {
      c.rect(wheelX, wheelY, w * 0.11, h * 0.18, { fill: c.C.paper, stroke: c.C.muted, radius: 2 });
    }
  }
  c.rect(x + w * 0.3, y + h * 0.32, w * 0.4, h * 0.32, { fill: c.C.paper, stroke: c.C.muted, radius: 4 });
  for (const fraction of [0.2, 0.28, 0.69, 0.78]) {
    c.line(bodyX + 3, y + h * fraction, bodyX + bodyW - 3, y + h * fraction, c.C.line);
  }
  c.line(x + w * 0.5, y - 4, x + w * 0.5, y + 1, c.C.muted);
  c.text("FRONT", x + w * 0.5, y - 13, { size: 6.5, bold: true, color: c.C.muted, align: "center" });
  const radius = c.spec.diagram.marker_radius;
  for (const marker of markers) {
    const mx = x + w * marker.x;
    const my = y + h * marker.y;
    c.circle(mx, my, radius, { fill: c.statusColor(marker.status === "checked" ? "unknown" : marker.status) });
    c.text(marker.ref, mx, my - 3.5, { size: marker.ref.length > 1 ? 6 : 7, bold: true, color: c.C.white, align: "center" });
  }
}

function damageBlock(c: ReportCanvas, vm: ReportViewModel, x: number, y: number, w: number, h: number, blank: boolean, wide: boolean) {
  const T = c.spec.typography;
  const budget = c.spec.content_budgets.body_note_height_pt as number;
  section(c, "BODY DAMAGE MAP", x, y, w);
  const mapWidth = (wide ? c.spec.geometry.dents_tires : c.spec.geometry.complete as Record<string, number>).map_width as number;
  carTop(c, x + 3, y + 39, mapWidth, h - 46, blank ? [] : vm.markers);
  const dx = x + mapWidth + 13;
  const dw = w - mapWidth - 13;
  if (blank) {
    c.text("MARK / PANEL / OBSERVATION", dx, y + 27, { size: 6.9, bold: true, color: c.C.muted });
    for (let i = 0; i < 3; i += 1) c.line(dx, y + 51 + i * 22, x + w, y + 51 + i * 22);
  } else {
    const bottom = y + h - (wide ? 17 : 0);
    let yy = y + 27;
    if (vm.body.length === 0) {
      c.paragraph(
        vm.scope === "dents_tires"
          ? "No body damage was recorded on the inspected panels."
          : "No body panel damage was recorded.",
        dx,
        yy,
        dw,
        24,
        { size: T.body_item_pt, leading: T.body_item_leading_pt, color: c.C.muted, region: "body" },
      );
    }
    for (let index = 0; index < vm.body.length; index += 1) {
      const item = vm.body[index];
      const remaining = vm.body.length - index;
      const itemHeight = Math.max(36, c.paragraphHeight(item.text, dw - 11, T.body_item_pt, T.body_item_leading_pt) + 19);
      // Reserve one line for the truthful "more findings" reference.
      const reserve = remaining > 1 ? 12 : 0;
      if (yy + Math.min(itemHeight, budget + 19) + reserve > bottom) {
        c.text(`+${remaining} more body finding${remaining === 1 ? "" : "s"} in the full findings.`, dx, yy, { size: 7.4, bold: true, color: c.C.muted, maxWidth: dw });
        break;
      }
      c.status(item.status, dx, yy, { label: `${item.ref}  ${item.panel}`, size: T.body_item_pt });
      const text = c.paragraphHeight(item.text, dw - 11, T.body_item_pt, T.body_item_leading_pt) > budget
        ? shortenToFit(c, item.text, dw - 11, T.body_item_pt, T.body_item_leading_pt, budget)
        : item.text;
      const used = c.paragraph(text, dx + 11, yy + 13, dw - 11, budget, { size: T.body_item_pt, leading: T.body_item_leading_pt, region: "body" });
      yy += Math.max(36, used + 19);
    }
  }
  if (wide) {
    c.text("Vehicle left/right is viewed from the driver's seat. Bumpers outside this scope.", dx, y + h - 12, { size: 7.2, color: c.C.muted, maxWidth: dw });
  }
}

/** Keeps whole sentences that fit, ending with a pointer to the full note. */
function shortenToFit(c: ReportCanvas, text: string, width: number, size: number, leading: number, budget: number): string {
  const sentences = text.split(/(?<=\.)\s+/);
  for (let count = sentences.length - 1; count >= 1; count -= 1) {
    const candidate = `${sentences.slice(0, count).join(" ")} (Full note in the findings.)`;
    if (c.paragraphHeight(candidate, width, size, leading) <= budget) return candidate;
  }
  return "Recorded note is in the full findings.";
}

export function drawVisualPage(c: ReportCanvas, vm: ReportViewModel, blank: boolean, totalPages: number) {
  c.addPage();
  header(c, vm, "Visual vehicle inspection report", blank);
  legend(c);
  const T = c.spec.typography;
  const G = c.spec.geometry as unknown as Record<string, number>;
  if (vm.scope === "complete") {
    const geometry = c.spec.geometry.complete as Record<string, number>;
    const x = geometry.checklist_x;
    const w = geometry.checklist_width;
    let y = G.content_top;
    for (const group of vm.checklist) {
      c.rect(x, y, w, geometry.checklist_heading_height, { fill: c.C.navy, radius: 2 });
      c.text(group.heading, x + 7, y + 4, { size: T.checklist_heading_pt, bold: true, color: c.C.white });
      y += 18;
      for (const row of group.rows) {
        if (!blank) c.status(row.status, x + 2, y + 2);
        c.text(row.label, x + (blank ? 3 : 15), y + 1, { size: T.checklist_pt, maxWidth: w - 74 });
        if (blank) {
          const blanks: [number, StatusName][] = [[w - 45, "checked"], [w - 32, "monitor"], [w - 19, "service"], [w - 6, "urgent"]];
          for (const [offset, status] of blanks) c.circle(x + offset, y + 5, 2.7, { stroke: c.statusColor(status), strokeWidth: 0.9 });
        } else {
          const short = `${SHORT_STATUS[row.status] ?? "Partial"}${row.partial ? "*" : ""}`;
          c.text(short, x + w - 2, y + 1, { size: T.checklist_status_pt, bold: true, color: c.statusColor(row.status === "not_inspected" || row.status === "not_applicable" || row.status === "outside_scope" ? "unknown" : row.status), align: "right" });
        }
        c.line(x, y + 12, x + w, y + 12);
        y += geometry.checklist_row_height;
      }
      y += 2;
    }
    c.text("* Partial: see uninspected items in the overview.", x, y + 1, { size: 7.2, color: c.C.muted });
    const rightX = geometry.right_x;
    const rightW = geometry.right_width;
    section(c, "TIRES & WHEELS", rightX, G.content_top, rightW);
    c.text("Placard:", rightX, geometry.placard_y, { size: 7.5, bold: true, color: c.C.muted });
    if (blank) c.line(rightX + 39, geometry.placard_y + 7, rightX + rightW, geometry.placard_y + 7);
    else c.text(vm.placard_short, rightX + 39, geometry.placard_y, { size: c.fitSize(vm.placard_short, [7.5, 6.8], rightW - 39) ?? 6.8, maxWidth: rightW - 39 });
    const cardWidth = (rightW - geometry.tire_gap) / 2;
    CORNER_TITLES.forEach(([corner, title], index) => {
      tireCard(
        c,
        vm.tires[corner],
        title,
        rightX + (index % 2) * (cardWidth + geometry.tire_gap),
        geometry.tire_y + Math.floor(index / 2) * (geometry.tire_card_height + geometry.tire_gap),
        cardWidth,
        geometry.tire_card_height,
        blank,
        true,
      );
    });
    damageBlock(c, vm, rightX, geometry.damage_y, rightW, geometry.damage_height, blank, false);
  } else {
    const geometry = c.spec.geometry.dents_tires as Record<string, number>;
    section(c, "TIRES & WHEELS", c.M, G.content_top, c.W - 2 * c.M, "Four corners. Measured values and visible condition.");
    c.text("Placard reference:", c.M, geometry.placard_y, { size: 8, bold: true, color: c.C.muted });
    if (blank) c.line(c.M + 79, geometry.placard_y + 8, c.W - c.M, geometry.placard_y + 8);
    else c.text(vm.placard_short, c.M + 79, geometry.placard_y, { size: 8, maxWidth: c.W - 2 * c.M - 79 });
    const cardWidth = (c.W - 2 * c.M - geometry.tire_gap) / 2;
    CORNER_TITLES.forEach(([corner, title], index) => {
      tireCard(
        c,
        vm.tires[corner],
        title,
        c.M + (index % 2) * (cardWidth + geometry.tire_gap),
        geometry.tire_y + Math.floor(index / 2) * (geometry.tire_card_height + geometry.tire_gap),
        cardWidth,
        geometry.tire_card_height,
        blank,
        false,
      );
    });
    if (!blank && CORNERS.some((corner) => vm.tires[corner].partial)) {
      c.text("* Partial: tread or pressure unavailable; see the tire entries and overview.", c.M, geometry.partial_note_y, { size: 7.2, color: c.C.muted });
    }
    damageBlock(c, vm, c.M, geometry.damage_y, c.W - 2 * c.M, geometry.damage_height, blank, true);
  }
  certification(c, vm, blank);
  footer(c, vm, 1, totalPages, blank);
}

export interface OverviewLayout {
  prioritySize: number;
  priorityLeading: number;
  priorityHeight: number;
  categoriesY: number;
  categoryHeight: number;
}

/** How the priority box and category grid share page 2, or null if urgent text cannot fit. */
export function overviewLayout(c: ReportCanvas, priority: string): OverviewLayout | null {
  const T = c.spec.typography;
  const O = c.spec.geometry.overview as Record<string, number>;
  const B = c.spec.content_budgets;
  const width = c.W - 2 * c.M - 26;
  const options: [number, number][] = [[T.priority_pt, T.priority_leading_pt], [T.priority_min_pt, T.priority_min_leading_pt]];
  for (const [size, leading] of options) {
    const height = c.paragraphHeight(priority, width, size, leading);
    if (height <= (B.priority_height_max_pt as number)) {
      const textHeight = Math.max(B.priority_height_pt as number, height);
      const extra = textHeight - (B.priority_height_pt as number);
      const boxHeight = O.priority_height + extra;
      const categoriesY = O.categories_y + extra;
      const categoryHeight = (O.categories_bottom - categoriesY - 2 * O.row_gap) / 3;
      if (categoryHeight < O.category_min_height) continue;
      return { prioritySize: size, priorityLeading: leading, priorityHeight: boxHeight, categoriesY, categoryHeight };
    }
  }
  return null;
}

export function categoryTextFits(c: ReportCanvas, block: { observation: string; action: string }): boolean {
  const T = c.spec.typography;
  const B = c.spec.content_budgets;
  const O = c.spec.geometry.overview as Record<string, number>;
  const width = (c.W - 2 * c.M - O.column_gap) / 2 - 22;
  return (
    c.paragraphHeight(block.observation, width, T.body_pt, T.overview_leading_pt) <= (B.overview_observation_height_pt as number) + 0.1
    && c.paragraphHeight(block.action, width, T.overview_action_pt, T.overview_action_leading_pt, true) <= (B.overview_action_height_pt as number) + 0.1
  );
}

export function scopeTextFits(c: ReportCanvas, text: string): boolean {
  const T = c.spec.typography;
  return c.paragraphHeight(text, c.W - 2 * c.M, T.scope_pt, T.scope_leading_pt) <= (c.spec.content_budgets.scope_height_pt as number) + 0.1;
}

export function drawOverviewPage(c: ReportCanvas, vm: ReportViewModel, blank: boolean, page: number, totalPages: number) {
  c.addPage();
  header(c, vm, "Inspection overview", blank);
  const T = c.spec.typography;
  const O = c.spec.geometry.overview as Record<string, number>;
  const B = c.spec.content_budgets;
  c.text("OBSERVATIONS  /  SIGNIFICANCE  /  NEXT STEPS", c.M, O.kicker_y, { size: T.overview_kicker_pt, bold: true, color: c.C.muted });

  const layout = blank
    ? { prioritySize: T.priority_pt, priorityLeading: T.priority_leading_pt, priorityHeight: O.priority_height, categoriesY: O.categories_y, categoryHeight: O.category_height }
    : overviewLayout(c, vm.priority);
  if (!layout) throw new LayoutOverflowError("Priority actions do not fit the overview page.", "priority");

  const y = O.priority_y;
  c.rect(c.M, y, c.W - 2 * c.M, layout.priorityHeight, { fill: c.C.paper, radius: 4 });
  c.rect(c.M, y, 3, layout.priorityHeight, { fill: blank ? c.C.navy : vm.priority_status === "urgent" ? c.C.urgent : c.C.navy });
  c.text("PRIORITY ACTIONS", c.M + 13, y + 11, { size: T.priority_heading_pt, bold: true, color: c.C.navy });
  if (blank) {
    for (const lineY of [y + 34, y + 49]) c.line(c.M + 13, lineY, c.W - c.M - 13, lineY);
  } else {
    c.paragraph(vm.priority, c.M + 13, y + 27, c.W - 2 * c.M - 26, layout.priorityHeight - 35, {
      size: layout.prioritySize,
      leading: layout.priorityLeading,
      region: "priority",
    });
  }

  const gap = O.column_gap;
  const columnWidth = (c.W - 2 * c.M - gap) / 2;
  const categories = blank
    ? (vm.scope === "complete"
      ? ["TIRES & WHEELS", "BODY & EXTERIOR", "INTERIOR & CONTROLS", "ENGINE & FLUIDS", "BRAKES & CHASSIS", "ROAD TEST & DIAGNOSTICS"]
      : ["TIRES", "WHEELS", "BODY DAMAGE", "FITMENT", "UNAVAILABLE MEASUREMENTS", "INSPECTION SCOPE"]).map((title) => ({ title, status: "unknown" as const, observation: "", action: "" }))
    : vm.overview;
  if (categories.length > (B.overview_category_count_max as number)) {
    throw new LayoutOverflowError("Overview exceeds six category blocks.", "overview");
  }
  categories.forEach((category, index) => {
    const x = c.M + (index % 2) * (columnWidth + gap);
    const blockY = layout.categoriesY + Math.floor(index / 2) * (layout.categoryHeight + O.row_gap);
    c.rect(x, blockY, columnWidth, layout.categoryHeight, { fill: c.C.white, stroke: c.C.line, radius: 4 });
    c.text(category.title, x + 11, blockY + 11, { size: T.category_title_pt, bold: true, color: c.C.navy, maxWidth: columnWidth - 22 });
    if (blank) {
      ["Observation", "Significance", "Next step"].forEach((label, k) => {
        c.text(label, x + 11, blockY + 31 + k * 23, { size: 7.5, color: c.C.muted });
        c.line(x + 76, blockY + 40 + k * 23, x + columnWidth - 11, blockY + 40 + k * 23);
      });
      return;
    }
    c.paragraph(category.observation, x + 11, blockY + O.category_observation_offset, columnWidth - 22, B.overview_observation_height_pt as number, {
      size: T.body_pt,
      leading: T.overview_leading_pt,
      region: `overview.${category.title}`,
    });
    const actionColor = category.status === "not_inspected" || category.status === "outside_scope" || category.status === "not_applicable"
      ? c.C.unknown
      : c.statusColor(category.status);
    c.paragraph(category.action, x + 11, blockY + O.category_action_offset, columnWidth - 22, B.overview_action_height_pt as number, {
      size: T.overview_action_pt,
      leading: T.overview_action_leading_pt,
      bold: true,
      color: actionColor,
      region: `overview.${category.title}.action`,
    });
  });

  const scopeY = O.scope_y;
  c.line(c.M, scopeY, c.W - c.M, scopeY, c.C.navy, 0.8);
  c.text("SCOPE & EVIDENCE", c.M, scopeY + 11, { size: T.scope_heading_pt, bold: true, color: c.C.navy });
  if (blank) {
    for (const lineY of [scopeY + 35, scopeY + 51]) c.line(c.M, lineY, c.W - c.M, lineY);
  } else {
    c.paragraph(vm.limitations, c.M, scopeY + 27, c.W - 2 * c.M, B.scope_height_pt as number, { size: T.scope_pt, leading: T.scope_leading_pt, region: "scope" });
    if (vm.detail_url) {
      c.text(vm.detail_label, c.M, scopeY + 62, { size: 8.4, bold: true, color: c.C.blue });
      c.link(vm.detail_url, c.M, scopeY + 59, 220, 14);
    } else {
      c.text("Full findings and uploaded photos are available in the digital report and the optional evidence appendix.", c.M, scopeY + 62, { size: 8.1, color: c.C.muted, maxWidth: c.W - 2 * c.M });
    }
  }
  footer(c, vm, page, totalPages, blank);
}

/** The two-page main report. Exactly two pages, or LayoutOverflowError. */
export async function renderInspectionReportPdf(vm: ReportViewModel): Promise<Buffer> {
  const c = await ReportCanvas.create({
    title: `PerfectPPI inspection report ${vm.report_ref}`.trim(),
    subject: vm.scope === "complete" ? "Complete Inspection" : "Dents & Tires",
  });
  drawVisualPage(c, vm, false, 2);
  drawOverviewPage(c, vm, false, 2, 2);
  if (c.doc.getPageCount() !== 2) {
    throw new LayoutOverflowError(`Main report rendered ${c.doc.getPageCount()} pages.`, "page_count");
  }
  return c.save();
}

export async function renderBlankVisualTemplate(scope: InspectionScope): Promise<Buffer> {
  const c = await ReportCanvas.create({ title: `PerfectPPI ${scopeBadge(scope).toLowerCase()} visual template`, subject: "Blank template" });
  drawVisualPage(c, blankViewModel(scope), true, 1);
  return c.save();
}

export async function renderBlankOverviewTemplate(scope: InspectionScope = "complete"): Promise<Buffer> {
  const c = await ReportCanvas.create({ title: "PerfectPPI overview template", subject: "Blank template" });
  drawOverviewPage(c, blankViewModel(scope), true, 1, 1);
  return c.save();
}

/** A measuring context for fitting text before rendering (no pages drawn). */
export async function createReportMeasurer() {
  const c = await ReportCanvas.create({ title: "measure", subject: "measure" });
  return {
    categoryFits: (block: { observation: string; action: string }) => categoryTextFits(c, block),
    priorityFits: (text: string) => overviewLayout(c, text) !== null,
    scopeFits: (text: string) => scopeTextFits(c, text),
  };
}

export function layoutTemplateVersion() {
  return loadLayoutAssets().spec.template_version;
}
