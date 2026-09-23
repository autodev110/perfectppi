import type { InspectionScope } from "@/types/enums";
import { CORNERS, CORNER_LABELS, PANEL_LABELS, type Corner } from "./inspection-schema.ts";
import type { InspectionFactsV2 } from "./inspection-facts.ts";
import {
  actionRank,
  maxAction,
  RULES_VERSION,
  type ActionLevel,
  type Category,
  type Finding,
  type InspectionAssessment,
} from "./inspection-rules.ts";

// ============================================================================
// InspectionReportV2: the versioned report both PDF pages and the digital
// detail render from. Priority actions are composed deterministically so every
// distinct urgent action and location survives; category prose can come from a
// model only through `applyOverviewText`, which re-checks the invariants.
// ============================================================================

export const REPORT_SCHEMA_VERSION = "inspection-report/2";
export const TEMPLATE_VERSION = "ppi-visual-1.1.0";

export interface OverviewBlock {
  category: Category;
  title: string;
  action: ActionLevel;
  /** Display status for the action line (no action → checked/unknown/not inspected). */
  status: "checked" | "monitor" | "service" | "urgent" | "unknown" | "not_inspected" | "outside_scope";
  finding_ids: string[];
  observation: string;
  next_step: string;
  /** "deterministic" or the model that wrote the prose; internal only. */
  text_source: string;
}

export interface InspectionReportV2 {
  schema_version: typeof REPORT_SCHEMA_VERSION;
  template_version: string;
  rules_version: string;
  scope: InspectionScope;
  generated_at: string;
  locale: string;
  time_zone: string;
  facts_hash: string | null;
  facts: InspectionFactsV2;
  assessment: InspectionAssessment;
  priority_actions: string;
  overview: OverviewBlock[];
  scope_and_evidence: string;
  /** Internal provenance of classification/prose. Never printed. */
  provenance: {
    overview_model: string | null;
    overview_prompt_version: string | null;
    classification_model: string | null;
    classification_mode: "off" | "shadow" | "on";
  };
  model_suggestions: Finding[];
  /** Shadow/on classification results kept for evaluation; never printed. */
  classification_log?: {
    prompt_version: string;
    duration_ms: number;
    results: unknown[];
    errors: string[];
    shadow_suggestions: string[];
  };
  status: "ready" | "needs_review";
  review_reasons: string[];
  /**
   * Set when an administrator released a held report after rewriting the
   * overflowing text (features/ppi/report-review.ts). Who released it lives in
   * audit_logs, not in this partner-visible document.
   */
  review_resolution?: {
    resolved_at: string;
    edited_regions: string[];
    resolved_reasons: string[];
  };
}

export const CATEGORY_TITLES: Record<Category, string> = {
  tires_wheels: "TIRES & WHEELS",
  body_exterior: "BODY & EXTERIOR",
  interior_controls: "INTERIOR & CONTROLS",
  engine_fluids: "ENGINE & FLUIDS",
  brakes_chassis: "BRAKES & CHASSIS",
  road_test_diagnostics: "ROAD TEST & DIAGNOSTICS",
  tires: "TIRES",
  wheels: "WHEELS",
  body: "BODY DAMAGE",
  fitment: "FITMENT",
  unavailable_measurements: "UNAVAILABLE MEASUREMENTS",
  scope: "INSPECTION SCOPE",
};

export const OVERVIEW_CATEGORIES: Record<InspectionScope, Category[]> = {
  complete: [
    "tires_wheels",
    "body_exterior",
    "interior_controls",
    "engine_fluids",
    "brakes_chassis",
    "road_test_diagnostics",
  ],
  dents_tires: ["tires", "wheels", "body", "fitment", "unavailable_measurements", "scope"],
};

