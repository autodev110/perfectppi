import type { BodyPanel } from "./inspection-schema.ts";

// ============================================================================
// The generic top-view body diagram shared by the capture editors (web and
// iOS) and the report renderer.
//
// Coordinates are normalized 0–1 within the diagram box: x runs from the
// vehicle's left (driver side) to its right, y from the front bumper to the
// rear. Markers are stored in these coordinates, never in page pixels, so
// every surface resolves its own geometry.
//
// A marker always stays on its panel: taps are clamped into the panel's
// region, the API rejects markers outside it, and the renderer clamps again.
//
// mobile-app/PerfectPPI/Core/Models/BodyDiagram.swift mirrors these numbers;
// tests/unit/body-diagram.test.mts keeps the two in step.
// ============================================================================

export const BODY_DIAGRAM_VIEW = "top" as const;
export type BodyDiagramView = typeof BODY_DIAGRAM_VIEW;

export interface DiagramRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Original simplified silhouette; left/right are the vehicle's. */
export const BODY_DIAGRAM_SHAPES: {
  body: DiagramRect;
  cabin: DiagramRect;
  wheels: readonly DiagramRect[];
  /** Horizontal panel seams across the body. */
  seams: readonly number[];
} = {
  body: { x: 0.23, y: 0.04, w: 0.54, h: 0.92 },
  cabin: { x: 0.3, y: 0.32, w: 0.4, h: 0.32 },
  wheels: [
    { x: 0.11, y: 0.19, w: 0.11, h: 0.18 },
    { x: 0.78, y: 0.19, w: 0.11, h: 0.18 },
    { x: 0.11, y: 0.66, w: 0.11, h: 0.18 },
    { x: 0.78, y: 0.66, w: 0.11, h: 0.18 },
  ],
  seams: [0.2, 0.28, 0.69, 0.78],
};

/** Region a marker may occupy for each panel, as [x0, y0, x1, y1]. */
export const PANEL_REGIONS: Record<BodyPanel, readonly [number, number, number, number]> = {
  front_bumper: [0.23, 0.04, 0.77, 0.09],
  hood: [0.3, 0.09, 0.7, 0.2],
  left_front_fender: [0.23, 0.09, 0.3, 0.32],
  right_front_fender: [0.7, 0.09, 0.77, 0.32],
  left_front_door: [0.23, 0.32, 0.3, 0.48],
  right_front_door: [0.7, 0.32, 0.77, 0.48],
  left_rear_door: [0.23, 0.48, 0.3, 0.64],
  right_rear_door: [0.7, 0.48, 0.77, 0.64],
  left_rocker: [0.17, 0.37, 0.23, 0.66],
  right_rocker: [0.77, 0.37, 0.83, 0.66],
  roof: [0.3, 0.32, 0.7, 0.64],
  left_rear_quarter: [0.23, 0.64, 0.3, 0.86],
  right_rear_quarter: [0.7, 0.64, 0.77, 0.86],
  trunk_tailgate: [0.3, 0.78, 0.7, 0.91],
  rear_bumper: [0.23, 0.91, 0.77, 0.96],
  // Unmatched body styles: anywhere on the silhouette.
  other_body_panel: [0.17, 0.04, 0.83, 0.96],
};

/** Where a finding sits when the inspector did not place a marker. */
export const PANEL_DEFAULT_MARKERS: Record<BodyPanel, readonly [number, number]> = {
  front_bumper: [0.5, 0.05],
  hood: [0.5, 0.15],
  left_front_fender: [0.25, 0.24],
  right_front_fender: [0.75, 0.24],
  left_front_door: [0.25, 0.42],
  right_front_door: [0.75, 0.42],
  left_rocker: [0.2, 0.5],
  right_rocker: [0.8, 0.5],
  roof: [0.5, 0.48],
  left_rear_door: [0.25, 0.58],
  right_rear_door: [0.75, 0.58],
  left_rear_quarter: [0.26, 0.75],
  right_rear_quarter: [0.74, 0.75],
  trunk_tailgate: [0.5, 0.86],
  rear_bumper: [0.5, 0.95],
  other_body_panel: [0.5, 0.66],
};

export interface BodyMarker {
  view: BodyDiagramView;
  x: number;
  y: number;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Nearest point on the panel, rounded to the stored precision. */
export function clampToPanel(panel: BodyPanel, x: number, y: number): BodyMarker {
  const [x0, y0, x1, y1] = PANEL_REGIONS[panel];
  return { view: BODY_DIAGRAM_VIEW, x: round3(clamp(x, x0, x1)), y: round3(clamp(y, y0, y1)) };
}

/** True when a stored marker lies on its panel (allowing for rounding). */
export function markerOnPanel(panel: BodyPanel, marker: { x: number; y: number }): boolean {
  const [x0, y0, x1, y1] = PANEL_REGIONS[panel];
  const epsilon = 0.0005;
  return marker.x >= x0 - epsilon && marker.x <= x1 + epsilon && marker.y >= y0 - epsilon && marker.y <= y1 + epsilon;
}

/** Moves a marker by a step (keyboard placement), staying on the panel. */
export function nudgeMarker(panel: BodyPanel, marker: { x: number; y: number } | null, dx: number, dy: number): BodyMarker {
  const [x, y] = marker ? [marker.x, marker.y] : PANEL_DEFAULT_MARKERS[panel];
  return clampToPanel(panel, x + dx, y + dy);
}
