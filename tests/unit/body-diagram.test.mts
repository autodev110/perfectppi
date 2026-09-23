import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import {
  BODY_DIAGRAM_SHAPES,
  PANEL_DEFAULT_MARKERS,
  PANEL_REGIONS,
  clampToPanel,
  markerOnPanel,
  nudgeMarker,
} from "../../src/features/ppi/body-diagram.ts";
import { BODY_PANELS, validateObservation, type BodyPanel } from "../../src/features/ppi/inspection-schema.ts";
import { renderInspectionReportPdf } from "../../src/lib/pdf/inspection-report/render.ts";
import { sampleViewModel } from "./inspection-report-samples.mts";
import { buildFacts, cleanObservations, observed, v2Sections } from "./inspection-v2-fixtures.mts";

const inside = (panel: BodyPanel, point: { x: number; y: number }) => markerOnPanel(panel, point);

describe("body diagram geometry", () => {
  test("every panel has a region inside the diagram that holds its default position", () => {
    for (const panel of BODY_PANELS) {
      const [x0, y0, x1, y1] = PANEL_REGIONS[panel];
      assert.ok(0 <= x0 && x0 < x1 && x1 <= 1 && 0 <= y0 && y0 < y1 && y1 <= 1, panel);
      const [x, y] = PANEL_DEFAULT_MARKERS[panel];
      assert.ok(inside(panel, { x, y }), `${panel} default marker is off its panel`);
    }
  });

  test("left and right panels mirror each other", () => {
    for (const panel of BODY_PANELS.filter((name) => name.startsWith("left_"))) {
      const [lx0, ly0, lx1, ly1] = PANEL_REGIONS[panel];
      const [rx0, ry0, rx1, ry1] = PANEL_REGIONS[panel.replace("left_", "right_") as BodyPanel];
      assert.deepEqual([ly0, ly1], [ry0, ry1], panel);
      assert.ok(Math.abs(lx0 - (1 - rx1)) < 1e-9 && Math.abs(lx1 - (1 - rx0)) < 1e-9, panel);
    }
  });

  test("a tap is clamped onto the target panel, never a neighbouring one", () => {
    // Tapping the hood while marking the left front door lands on the door.
    const marker = clampToPanel("left_front_door", 0.5, 0.15);
    assert.deepEqual(marker, { view: "top", x: 0.3, y: 0.32 });
    assert.ok(inside("left_front_door", marker));
    assert.equal(inside("hood", marker), false);
    assert.deepEqual(clampToPanel("roof", 0.41234, 0.5), { view: "top", x: 0.412, y: 0.5 });
    // Keyboard nudges start from the default position and stay on the panel.
    let moved = nudgeMarker("left_rocker", null, 0, 0);
    for (let step = 0; step < 50; step += 1) moved = nudgeMarker("left_rocker", moved, 0.01, 0);
    assert.ok(inside("left_rocker", moved));
    assert.equal(moved.x, PANEL_REGIONS.left_rocker[2]);
  });

  test("the iOS diagram uses the same numbers", () => {
    const swift = readFileSync(new URL("../../mobile-app/PerfectPPI/Core/Models/BodyDiagram.swift", import.meta.url), "utf8");
    const [regionsBlock, defaultsBlock] = swift.split("static let defaultMarkers");
    const numbers = (text: string) => text.split(",").map((part) => Number(part.trim()));
    const regions = Object.fromEntries(
      [...regionsBlock.matchAll(/"(\w+)": \(([\d., ]+)\)/g)].map((match) => [match[1], numbers(match[2])]),
    );
    const defaults = Object.fromEntries(
      [...defaultsBlock.matchAll(/"(\w+)": \(([\d., ]+)\)/g)].map((match) => [match[1], numbers(match[2])]),
    );
    assert.deepEqual(regions, Object.fromEntries(Object.entries(PANEL_REGIONS).map(([key, value]) => [key, [...value]])));
    assert.deepEqual(defaults, Object.fromEntries(Object.entries(PANEL_DEFAULT_MARKERS).map(([key, value]) => [key, [...value]])));
    const rect = (name: string) => {
      const match = new RegExp(`static let ${name} = Rect\\(x: ([\\d.]+), y: ([\\d.]+), w: ([\\d.]+), h: ([\\d.]+)\\)`).exec(swift);
      assert.ok(match, name);
      return { x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) };
    };
    assert.deepEqual(rect("body"), BODY_DIAGRAM_SHAPES.body);
    assert.deepEqual(rect("cabin"), BODY_DIAGRAM_SHAPES.cabin);
    const wheels = [...swift.matchAll(/ {8}Rect\(x: ([\d.]+), y: ([\d.]+), w: ([\d.]+), h: ([\d.]+)\)/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      w: Number(match[3]),
      h: Number(match[4]),
    }));
    assert.deepEqual(wheels, BODY_DIAGRAM_SHAPES.wheels);
    assert.match(swift, new RegExp(`static let seams: \\[Double\\] = \\[${BODY_DIAGRAM_SHAPES.seams.join(", ")}\\]`));
  });
});