function statusOf(action: ActionLevel): OverviewBlock["status"] {
  return action === "urgent" ? "urgent" : action === "service_recommended" ? "service" : action === "monitor" ? "monitor" : "checked";
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const cornerPhrase = (corners: Corner[]) =>
  joinList(CORNERS.filter((corner) => corners.includes(corner)).map((corner) => CORNER_LABELS[corner].toLowerCase().replace(" ", "-")));

function reasonShort(finding: Finding): string {
  switch (finding.rule_id) {
    case "TREAD-001":
      return "tread at or below 2/32 in";
    case "DAMAGE-001":
      return finding.title.includes("puncture") ? "confirmed puncture" : "confirmed embedded object";
    case "DAMAGE-002":
      return "bulge";
    case "DAMAGE-003":
      return "exposed cords";
    case "DAMAGE-004":
      return "missing rubber";
    case "DAMAGE-005":
      return "structural damage";
    case "CRACK-003":
      return "severe cracking";
    case "CRACK-002":
      return "significant cracking";
    default:
      return finding.title.split(" - ").slice(1).join(" - ") || finding.title;
  }
}

/**
 * Every distinct urgent action with every affected corner/panel. Replacement
 * requirements are grouped into one sentence per trigger set instead of a vague
 * "several tires need attention". Variants run from most to least detailed;
 * every variant keeps every urgent action.
 */
export function composePriorityActionVariants(findings: Finding[]): string[] {
  const accepted = findings.filter((finding) => finding.review_state !== "rejected");
  const urgent = accepted.filter((finding) => finding.action === "urgent");
  // The same service action at several tires is one step naming each of them.
  const serviceSteps = groupedSteps(accepted.filter((finding) => finding.action === "service_recommended"));

  if (urgent.length === 0) {
    if (serviceSteps.length === 0) {
      return ["No urgent or service-level actions were identified by the recorded checks. Review any limitations below."];
    }
    const variants: string[] = [];
    for (const count of [3, 2, 1]) {
      const steps = serviceSteps.slice(0, count);
      const more = serviceSteps.length - steps.length;
      variants.push(`No urgent actions. Recommended: ${steps.join(" ")}${more > 0 ? ` Plus ${more} more in the categories below.` : ""}`);
    }
    return unique(variants);
  }

  const replacementRules = new Set(["TREAD-001", "DAMAGE-001", "DAMAGE-002", "DAMAGE-003", "DAMAGE-004", "DAMAGE-005", "CRACK-003"]);
  const replacements = urgent.filter((finding) => finding.rule_id && replacementRules.has(finding.rule_id) && finding.certainty === "confirmed");
  const byCorner = new Map<Corner, string[]>();
  for (const finding of replacements) {
    for (const corner of finding.corners) {
      const list = byCorner.get(corner) ?? [];
      list.push(reasonShort(finding));
      byCorner.set(corner, unique(list));
    }
  }
  const replacedCorners = CORNERS.filter((corner) => byCorner.has(corner));
  const policy = replacements.some((finding) => finding.rule_id === "DAMAGE-001")
    ? " Punctures and embedded objects require replacement under PerfectPPI's policy."
    : "";
  const tiresWord = (count: number) => (count === 1 ? "tire" : count === 4 ? "tires" : "tires");
  const cornerList = (corners: Corner[]) => (corners.length === 4 ? "all four" : `the ${cornerPhrase(corners)}`);

  // Detailed: corners with the same triggers share one sentence.
  const groups = new Map<string, Corner[]>();
  for (const corner of replacedCorners) {
    const key = byCorner.get(corner)!.join("|");
    groups.set(key, [...(groups.get(key) ?? []), corner]);
  }
  const detailedReplacement = replacedCorners.length
    ? `${[...groups.entries()]
        .map(([key, corners]) => `Replace ${cornerList(corners)} ${tiresWord(corners.length)}: ${joinList(key.split("|"))}${corners.length > 1 ? " on each" : ""}.`)
        .join(" ")}${policy}`
    : "";
  // Compact: one sentence naming every affected corner and every distinct trigger.
  const compactReplacement = replacedCorners.length
    ? `Replace ${cornerList(replacedCorners)} ${tiresWord(replacedCorners.length)}: ${joinList(unique(replacedCorners.flatMap((corner) => byCorner.get(corner)!)))}.${policy}`
    : "";

  // Other urgent actions: the same action at several locations is one sentence.
  const others = urgent.filter((finding) => !replacements.includes(finding));
  const grouped = new Map<string, Finding[]>();
  for (const finding of others) {
    const key = finding.rule_id && ["WHEEL-003", "WEAR-002", "PRESSURE-001", "DAMAGE-006", "BODY-002"].includes(finding.rule_id)
      ? finding.rule_id
      : `step:${finding.next_step}`;
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  }
  const otherSentences = [...grouped.entries()].map(([key, group]) => {
    const corners = CORNERS.filter((corner) => group.some((finding) => finding.corners.includes(corner)));
    const panels = unique(group.flatMap((finding) => finding.panels)).map((panel) => PANEL_LABELS[panel].toLowerCase());
    switch (key) {
      case "WHEEL-003":
        return `Have ${cornerList(corners)} wheel and tire ${corners.length === 1 ? "assembly" : "assemblies"} professionally assessed.`;
      case "WEAR-002":
        return `Have ${cornerList(corners)} ${tiresWord(corners.length)}, alignment and suspension assessed soon.`;
      case "PRESSURE-001":
        return `Find the source of pressure loss at ${cornerList(corners)} ${tiresWord(corners.length)}.`;
      case "DAMAGE-006":
        return `Have ${cornerList(corners)} ${tiresWord(corners.length)} inspected for suspected damage before relying on ${corners.length === 1 ? "it" : "them"}.`;
      case "BODY-002":
        return `Have the ${joinList(panels)} and surrounding structure assessed.`;
      default:
        return group[0].next_step;
    }
  });

  const variants: string[] = [];
  for (const replacement of [detailedReplacement, compactReplacement]) {
    const urgentText = [replacement, ...otherSentences].filter(Boolean).join(" ");
    for (const count of [2, 1]) {
      if (serviceSteps.length >= count) {
        const more = serviceSteps.length - count;
        variants.push(`${urgentText} Also recommended: ${serviceSteps.slice(0, count).join(" ")}${more > 0 ? ` Plus ${more} more below.` : ""}`);
      }
    }
    variants.push(urgentText);
  }
  return unique(variants);
}

export function composePriorityActions(findings: Finding[]): string {
  return composePriorityActionVariants(findings)[0];
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const REPLACEMENT_RULES = new Set(["TREAD-001", "DAMAGE-001", "DAMAGE-002", "DAMAGE-003", "DAMAGE-004", "DAMAGE-005", "CRACK-003"]);

function locationPhrase(group: Finding[]): string {
  const corners = CORNERS.filter((corner) => group.some((finding) => finding.corners.includes(corner)));
  if (corners.length === 4) return "all four";
  if (corners.length) return cornerPhrase(corners);
  const panels = unique(group.flatMap((finding) => finding.panels)).map((panel) => PANEL_LABELS[panel].toLowerCase());
  return joinList(panels);
}

function findingLabel(finding: Finding): string {
  if (finding.corners.length || finding.panels.length) {
    const [subject, ...rest] = finding.title.split(" - ");
    const noun = subject.replace(/^(Front|Rear) (left|right) /, "");
    const detail = rest.join(" - ");
    // Panel titles carry the panel as the subject; the location says where.
    return finding.panels.length ? detail : `${noun} ${detail}`.trim();
  }
  return finding.title.replace(/ - /, ": ");
}

/** The same condition at several locations becomes one statement with every ref. */
function groupedObservations(findings: Finding[]): { text: string; action: ActionLevel; count: number }[] {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const label = findingLabel(finding);
    groups.set(label, [...(groups.get(label) ?? []), finding]);
  }
  return [...groups.entries()]
    .map(([label, group]) => {
      const where = group.some((finding) => finding.corners.length || finding.panels.length) ? locationPhrase(group) : "";
      const text = `${label.charAt(0).toUpperCase()}${label.slice(1)}${where ? ` (${where})` : ""} [${group.map((finding) => finding.ref).join(", ")}].`;
      return { text, action: maxAction(group.map((finding) => finding.action)), count: group.length };
    })
    .sort((a, b) => actionRank(b.action) - actionRank(a.action));
}

function summarizeObservations(findings: Finding[], maxGroups = 3): string {
  const groups = groupedObservations(findings);
  const shown = groups.slice(0, maxGroups);
  const rest = groups.slice(maxGroups).reduce((sum, group) => sum + group.count, 0);
  return `${shown.map((group) => group.text).join(" ")}${rest > 0 ? ` ${rest} more in the full findings.` : ""}`;
}

/** Short next steps, one per distinct action, naming every location. */
function groupedSteps(findings: Finding[]): string[] {
  const ordered = [...findings].sort((a, b) => actionRank(b.action) - actionRank(a.action));
  const groups = new Map<string, Finding[]>();
  for (const finding of ordered) {
    const key = finding.rule_id && REPLACEMENT_RULES.has(finding.rule_id) && finding.certainty === "confirmed"
      ? "REPLACE"
      : finding.rule_id && ["WHEEL-003", "WEAR-002", "PRESSURE-001", "DAMAGE-006", "BODY-002", "WHEEL-002", "CRACK-002", "PRESSURE-002", "FITMENT-001", "AGE-001", "WEAR-001", "CRACK-001", "WHEEL-001"].includes(finding.rule_id)
        ? finding.rule_id
        : `step:${finding.next_step}`;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const corners = CORNERS.filter((corner) => group.some((finding) => finding.corners.includes(corner)));
    const where = corners.length === 4 ? "all four" : `the ${cornerPhrase(corners)}`;
    const tires = corners.length === 1 ? "tire" : "tires";
    switch (key) {
      case "REPLACE":
        return `Replace ${where} ${tires}.`;
      case "CRACK-002":
        return `Replacement of ${where} ${tires} is recommended.`;
      case "WHEEL-003":
        return `Have ${where} wheel and tire ${corners.length === 1 ? "assembly" : "assemblies"} professionally assessed.`;
      case "WHEEL-002":
        return `Have ${where} ${corners.length === 1 ? "wheel" : "wheels"} inspected for structural damage.`;
      case "WEAR-002":
        return `Have ${where} ${tires}, alignment and suspension assessed soon.`;
      case "PRESSURE-001":
        return `Find the source of pressure loss at ${where} ${tires}.`;
      case "PRESSURE-002":
        return `Set ${where} ${tires} to the placard pressure and recheck.`;
      case "DAMAGE-006":
        return `Have ${where} ${tires} inspected for suspected damage.`;
      case "FITMENT-001":
        return `Fit tires matching the placard, or verify an approved alternative, at ${where} ${corners.length === 1 ? "position" : "positions"}.`;
      case "BODY-002":
        return `Have the ${locationPhrase(group)} and surrounding structure assessed.`;
      case "AGE-001":
        return `Confirm the date code and tire identity at ${where} ${corners.length === 1 ? "position" : "positions"}.`;
      case "WEAR-001":
        return `Check inflation and alignment; monitor wear at ${where} ${tires}.`;
      case "CRACK-001":
        return `Monitor ${where} ${tires} for cracking progression.`;
      case "WHEEL-001":
        return "Cosmetic wheel repair is optional.";
      default:
        return group[0].next_step;
    }
  });
}

