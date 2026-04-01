import type { SectionType } from "@/types/enums";

export const SECTION_DEFINITIONS: {
  type: SectionType;
  label: string;
  description: string;
  order: number;
}[] = [
  {
    type: "vehicle_basics",
    label: "Vehicle Basics",
    description: "VIN confirmation, mileage, general info",
    order: 1,
  },
  {
    type: "dashboard_warnings",
    label: "Dashboard & Warnings",
    description: "Dash codes, warning lights, ignition check",
    order: 2,
  },
  {
    type: "exterior",
    label: "Exterior",
    description: "Body panels, paint, glass, trim",
    order: 3,
  },
  {
    type: "interior",
    label: "Interior",
    description: "Seats, carpet, controls, smell, wear",
    order: 4,
  },
  {
    type: "engine_bay",
    label: "Engine Bay",
    description: "Top-down engine, belts, hoses, fluid levels",
    order: 5,
  },
  {
    type: "tires_brakes",
    label: "Tires & Brakes",
    description: "Tread depth, brake condition, rotor state",
    order: 6,
  },
  {
    type: "suspension_steering",
    label: "Suspension & Steering",
    description: "Play, noise, alignment indicators",
    order: 7,
  },
  {
    type: "fluids",
    label: "Fluids",
    description: "Oil, coolant, brake fluid, transmission, power steering",
    order: 8,
  },
  {
    type: "electrical_controls",
    label: "Electrical & Controls",
    description: "Lights, windows, locks, infotainment, AC",
    order: 9,
  },
  {
    type: "underbody",
    label: "Underbody",
    description: "Frame, rust, leaks, exhaust",
    order: 10,
  },
  {
    type: "road_test",
    label: "Road Test",
    description: "Drive behavior, noise, shifting, braking feel",
    order: 11,
  },
  {
    type: "modifications",
    label: "Modifications & Additional",
    description: "Aftermarket parts, additional findings",
    order: 12,
  },
];

export const UPLOAD_LIMITS = {
  maxImageSize: 10 * 1024 * 1024, // 10MB
  maxVideoSize: 50 * 1024 * 1024, // 50MB
  allowedImageTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  allowedVideoTypes: ["video/mp4", "video/quicktime"],
} as const;