describe("body damage markers", () => {
  const damage = (marker: unknown) => ({
    v: 1,
    state: "observed",
    value: { condition: "damage_present", defects: [{ id: "abcd1", type: "dent", severity: "moderate", marker }] },
    source: "inspector_entry",
  });

  test("a marker on its panel is stored with its view; an off-panel marker is rejected", () => {
    const placed = validateObservation("body.left_front_door.condition", damage({ x: 0.26, y: 0.4 }));
    assert.equal(placed.ok, true);
    assert.deepEqual(placed.ok && (placed.observation.value as { defects: { marker: unknown }[] }).defects[0].marker, { view: "top", x: 0.26, y: 0.4 });

    const onHood = validateObservation("body.left_front_door.condition", damage({ view: "top", x: 0.5, y: 0.15 }));
    assert.equal(onHood.ok, false);
    assert.match(!onHood.ok ? onHood.error : "", /left front door/);
    assert.equal(validateObservation("body.left_front_door.condition", damage({ view: "side", x: 0.26, y: 0.4 })).ok, false);
    assert.equal(validateObservation("body.other_body_panel.condition", damage({ view: "top", x: 0.8, y: 0.9 })).ok, true);
  });

  test("the report draws recorded markers where they were placed, each on its own panel", async () => {
    const markers = [
      { x: 0.24, y: 0.35 },
      { x: 0.24, y: 0.35 },
      { x: 0.24, y: 0.35 },
      // Recorded before the regions existed, or edited by hand: clamped back.
      { x: 0.5, y: 0.15 },
    ];
    const facts = buildFacts(
      "dents_tires",
      v2Sections("dents_tires", {
        ...cleanObservations("dents_tires"),
        "body.left_front_door.condition": observed({
          condition: "damage_present",
          defects: markers.map((marker, index) => ({ id: `lfd-${index + 1}`, type: "dent", severity: "moderate", marker: { view: "top", ...marker } })),
        }),
        "body.hood.condition": observed({ condition: "damage_present", defects: [{ id: "hood-1", type: "scratch", severity: "minor" }] }),
      }),
    );
    const { vm, report } = await sampleViewModel(facts);
    assert.equal(vm.markers.length, 5);
    const doorFindings = report.assessment.findings.filter((finding) => finding.ref.startsWith("B") && finding.panels[0] === "left_front_door");
    const doorMarkers = vm.markers.filter((marker) => doorFindings.some((finding) => finding.ref.slice(1) === marker.ref));
    assert.equal(doorMarkers.length, 4);
    assert.deepEqual({ x: doorMarkers[0].x, y: doorMarkers[0].y }, { x: 0.24, y: 0.35 }, "first marker keeps its tapped position");
    for (const marker of doorMarkers) assert.ok(inside("left_front_door", marker), `marker ${marker.ref} left its panel`);
    // Colliding markers are spread out within the panel.
    const distinct = new Set(doorMarkers.map((marker) => `${marker.x},${marker.y}`));
    assert.equal(distinct.size, doorMarkers.length);
    const hood = vm.markers.find((marker) => !doorMarkers.includes(marker))!;
    assert.deepEqual({ x: hood.x, y: hood.y }, { x: 0.5, y: 0.15 }, "unplaced findings use the panel's default position");
    const pdf = await PDFDocument.load(await renderInspectionReportPdf(vm));
    assert.equal(pdf.getPageCount(), 2);
  });
});