function blockFromFindings(
  category: Category,
  findings: Finding[],
  clean: { observation: string; next_step: string },
  noData: { observation: string; next_step: string } | null,
): OverviewBlock {
  const relevant = findings.filter((finding) => finding.category === category && finding.review_state !== "rejected");
  const actionable = relevant.filter((finding) => finding.action !== "none");
  const action = maxAction(actionable.map((finding) => finding.action));
  if (actionable.length === 0) {
    const text = noData ?? clean;
    return {
      category,
      title: CATEGORY_TITLES[category],
      action: "none",
      status: noData ? "unknown" : "checked",
      finding_ids: relevant.map((finding) => finding.finding_id),
      observation: relevant.length ? `${text.observation} ${summarizeObservations(relevant, 1)}` : text.observation,
      next_step: text.next_step,
      text_source: "deterministic",
    };
  }
  return {
    category,
    title: CATEGORY_TITLES[category],
    action,
    status: statusOf(action),
    finding_ids: relevant.map((finding) => finding.finding_id),
    observation: summarizeObservations(actionable),
    next_step: groupedSteps(actionable).slice(0, 2).join(" "),
    text_source: "deterministic",
  };
}

export function composeOverview(facts: InspectionFactsV2, assessment: InspectionAssessment): OverviewBlock[] {
  const findings = assessment.findings;
  const limitationsFor = (categories: Category[]) =>
    assessment.limitations.filter((limitation) => categories.includes(limitation.category));

  if (facts.scope === "dents_tires") {
    const unavailable = limitationsFor(["unavailable_measurements"]);
    const measured = CORNERS.filter((corner) => facts.tires[corner].tread.observation_state === "observed").length;
    const bodyInspected = Object.values(facts.body).filter((fact) => fact.observation_state === "observed").length;
    return [
      blockFromFindings(
        "tires",
        findings,
        { observation: `Tread recorded on ${measured} of 4 tires; no tire condition concern was recorded.`, next_step: "No tire action indicated by the recorded checks." },
        measured === 0 ? { observation: "No tire measurements were recorded.", next_step: "Measure all four tires before relying on their condition." } : null,
      ),
      blockFromFindings(
        "wheels",
        findings,
        { observation: "No wheel or rim damage was recorded on the visible surfaces.", next_step: "No wheel action indicated." },
        null,
      ),
      blockFromFindings(
        "body",
        findings,
        { observation: `${bodyInspected} in-scope body panels were checked with no visible damage recorded.`, next_step: "No body action indicated." },
        bodyInspected === 0 ? { observation: "No body panels were recorded as inspected.", next_step: "Inspect the in-scope panels." } : null,
      ),
      blockFromFindings(
        "fitment",
        findings,
        { observation: "Installed tires match the confirmed placard where both were readable.", next_step: "No fitment action indicated." },
        facts.placard.observation_state === "observed"
          ? null
          : { observation: "The tire placard was unavailable, so fitment could not be verified.", next_step: "Check the placard or owner's manual for the specified size." },
      ),
      {
        category: "unavailable_measurements",
        title: CATEGORY_TITLES.unavailable_measurements,
        action: "none",
        status: unavailable.length ? "unknown" : "checked",
        finding_ids: [],
        observation: unavailable.length ? unavailableMeasurementsSummary(facts, unavailable.length) : "All tread and pressure readings were recorded.",
        next_step: unavailable.length ? "Measure before relying on the affected tire condition." : "No missing measurements.",
        text_source: "deterministic",
      },
      {
        category: "scope",
        title: CATEGORY_TITLES.scope,
        action: "none",
        status: "outside_scope",
        finding_ids: [],
        observation: "This inspection covers tires, wheels and in-scope cosmetic body areas. Mechanical systems and bumpers are outside scope.",
        next_step: "Choose Complete Inspection for the broader checklist.",
        text_source: "deterministic",
      },
    ];
  }

  const rowStatus = (ids: string[]) => assessment.checklist.filter((row) => ids.includes(row.row_id));
  const partialRows = (ids: string[]) => rowStatus(ids).filter((row) => row.inspection_completeness !== "complete");
  const cleanOrPartial = (ids: string[], clean: string) => {
    const partial = partialRows(ids);
    return partial.length
      ? { observation: `${clean} Not fully checked: ${partial.map((row) => row.label.toLowerCase()).join("; ")}.`, next_step: "Complete the unchecked items before relying on this category." }
      : null;
  };

  const tireMeasured = CORNERS.filter((corner) => facts.tires[corner].tread.observation_state === "observed").length;
  return [
    blockFromFindings(
      "tires_wheels",
      findings,
      { observation: `Tread recorded on ${tireMeasured} of 4 tires; no tire or wheel concern was recorded.`, next_step: "No tire or wheel action indicated." },
      tireMeasured < 4
        ? { observation: `Tread recorded on ${tireMeasured} of 4 tires.`, next_step: "Measure the remaining tires." }
        : null,
    ),
    blockFromFindings(
      "body_exterior",
      findings,
      { observation: "Identity, paint, panels, glass and lamps were recorded without a concern.", next_step: "No body or exterior action indicated." },
      cleanOrPartial(["R01", "R02", "R03", "R04"], "No exterior concern was recorded."),
    ),
    blockFromFindings(
      "interior_controls",
      findings,
      { observation: "Seats, windows, locks, climate controls and electrical items operated during the recorded checks.", next_step: "No action indicated by the completed checks." },
      cleanOrPartial(["R05", "R06", "R07", "R08", "R09", "R10"], "No interior concern was recorded."),
    ),
    blockFromFindings(
      "engine_fluids",
      findings,
      { observation: "No leak, idle noise, belt or fluid concern was recorded.", next_step: "No engine-bay action indicated." },
      cleanOrPartial(["R16", "R17", "R18", "R19", "R20"], "No engine-bay concern was recorded."),
    ),
    blockFromFindings(
      "brakes_chassis",
      findings,
      { observation: "Brake estimate, steering, suspension and underside checks recorded no concern.", next_step: "No chassis action indicated." },
      cleanOrPartial(["R21", "R22", "R23", "R24", "R25"], "No chassis concern was recorded."),
    ),
    blockFromFindings(
      "road_test_diagnostics",
      findings,
      { observation: "Starting, shifting, braking and road-test checks recorded no concern.", next_step: "No additional action indicated by this test record." },
      cleanOrPartial(["R11", "R12", "R13", "R14", "R15"], "No road-test concern was recorded."),
    ),
  ];
}

