import type { SectionType } from "@/types/enums";

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
