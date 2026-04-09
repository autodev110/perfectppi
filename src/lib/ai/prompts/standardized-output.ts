import type { SectionType } from "@/types/enums";

interface InspectionInput {
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  };
  ppiType: string;
  performerType: string;
  performer: { display_name: string | null; role: string };
  submittedAt: string;
  version: number;
  sections: {
    section_type: SectionType;
    notes: string | null;
    answers: { prompt: string; answer_value: string | null; answer_type: string }[];
  }[];
}

export function buildStandardizedPrompt(input: InspectionInput): string {
  const vehicleLine = [input.vehicle.year, input.vehicle.make, input.vehicle.model, input.vehicle.trim]
    .filter(Boolean)
    .join(" ") || "Unknown Vehicle";

  const sectionsText = input.sections
    .map((s) => {
      const answersText = s.answers
        .map((a) => `  Q: ${a.prompt}\n  A: ${a.answer_value ?? "(not answered)"}`)
        .join("\n");
      return `### ${s.section_type}\n${answersText}${s.notes ? `\n  Notes: ${s.notes}` : ""}`;
    })
    .join("\n\n");

  return `You are an expert automotive inspection analyst. Transform the following raw pre-purchase inspection (PPI) data into a professional standardized inspection report.

## VEHICLE
- Vehicle: ${vehicleLine}
- VIN: ${input.vehicle.vin ?? "Not provided"}
- Mileage: ${input.vehicle.mileage?.toLocaleString() ?? "Not provided"} miles

## INSPECTION METADATA
- PPI Type: ${input.ppiType}
- Performed by: ${input.performer.display_name ?? "Unknown"} (${input.performerType})
- Submitted: ${input.submittedAt}
- Version: ${input.version}

## RAW INSPECTION DATA
${sectionsText}

## INSTRUCTIONS

Analyze the raw inspection data and return a JSON object with this exact structure:

{
  "vehicle": {
    "year": number | null,
    "make": string | null,
    "model": string | null,
    "trim": string | null,
    "vin": string | null,
    "mileage": number | null
  },
  "inspection_metadata": {
    "ppi_type": "${input.ppiType}",
    "performer_type": "${input.performerType}",
    "submitted_at": "${input.submittedAt}",
    "version": ${input.version}
  },
  "performer": {
    "display_name": ${JSON.stringify(input.performer.display_name)},
    "role": "${input.performer.role}"
  },
  "sections": [
    {
      "section_type": "vehicle_basics",
      "section_label": "Vehicle Basics",
      "summary": "Brief 1-2 sentence summary of section findings",
      "condition_rating": "excellent" | "good" | "fair" | "poor" | "not_applicable",
      "findings": [
        {
          "prompt": "Original question",
          "answer": "Answer or interpretation",
          "severity": "info" | "minor" | "moderate" | "major" | "critical"
        }
      ],
      "notes": "Section notes or null"
    }
  ],
  "overall_summary": "2-4 sentence overall assessment of the vehicle condition",
  "notable_findings": ["Array of key findings that a buyer/seller should know about"]
}

## RULES
- Include ALL 12 sections from the raw data, in order
- Use professional automotive inspection language
- condition_rating: "excellent" = no issues, "good" = minor cosmetic only, "fair" = some concerns, "poor" = significant issues, "not_applicable" = section not relevant
- severity: "info" = neutral observation, "minor" = cosmetic/wear, "moderate" = should address soon, "major" = needs attention before purchase, "critical" = safety concern
- If an answer is "(not answered)" or empty, mark it severity "info" with answer "Not inspected"
- notable_findings should highlight items that are "moderate", "major", or "critical"
- overall_summary should give an honest, balanced assessment
- Copy the vehicle data exactly as provided (do not modify VIN, mileage, etc.)
- Return ONLY the JSON object, no markdown or explanation`;
}