/** "Tread not measured: rear-left. Pressure not measured: rear-left." grouped by reading. */
function unavailableMeasurementsSummary(facts: InspectionFactsV2, total: number): string {
  const missing = (kind: "tread" | "pressure") =>
    CORNERS.filter((corner) => facts.tires[corner][kind].observation_state !== "observed");
  const tread = missing("tread");
  const pressure = missing("pressure");
  const historical = CORNERS.every((corner) => facts.tires[corner].pressure.observation_state === "not_recorded");
  const parts: string[] = [];
  if (historical && pressure.length === 4) {
    parts.push(tread.length === 4 ? "Tread and pressure were not recorded in this historical inspection." : "Pressure was not recorded in this historical inspection.");
  } else {
    const where = (corners: Corner[]) => (corners.length === 4 ? "all four tires" : cornerPhrase(corners));
    if (tread.length && pressure.length && tread.join() === pressure.join()) {
      parts.push(`Tread and pressure not measured: ${where(tread)}.`);
    } else {
      if (tread.length) parts.push(`Tread not measured: ${where(tread)}.`);
      if (pressure.length) parts.push(`Pressure not measured: ${where(pressure)}.`);
    }
  }
  const listed = tread.length + pressure.length;
  if (total > listed) parts.push(`${total - listed} other check${total - listed === 1 ? "" : "s"} unavailable; see the full findings.`);
  return parts.join(" ");
}

