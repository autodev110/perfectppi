import type { StandardizedContent, VscCoverageData } from "@/types/api";
import { createSimplePdf } from "./simple-pdf";

// ============================================================================
// VSC determination PDF — the human-readable counterpart to the VSC JSON.
//
// This is a record a dealership keeps, so it has to stand on its own: which
// vehicle, which inspection, which output version, and when it was produced.
// Excluded and limited components are pulled to the front, because those are
// the findings someone reaching for this document is looking for.
// ============================================================================

type PdfLines = Parameters<typeof createSimplePdf>[0];

const ELIGIBILITY_LABELS: Record<VscCoverageData["overall_eligibility"], string> = {
  eligible: "ELIGIBLE",
  conditional: "CONDITIONALLY ELIGIBLE",
  ineligible: "NOT ELIGIBLE",
};

const DETERMINATION_LABELS: Record<string, string> = {
  covered: "Covered",
  excluded: "Excluded",
  limited: "Limited",
};

export interface VscPdfContext {
  submissionId: string;
  outputVersion: number;
  generatedAt: string;
  submissionVersion?: number | null;
}

function addLabelValue(
  lines: PdfLines,
  label: string,
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined || value === "") return;
  lines.push({ text: `${label}: ${value}`, fontSize: 10 });
}

function vehicleLabel(content: StandardizedContent): string {
  return (
    [
      content.vehicle.year,
      content.vehicle.make,
      content.vehicle.model,
      content.vehicle.trim,
    ]
      .filter(Boolean)
      .join(" ") || "Unknown Vehicle"
  );
}

export function generateVscDeterminationPdf(
  coverage: VscCoverageData,
  content: StandardizedContent,
  context: VscPdfContext,
): Buffer {
  const lines: PdfLines = [
    { text: "PerfectPPI", fontSize: 22, font: "bold", gapAfter: 8 },
    {
      text: "Vehicle Service Contract Determination",
      fontSize: 16,
      font: "bold",
      gapAfter: 12,
    },
    { text: vehicleLabel(content), fontSize: 14, font: "bold", gapAfter: 6 },
  ];

  addLabelValue(lines, "VIN", content.vehicle.vin);
  addLabelValue(
    lines,
    "Mileage",
    content.vehicle.mileage ? `${content.vehicle.mileage.toLocaleString()} mi` : null,
  );

  lines.push({ text: " ", fontSize: 8, gapAfter: 6 });
  lines.push({ text: "Document Reference", fontSize: 12, font: "bold", gapAfter: 3 });
  addLabelValue(lines, "Inspection Submission", context.submissionId);
  addLabelValue(lines, "Submission Version", context.submissionVersion ?? undefined);
  addLabelValue(lines, "Output Version", context.outputVersion);
  addLabelValue(lines, "Generated At", context.generatedAt);
  addLabelValue(lines, "Inspector", content.performer.display_name ?? "Self");
  addLabelValue(lines, "Inspection Type", content.inspection_metadata.ppi_type);

  lines.push({ text: " ", fontSize: 8, gapAfter: 10 });
  lines.push({ text: "Determination", fontSize: 14, font: "bold", gapAfter: 4 });
  lines.push({
    text: ELIGIBILITY_LABELS[coverage.overall_eligibility] ?? "UNDETERMINED",
    fontSize: 13,
    font: "bold",
    gapAfter: 4,
  });
  lines.push({ text: coverage.eligibility_summary, fontSize: 10, gapAfter: 10 });

  const components = coverage.components ?? [];
  const excluded = components.filter((c) => c.determination === "excluded");
  const limited = components.filter((c) => c.determination === "limited");
  const covered = components.filter((c) => c.determination === "covered");

  lines.push({ text: "Coverage Summary", fontSize: 12, font: "bold", gapAfter: 3 });
  addLabelValue(lines, "Components assessed", components.length);
  addLabelValue(lines, "Covered", covered.length);
  addLabelValue(lines, "Limited", limited.length);
  addLabelValue(lines, "Excluded", excluded.length);
  lines.push({ text: " ", fontSize: 8, gapAfter: 10 });

  if (excluded.length > 0) {
    appendComponentSection(lines, "Exclusions", excluded);
  }

  if (limited.length > 0) {
    appendComponentSection(lines, "Limitations and Conditions", limited);
  }

  if (covered.length > 0) {
    appendComponentSection(lines, "Covered Components", covered);
  }

  if (components.length === 0) {
    lines.push({
      text: "No component-level determinations were produced for this inspection.",
      fontSize: 10,
      gapAfter: 10,
    });
  }

  if (content.notable_findings.length > 0) {
    lines.push({
      text: "Inspection Findings Behind This Determination",
      fontSize: 12,
      font: "bold",
      gapAfter: 3,
    });
    for (const finding of content.notable_findings) {
      lines.push({ text: `- ${finding}`, fontSize: 10 });
    }
    lines.push({ text: " ", fontSize: 8, gapAfter: 10 });
  }

  lines.push({ text: "Important Notice", fontSize: 12, font: "bold", gapAfter: 3 });
  lines.push({
    text:
      "This determination reflects the condition recorded in the referenced " +
      "inspection at the time it was submitted. It is an assessment of coverage " +
      "eligibility, not a contract, quote, or binding offer of coverage. Final " +
      "terms, deductibles, and exclusions are set by the issuing service " +
      "contract administrator.",
    fontSize: 9,
    gapAfter: 6,
  });

  return createSimplePdf(lines);
}

function appendComponentSection(
  lines: PdfLines,
  heading: string,
  components: VscCoverageData["components"],
) {
  lines.push({ text: heading, fontSize: 12, font: "bold", gapAfter: 3 });

  for (const component of components) {
    lines.push({
      text: `${component.component} (${component.category}) - ${
        DETERMINATION_LABELS[component.determination] ?? component.determination
      }`,
      fontSize: 10,
      font: "bold",
    });

    if (component.reasoning) {
      lines.push({ text: component.reasoning, fontSize: 9 });
    }

    for (const condition of component.conditions ?? []) {
      lines.push({ text: `  - ${condition}`, fontSize: 9 });
    }

    lines.push({ text: " ", fontSize: 6, gapAfter: 3 });
  }

  lines.push({ text: " ", fontSize: 8, gapAfter: 6 });
}
