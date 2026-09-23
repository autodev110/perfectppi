"use client";

import { useId, useRef, type KeyboardEvent, type MouseEvent } from "react";
import {
  BODY_DIAGRAM_SHAPES,
  PANEL_DEFAULT_MARKERS,
  PANEL_REGIONS,
  clampToPanel,
  nudgeMarker,
  type BodyMarker,
} from "@/features/ppi/body-diagram";
import { PANEL_LABELS, type BodyPanel } from "@/features/ppi/inspection-schema";
import { t as uiText } from "@/lib/i18n";


// ============================================================================
// Tap-to-place marker on the generic top-view diagram. The target panel is
// highlighted and every tap is clamped onto it, so a marker can never land on
// a neighbouring panel. Arrow keys move the marker; Delete clears it.
// ============================================================================

const W = 100;
const H = 140;
const STEP = 0.01;

interface PlacedMarker {
  label: string;
  x: number;
  y: number;
}

export function BodyDiagramPicker({
  panel,
  label,
  marker,
  others,
  onChange,
}: {
  panel: BodyPanel;
  /** Number shown in this entry's marker. */
  label: string;
  marker: { x: number; y: number } | null;
  /** Other damage entries on the same panel, shown for reference. */
  others: PlacedMarker[];
  onChange: (marker: BodyMarker | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hintId = useId();
  const { body, cabin, wheels, seams } = BODY_DIAGRAM_SHAPES;
  const [x0, y0, x1, y1] = PANEL_REGIONS[panel];
  const panelName = PANEL_LABELS[panel].toLowerCase();

  function place(event: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    onChange(clampToPanel(panel, point.x / W, point.y / H));
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      onChange(nudgeMarker(panel, marker, move[0], move[1]));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!marker) onChange(nudgeMarker(panel, null, 0, 0));
    } else if ((event.key === "Delete" || event.key === "Backspace") && marker) {
      event.preventDefault();
      onChange(null);
    }
  }

  const pin = (entry: PlacedMarker, active: boolean) => (
    <g key={`${entry.label}-${active ? "active" : "other"}`} aria-hidden="true">
      <circle
        cx={entry.x * W}
        cy={entry.y * H}
        r={active ? 5 : 4}
        className={active ? "fill-primary" : "fill-muted-foreground/60"}
      />
      <text
        x={entry.x * W}
        y={entry.y * H}
        dy="0.35em"
        textAnchor="middle"
        className="fill-white text-[5px] font-bold select-none"
      >
        {entry.label}
      </text>
    </g>
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <svg
        ref={svgRef}
        viewBox={`0 -10 ${W} ${H + 12}`}
        role="application"
        tabIndex={0}
        aria-label={uiText("ui.body_diagram_tap_the_to_mark_where_the_damag_eccfbc1af7", { arg0: String(panelName) })}
        aria-describedby={hintId}
        onClick={place}
        onKeyDown={onKeyDown}
        className="w-44 shrink-0 cursor-crosshair touch-manipulation rounded-xl border bg-background outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <text x={W / 2} y={-3} textAnchor="middle" className="fill-muted-foreground text-[5px] font-semibold tracking-wider select-none">{uiText("ui.front_a855f18ac5")}</text>
        <rect
          x={body.x * W}
          y={body.y * H}
          width={body.w * W}
          height={body.h * H}
          rx={8}
          className="fill-background stroke-muted-foreground/60"
          strokeWidth={0.6}
        />
        {wheels.map((wheel, index) => (
          <rect
            key={index}
            x={wheel.x * W}
            y={wheel.y * H}
            width={wheel.w * W}
            height={wheel.h * H}
            rx={1.5}
            className="fill-muted stroke-muted-foreground/60"
            strokeWidth={0.6}
          />
        ))}
        <rect
          x={cabin.x * W}
          y={cabin.y * H}
          width={cabin.w * W}
          height={cabin.h * H}
          rx={3}
          className="fill-muted stroke-muted-foreground/60"
          strokeWidth={0.6}
        />
        {seams.map((seam) => (
          <line
            key={seam}
            x1={body.x * W + 2}
            x2={(body.x + body.w) * W - 2}
            y1={seam * H}
            y2={seam * H}
            className="stroke-muted-foreground/40"
            strokeWidth={0.5}
          />
        ))}
        <rect
          x={x0 * W}
          y={y0 * H}
          width={(x1 - x0) * W}
          height={(y1 - y0) * H}
          rx={1.5}
          className="fill-primary/15 stroke-primary"
          strokeWidth={0.6}
          strokeDasharray="2 1.5"
        />
        {others.map((entry) => pin(entry, false))}
        {marker ? pin({ label, ...marker }, true) : null}
      </svg>
      <div className="space-y-2 text-sm">
        <p id={hintId} className="text-muted-foreground">
          {marker
            ? uiText("ui.marker_is_on_the_tap_again_to_move_it_83c303f871", { arg0: String(label), arg1: String(panelName) })
            : uiText("ui.optional_tap_where_the_damage_is_on_the_with_bccea3da94", { arg0: String(panelName) })}
        </p>
        {marker ? (
          <button
            type="button"
            className="text-sm font-medium text-primary"
            onClick={() => onChange(null)}
          >{uiText("ui.clear_marker_50a05bb098")}</button>
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-primary"
            onClick={() => {
              const [x, y] = PANEL_DEFAULT_MARKERS[panel];
              onChange(clampToPanel(panel, x, y));
            }}
          >{uiText("ui.place_at_the_panel_s_usual_position_a88bd5bc7e")}</button>
        )}
      </div>
    </div>
  );
}