export function composeScopeAndEvidence(facts: InspectionFactsV2, assessment: InspectionAssessment): string {
  const parts: string[] = [];
  parts.push(facts.inspector.mode === "self" ? "Self-inspection." : "Technician inspection.");
  if (facts.scope === "dents_tires") {
    parts.push("Brakes, engine, interior, road test and bumpers are outside the Dents & Tires scope.");
  }
  const unavailable = assessment.limitations.length;
  if (unavailable) parts.push(`${unavailable} check${unavailable === 1 ? " was" : "s were"} unavailable or incomplete; each is listed in the full findings.`);
  const pressureContexts = new Set(
    CORNERS.map((corner) => facts.tires[corner].pressure)
      .filter((fact) => fact.observation_state === "observed")
      .map((fact) => fact.value?.context),
  );
  if (pressureContexts.size) {
    parts.push(pressureContexts.has("warm") || pressureContexts.has("unknown") ? "Some pressures were not taken cold." : "Tire pressures recorded cold.");
  }
  if (facts.scope === "complete" && facts.battery.observation_state !== "observed") parts.push("No battery capacity test.");
  if (facts.catalog_version < 2) parts.push("Historical inspection: fields added later show as not recorded.");
  if (assessment.evidence.missing.length) parts.push(`${assessment.evidence.missing.length} expected photo(s) missing.`);
  parts.push("Findings describe observed conditions, not future performance.");
  return parts.join(" ");
}

