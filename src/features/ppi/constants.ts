import type { SectionType, AnswerType, PpiRequestStatus } from "@/types/enums";

export const SECTION_ORDER: SectionType[] = [
  "vehicle_basics",
  "dashboard_warnings",
  "exterior",
  "interior",
  "engine_bay",
  "tires_brakes",
  "suspension_steering",
  "fluids",
  "electrical_controls",
  "underbody",
  "road_test",
  "modifications",
];

export const SECTION_LABELS: Record<SectionType, string> = {
  vehicle_basics: "Vehicle Basics",
  dashboard_warnings: "Dashboard & Warnings",
  exterior: "Exterior",
  interior: "Interior",
  engine_bay: "Engine Bay",
  tires_brakes: "Tires & Brakes",
  suspension_steering: "Suspension & Steering",
  fluids: "Fluids",
  electrical_controls: "Electrical & Controls",
  underbody: "Underbody",
  road_test: "Road Test",
  modifications: "Modifications",
};

// ============================================================================
// Question Templates
// ============================================================================

export interface QuestionTemplate {
  prompt: string;
  answerType: AnswerType;
  options?: string[];
  isRequired: boolean;
  requiresPhoto?: boolean;
  photoPrompt?: string;
}

export const SECTION_QUESTION_TEMPLATES: Record<SectionType, QuestionTemplate[]> = {
  vehicle_basics: [
    {
      prompt: "Confirm the VIN on the vehicle",
      answerType: "text",
      isRequired: true,
    },
    {
      prompt: "Current odometer reading (miles)",
      answerType: "number",
      isRequired: true,
      requiresPhoto: true,
      photoPrompt: "Capture a clear photo of the odometer",
    },
    {
      prompt: "Number of keys included",
      answerType: "number",
      isRequired: true,
    },
    {
      prompt: "Title status",
      answerType: "select",
      options: ["Clean", "Salvage", "Rebuilt", "Lemon Law", "Unknown"],
      isRequired: true,
    },
    {
      prompt: "Any accidents reported on history report?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Additional notes on vehicle basics",
      answerType: "text",
      isRequired: false,
    },
  ],

  dashboard_warnings: [
    {
      prompt: "Are any warning lights currently on?",
      answerType: "yes_no",
      isRequired: true,
      requiresPhoto: true,
      photoPrompt: "Turn ignition on (engine off) and capture the dashboard",
    },
    {
      prompt: "Is the check engine light on?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "List all active warning lights (if any)",
      answerType: "text",
      isRequired: false,
    },
    {
      prompt: "Were DTC codes scanned? List codes if yes.",
      answerType: "text",
      isRequired: false,
    },
    {
      prompt: "Any ABS or traction control warnings?",
      answerType: "yes_no",
      isRequired: true,
    },
  ],

  exterior: [
    {
      prompt: "Overall paint condition",
      answerType: "select",
      options: ["Excellent", "Good", "Fair", "Poor"],
      isRequired: true,
      requiresPhoto: true,
      photoPrompt: "Capture all four sides of the vehicle",
    },
    {
      prompt: "Are there any dents or dings?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Describe any dents, dings, or paint damage",
      answerType: "text",
      isRequired: false,
    },
    {
      prompt: "Is there any rust visible on the body?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Windshield condition",
      answerType: "select",
      options: ["No damage", "Small chip", "Crack", "Multiple cracks"],
      isRequired: true,
    },
    {
      prompt: "Are any panels mismatched or repainted?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Condition of lights and lenses (headlights, taillights)",
      answerType: "select",
      options: ["Clear and intact", "Minor yellowing", "Cracked/broken", "Missing"],
      isRequired: true,
    },
  ],

  interior: [
    {
      prompt: "Overall interior condition",
      answerType: "select",
      options: ["Excellent", "Good", "Fair", "Poor"],
      isRequired: true,
      requiresPhoto: true,
      photoPrompt: "Capture driver seat and rear seat area",
    },
    {
      prompt: "Are there any rips, tears, or stains on seats?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Describe any interior damage",
      answerType: "text",
      isRequired: false,
    },
    {
      prompt: "Is there any unusual odor (smoke, mold, pets)?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Do all power seat adjustments work (if equipped)?",
      answerType: "yes_no",
      isRequired: false,
    },
    {
      prompt: "Carpet and floor mat condition",
      answerType: "select",
      options: ["Excellent", "Good", "Stained", "Torn/worn through"],
      isRequired: true,
    },
  ],

  engine_bay: [
    {
      prompt: "Are there any visible oil or fluid leaks?",
      answerType: "yes_no",
      isRequired: true,
      requiresPhoto: true,
      photoPrompt: "Capture a top-down overview of the engine bay",
    },
    {
      prompt: "Serpentine/drive belt condition",
      answerType: "select",
      options: ["Good", "Worn", "Cracked", "Not visible"],
      isRequired: true,
    },
    {
      prompt: "Are there any unusual noises at idle?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Describe any engine noises or concerns",
      answerType: "text",
      isRequired: false,
    },
    {
      prompt: "Is there visible corrosion on the battery terminals?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Any signs of coolant leaks or overheating (white deposits)?",
      answerType: "yes_no",
      isRequired: true,
    },
  ],

  tires_brakes: [
    {
      prompt: "Front left tire tread depth (in 32nds of an inch)",
      answerType: "number",
      isRequired: true,
      requiresPhoto: true,
      photoPrompt: "Capture the worst-condition tire",
    },
    {
      prompt: "Front right tire tread depth (in 32nds of an inch)",
      answerType: "number",
      isRequired: true,
    },
    {
      prompt: "Rear left tire tread depth (in 32nds of an inch)",
      answerType: "number",
      isRequired: true,
    },
    {
      prompt: "Rear right tire tread depth (in 32nds of an inch)",
      answerType: "number",
      isRequired: true,
    },
    {
      prompt: "Estimated brake pad life remaining",
      answerType: "select",
      options: [">75%", "50–75%", "25–50%", "<25% (needs replacement)"],
      isRequired: true,
    },
    {
      prompt: "Is there any uneven tire wear?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Rotor condition (if visible)",
      answerType: "select",
      options: ["Good", "Surface rust (normal)", "Grooved/scored", "Not visible"],
      isRequired: false,
    },
  ],

  suspension_steering: [
    {
      prompt: "Is there any play or looseness in the steering wheel?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Bounce test result (push down on each corner)",
      answerType: "select",
      options: ["Firm (good shocks)", "One bounce (acceptable)", "Bouncy (worn shocks)"],
      isRequired: true,
    },
    {
      prompt: "Any clunking or rattling noises over bumps?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Describe any suspension or steering concerns",
      answerType: "text",
      isRequired: false,
    },
    {
      prompt: "Does the vehicle pull to one side?",
      answerType: "yes_no",
      isRequired: true,
    },
  ],

  fluids: [
    {
      prompt: "Engine oil condition",
      answerType: "select",
      options: ["Clean (amber)", "Dark (due for change)", "Very dark/dirty", "Milky (coolant contamination)"],
      isRequired: true,
      requiresPhoto: true,
      photoPrompt: "Capture the oil dipstick",
    },
    {
      prompt: "Coolant level",
      answerType: "select",
      options: ["Full", "Low", "Empty", "Not checkable"],
      isRequired: true,
    },
    {
      prompt: "Brake fluid color",
      answerType: "select",
      options: ["Clear/light yellow (good)", "Amber (ok)", "Dark brown (old)", "Not checkable"],
      isRequired: true,
    },
    {
      prompt: "Transmission fluid condition (if dipstick accessible)",
      answerType: "select",
      options: ["Pink/clear (good)", "Brown (aging)", "Dark/burnt smell", "Not checkable"],
      isRequired: false,
    },
    {
      prompt: "Power steering fluid level (if applicable)",
      answerType: "select",
      options: ["Full", "Low", "Not applicable (electric steering)", "Not checkable"],
      isRequired: false,
    },
  ],

  electrical_controls: [
    {
      prompt: "Do all exterior lights work (headlights, brake, reverse, turn signals)?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Do all windows operate correctly?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Does the air conditioning blow cold?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Does the heater work?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Is the infotainment/radio system functional?",
      answerType: "yes_no",
      isRequired: false,
    },
    {
      prompt: "Do all door locks and windows work from the driver switch?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Any electrical concerns or malfunctions?",
      answerType: "text",
      isRequired: false,
    },
  ],

  underbody: [
    {
      prompt: "Frame rust level",
      answerType: "select",
      options: ["None", "Surface rust (minor)", "Moderate rust", "Severe/structural rust"],
      isRequired: true,
      requiresPhoto: true,
      photoPrompt: "Capture the underside of the vehicle (if safely accessible)",
    },
    {
      prompt: "Any visible fluid leaks from underneath?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Exhaust system condition",
      answerType: "select",
      options: ["Good", "Surface rust (normal)", "Holes/cracks", "Missing sections"],
      isRequired: true,
    },
    {
      prompt: "Describe any underbody concerns",
      answerType: "text",
      isRequired: false,
    },
  ],

  road_test: [
    {
      prompt: "Does the engine start smoothly without hesitation?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Does the transmission shift smoothly through all gears?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Any vibrations at highway speed?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Does the vehicle brake in a straight line without pulling?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Any unusual noises while driving (clunks, squeals, grinding)?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "Describe any drivability concerns observed during the road test",
      answerType: "text",
      isRequired: false,
    },
  ],

  modifications: [
    {
      prompt: "Are there any aftermarket modifications on this vehicle?",
      answerType: "yes_no",
      isRequired: true,
    },
    {
      prompt: "List all modifications (suspension, engine, exhaust, wheels, etc.)",
      answerType: "text",
      isRequired: false,
    },
    {
      prompt: "Additional findings or notes not covered in other sections",
      answerType: "text",
      isRequired: false,
    },
  ],
};

// ============================================================================
// Status State Machine
// ============================================================================

export const VALID_STATUS_TRANSITIONS: Record<PpiRequestStatus, PpiRequestStatus[]> = {
  draft: ["pending_assignment", "in_progress"],
  pending_assignment: ["assigned", "archived"],
  assigned: ["accepted", "pending_assignment"],
  accepted: ["in_progress"],
  in_progress: ["submitted"],
  submitted: ["needs_revision", "completed"],
  needs_revision: ["in_progress"],
  completed: ["archived"],
  archived: [],
};

export function isValidTransition(
  current: PpiRequestStatus,
  next: PpiRequestStatus
): boolean {
  return VALID_STATUS_TRANSITIONS[current]?.includes(next) ?? false;
}
