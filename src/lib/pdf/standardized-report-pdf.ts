import type { StandardizedContent } from "@/types/api";
import { createSimplePdf } from "./simple-pdf";

function vehicleLabel(content: StandardizedContent) {
  return [
    content.vehicle.year,
    content.vehicle.make,
    content.vehicle.model,
    content.vehicle.trim,
  ]
    .filter(Boolean)
    .join(" ") || "Unknown Vehicle";
}

function addLabelValue(lines: Parameters<typeof createSimplePdf>[0], label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return;
  lines.push({ text: `${label}: ${value}`, fontSize: 10 });
}

export function generateStandardizedReportPdf(content: StandardizedContent) {
  const lines: Parameters<typeof createSimplePdf>[0] = [
    { text: "PerfectPPI", fontSize: 22, font: "bold", gapAfter: 8 },
    { text: "Pre-Purchase Inspection Report", fontSize: 16, font: "bold", gapAfter: 12 },
    { text: vehicleLabel(content), fontSize: 14, font: "bold", gapAfter: 6 },
  ];

  addLabelValue(lines, "VIN", content.vehicle.vin);
  addLabelValue(lines, "Mileage", content.vehicle.mileage ? `${content.vehicle.mileage.toLocaleString()} mi` : null);
  addLabelValue(lines, "PPI Type", content.inspection_metadata.ppi_type);
  addLabelValue(lines, "Performer Type", content.inspection_metadata.performer_type);
  addLabelValue(lines, "Inspector", content.performer.display_name ?? "Self");
  addLabelValue(lines, "Generated From Submission Version", content.inspection_metadata.version);

  lines.push({ text: " ", fontSize: 8, gapAfter: 8 });
  lines.push({ text: "Overall Summary", fontSize: 14, font: "bold", gapAfter: 4 });
  lines.push({ text: content.overall_summary, fontSize: 10, gapAfter: 10 });

  if (content.notable_findings.length > 0) {
    lines.push({ text: "Notable Findings", fontSize: 12, font: "bold", gapAfter: 3 });
    for (const finding of content.notable_findings) {
      lines.push({ text: `- ${finding}`, fontSize: 10 });
    }
    lines.push({ text: " ", fontSize: 8, gapAfter: 8 });
  }

  for (const section of content.sections) {
    lines.push({ text: section.section_label, fontSize: 13, font: "bold", gapAfter: 3 });
    lines.push({ text: `Condition: ${section.condition_rating}`, fontSize: 10, font: "bold" });
    lines.push({ text: section.summary, fontSize: 10, gapAfter: 4 });

    if (section.findings.length > 0) {
      for (const finding of section.findings) {
        lines.push({
          text: `[${finding.severity}] ${finding.prompt}: ${finding.answer}`,
          fontSize: 9,
        });
      }
    }

    if (section.notes) {
      lines.push({ text: `Notes: ${section.notes}`, fontSize: 9 });
    }

    lines.push({ text: " ", fontSize: 8, gapAfter: 6 });
  }

  return createSimplePdf(lines);
}