export function buildInspectionReport(input: {
  facts: InspectionFactsV2;
  assessment: InspectionAssessment;
  factsHash: string | null;
  generatedAt: string;
  locale?: string;
  timeZone?: string;
  modelSuggestions?: Finding[];
  classification?: { model: string | null; mode: "off" | "shadow" | "on" };
}): InspectionReportV2 {
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    template_version: TEMPLATE_VERSION,
    rules_version: RULES_VERSION,
    scope: input.facts.scope,
    generated_at: input.generatedAt,
    locale: input.locale ?? "en-US",
    time_zone: input.timeZone ?? "America/New_York",
    facts_hash: input.factsHash,
    facts: input.facts,
    assessment: input.assessment,
    priority_actions: composePriorityActions(input.assessment.findings),
    overview: composeOverview(input.facts, input.assessment),
    scope_and_evidence: composeScopeAndEvidence(input.facts, input.assessment),
    provenance: {
      overview_model: null,
      overview_prompt_version: null,
      classification_model: input.classification?.model ?? null,
      classification_mode: input.classification?.mode ?? "off",
    },
    model_suggestions: input.modelSuggestions ?? [],
    status: "ready",
    review_reasons: [],
  };
}

/** Wording no printed report text may use: AI/model labels, prices, pass/fail. */
export const FORBIDDEN_PHRASES = /\b(AI|artificial intelligence|machine learning|model|LLM|generated)\b|\$\s?\d|\bUSD\b|\bdollars?\b|\bpass(?:ed)?\b|\bfail(?:ed|s)?\b/i;

