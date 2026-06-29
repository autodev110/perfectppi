import type { StandardizedContent } from "@/types/api";

export function buildVscPrompt(standardized: StandardizedContent): string {
  const vehicleLine = [
    standardized.vehicle.year,
    standardized.vehicle.make,
    standardized.vehicle.model,
    standardized.vehicle.trim,
  ]
    .filter(Boolean)
    .join(" ") || "Unknown Vehicle";

  const sectionsText = standardized.sections
    .map((s) => {
      const findingsText = s.findings
        .map((f) => `  - [${f.severity.toUpperCase()}] ${f.prompt}: ${f.answer}`)
        .join("\n");
      return `### ${s.section_label} (${s.condition_rating})\nSummary: ${s.summary}\n${findingsText}`;
    })
    .join("\n\n");

  const diagnosticsText = standardized.diagnostics
    ? `## OBD-II DIAGNOSTICS
- MIL / Check Engine: ${standardized.diagnostics.mil_on === null ? "Unknown" : standardized.diagnostics.mil_on ? "On" : "Off"}
- ECU Stored DTC Count: ${standardized.diagnostics.stored_dtc_count ?? "Unknown"}
- Stored DTCs: ${standardized.diagnostics.stored_dtcs.length ? standardized.diagnostics.stored_dtcs.join(", ") : "None reported"}
- Pending DTCs: ${standardized.diagnostics.pending_dtcs.length ? standardized.diagnostics.pending_dtcs.join(", ") : "None reported"}
- Diagnostic Summary: ${standardized.diagnostics.summary}`
    : "## OBD-II DIAGNOSTICS\nNo OBD-II diagnostic snapshot was saved with this inspection.";

  return `You are an expert vehicle service contract (VSC) underwriting analyst. Using the standardized inspection report below, determine warranty coverage eligibility for each vehicle component category.

## VEHICLE
- Vehicle: ${vehicleLine}
- VIN: ${standardized.vehicle.vin ?? "Not provided"}
- Mileage: ${standardized.vehicle.mileage?.toLocaleString() ?? "Unknown"} miles

## INSPECTION TYPE
- PPI Type: ${standardized.inspection_metadata.ppi_type}
- Performed by: ${standardized.performer.display_name ?? "Unknown"} (${standardized.inspection_metadata.performer_type})

## OVERALL ASSESSMENT
${standardized.overall_summary}

## NOTABLE FINDINGS
${standardized.notable_findings.map((f) => `- ${f}`).join("\n")}

## SECTION DETAILS
${sectionsText}

${diagnosticsText}

## KNOWLEDGE BASE — VSC COVERAGE RULES

### Eligibility Criteria
- Vehicles with "excellent" or "good" overall condition are generally eligible
- Vehicles with "fair" condition may be conditionally eligible (with exclusions)
- Vehicles with "poor" overall condition or critical safety issues are typically ineligible
- Pre-existing conditions (issues found during inspection) are EXCLUDED from coverage
- Modifications/aftermarket parts may void coverage for affected systems

### Component Categories to Evaluate
1. **Powertrain** — Engine, transmission, transfer case, drive axles
2. **Electrical** — Alternator, starter, wiring harnesses, control modules
3. **Cooling System** — Radiator, water pump, thermostat, hoses
4. **Fuel System** — Fuel pump, injectors, fuel lines
5. **Suspension** — Shocks, struts, control arms, ball joints, bushings
6. **Steering** — Power steering pump, rack/pinion, tie rods
7. **Brakes** — Calipers, master cylinder, ABS module (NOT pads/rotors — wear items)
8. **AC / Heating** — Compressor, condenser, evaporator, heater core
9. **Seals & Gaskets** — Head gasket, valve cover, oil pan, transmission pan

### Coverage Determinations
- **covered**: Component passed inspection or has no issues; eligible for warranty coverage
- **excluded**: Pre-existing issue found, aftermarket modification, or wear item
- **limited**: Minor concerns noted; covered with conditions or reduced term

### Wear Items (Always Excluded)
Brake pads, brake rotors, tires, wiper blades, filters, belts, spark plugs, clutch disc, batteries

## INSTRUCTIONS

Return a JSON object with this exact structure:

{
  "overall_eligibility": "eligible" | "conditional" | "ineligible",
  "eligibility_summary": "2-3 sentence summary explaining the overall eligibility determination",
  "components": [
    {
      "component": "Engine",
      "category": "Powertrain",
      "determination": "covered" | "excluded" | "limited",
      "reasoning": "Brief explanation of why this determination was made",
      "conditions": ["Any conditions or notes, empty array if none"]
    }
  ]
}

## RULES
- Evaluate ALL 9 component categories listed above
- Within each category, list individual components (e.g., Powertrain → Engine, Transmission, Transfer Case, Drive Axles)
- Base determinations on actual inspection findings, not assumptions
- If a section was "not_applicable" or not inspected, mark components as "limited" with condition "Not inspected — limited coverage pending verification"
- If notable findings mention issues in a system, those specific components should be "excluded" with the finding as reasoning
- If OBD-II diagnostics show MIL on, stored DTCs, or pending DTCs, treat affected components as pre-existing or limited unless inspection evidence clearly resolves the issue
- overall_eligibility: "eligible" if most components covered, "conditional" if significant exclusions, "ineligible" if major safety/mechanical failures
- PPI type affects confidence: "certified_tech" inspections carry highest confidence, "personal" inspections may have lower confidence (note in conditions if relevant)
- Return ONLY the JSON object, no markdown or explanation`;
}