/**
 * Accepts model-written category text only when it keeps the deterministic
 * invariants: it may not mention AI/models, prices or pass/fail, it must cite
 * every urgent finding in its category by reference, and it may not cite a
 * finding that does not exist. Rejected text keeps the deterministic wording.
 */
export function applyOverviewText(
  report: InspectionReportV2,
  proposals: { category: Category; observation: string; next_step: string }[],
  source: { model: string; promptVersion: string },
  fits: (block: OverviewBlock) => boolean,
): InspectionReportV2 {
  const byRef = new Map(report.assessment.findings.map((finding) => [finding.ref, finding]));
  const overview = report.overview.map((block) => {
    const proposal = proposals.find((candidate) => candidate.category === block.category);
    if (!proposal) return block;
    const text = `${proposal.observation} ${proposal.next_step}`;
    if (FORBIDDEN_PHRASES.test(text)) return block;
    const cited = [...text.matchAll(/\[([TBCN]\d{1,2})\]/g)].map((match) => match[1]);
    if (cited.some((ref) => !byRef.has(ref))) return block;
    const urgentRefs = report.assessment.findings
      .filter((finding) => finding.category === block.category && finding.action === "urgent")
      .map((finding) => finding.ref);
    if (urgentRefs.some((ref) => !cited.includes(ref))) return block;
    const candidate: OverviewBlock = {
      ...block,
      observation: proposal.observation.trim(),
      next_step: proposal.next_step.trim(),
      text_source: source.model,
    };
    return fits(candidate) ? candidate : block;
  });
  return {
    ...report,
    overview,
    provenance: { ...report.provenance, overview_model: source.model, overview_prompt_version: source.promptVersion },
  };
}

/**
 * Shorter deterministic wordings for a category block, most detailed first.
 * Every variant keeps every urgent reference in the category.
 */
export function overviewTextVariants(block: OverviewBlock, findings: Finding[]): { observation: string; next_step: string }[] {
  const relevant = findings.filter((finding) => block.finding_ids.includes(finding.finding_id) && finding.action !== "none");
  if (relevant.length === 0) {
    // No actionable finding: keep the leading sentence and point to the detail.
    const first = block.observation.split(/(?<=\.)\s+/)[0];
    const firstStep = block.next_step.split(/(?<=\.)\s+/)[0];
    return [
      { observation: block.observation, next_step: block.next_step },
      { observation: `${first} Details in the full findings.`, next_step: firstStep },
      { observation: "Details are listed in the full findings.", next_step: firstStep },
    ];
  }
  const steps = groupedSteps(relevant);
  const variants: { observation: string; next_step: string }[] = [];
  for (const maxGroups of [3, 2, 1]) {
    for (const stepCount of [2, 1]) {
      variants.push({ observation: summarizeObservations(relevant, maxGroups), next_step: steps.slice(0, stepCount).join(" ") });
    }
  }
  variants.push({
    observation: `${relevant.length} finding${relevant.length === 1 ? "" : "s"} recorded [${relevant.map((finding) => finding.ref).join(", ")}]; details in the full findings.`,
    next_step: steps[0],
  });
  return variants;
}

/** Which body panels have printed findings, in marker order. */
export function bodyIndex(report: InspectionReportV2): { ref: string; panel: string; finding: Finding }[] {
  return report.assessment.findings
    .filter((finding) => finding.panels.length > 0 || finding.ref.startsWith("B"))
    .map((finding) => ({
      ref: finding.ref,
      panel: finding.panels[0] ? PANEL_LABELS[finding.panels[0]] : "Location not recorded",
      finding,
    }));
}
