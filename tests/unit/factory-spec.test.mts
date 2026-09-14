import assert from "node:assert/strict";
import { describe, test } from "node:test";

const {
  parseFactorySpec, normalizeDrivetrain, normalizeTransmissionStyle, normalizeBodyStyle,
  factorySpecSummary, compareToFactory, factoryConflict, prefillFromFactory,
} = await import("../../src/lib/vehicles/factory-spec.ts");

const spec = parseFactorySpec({
  source: "nhtsa_vpic", vin: "1G1YY22G115113112", decoded_at: "2026-09-14T00:00:00Z",
  year: 2001, make: "Chevrolet", model: "Corvette", trim: null, series: "Z06",
  body_class: "Coupe", doors: "2", drive_type: "RWD/Rear-Wheel Drive",
  engine_model: "LS6", displacement_l: "5.7", cylinders: "8", engine_hp: "385", fuel_type: "Gasoline",
  transmission_style: "Manual/Standard", transmission_speeds: "6", plant_country: "UNITED STATES (USA)", plant_city: "BOWLING GREEN", manufacturer: "GENERAL MOTORS LLC",
})!;

describe("factory spec vs current build (Renditions doc)", () => {
  test("parses vPIC values and normalizes drivetrain/transmission/body", () => {
    assert.ok(spec);
    assert.equal(spec.cylinders, 8);
    assert.equal(spec.displacement_l, 5.7);
    assert.equal(normalizeDrivetrain("AWD/All-Wheel Drive"), "AWD");
    assert.equal(normalizeDrivetrain("4x4"), "4WD");
    assert.equal(normalizeDrivetrain("Front-Wheel Drive"), "FWD");
    assert.equal(normalizeDrivetrain("rwd"), "RWD");
    assert.equal(normalizeDrivetrain("something else"), null);
    assert.equal(normalizeTransmissionStyle("6-speed manual"), "manual");
    assert.equal(normalizeTransmissionStyle("Automatic (AT)"), "automatic");
    assert.equal(normalizeTransmissionStyle("CVT"), "cvt");
    assert.equal(normalizeTransmissionStyle("7-speed PDK"), "dct");
    assert.equal(normalizeBodyStyle("Sport Utility Vehicle (SUV)/Multipurpose Passenger Vehicle (MPV)"), "SUV");
    assert.equal(normalizeBodyStyle("Sedan/Saloon"), "Sedan");
    assert.equal(parseFactorySpec({ source: "other", vin: "x" }), null);
  });

  test("summary reads like a spec sheet", () => {
    const summary = factorySpecSummary(spec);
    assert.equal(summary.engine, "5.7L 8-cyl 385 hp (LS6)");
    assert.equal(summary.transmission, "6-speed Manual");
    assert.equal(summary.drivetrain, "RWD");
    assert.equal(summary.body_style, "Coupe");
    assert.equal(summary.trim, "Z06");
  });

  test("AWD entered on a factory-RWD car is refused unless declared as a conversion", () => {
    const wrong = { engine: "5.7L", transmission: "6-speed manual", drivetrain: "AWD", body_style: "Coupe", trim: "Z06", engine_original: true, transmission_original: true, drivetrain_original: true };
    assert.match(factoryConflict(spec, wrong) ?? "", /decodes as RWD, but AWD was entered/);
    const declared = { ...wrong, drivetrain_original: false };
    assert.equal(factoryConflict(spec, declared), null);
    assert.equal(compareToFactory(spec, declared).find((row) => row.field === "drivetrain")?.status, "declared");
    assert.equal(compareToFactory(spec, wrong).find((row) => row.field === "drivetrain")?.status, "differs");
  });

  test("transmission style is enforced, engine text and trim only warn", () => {
    const auto = { engine: "2JZ-GTE 3.0L", transmission: "Automatic", drivetrain: "RWD", body_style: "Coupe", trim: "Base", engine_original: true, transmission_original: true, drivetrain_original: true };
    assert.match(factoryConflict(spec, auto) ?? "", /manual transmission/);
    const rows = compareToFactory(spec, { ...auto, transmission: "6-speed manual" });
    assert.equal(factoryConflict(spec, { ...auto, transmission: "6-speed manual" }), null);
    assert.equal(rows.find((row) => row.field === "engine")?.status, "differs");
    assert.equal(rows.find((row) => row.field === "trim")?.status, "differs");
    assert.equal(rows.find((row) => row.field === "transmission")?.status, "match");
  });

  test("nothing entered matches; unknown factory values never conflict", () => {
    const empty = { engine: null, transmission: null, drivetrain: null, body_style: null, trim: null, engine_original: true, transmission_original: true, drivetrain_original: true };
    assert.ok(compareToFactory(spec, empty).every((row) => row.status === "match"));
    assert.equal(factoryConflict(null, { ...empty, drivetrain: "AWD" }), null);
    const vague = parseFactorySpec({ ...spec, drive_type: "Unknown", transmission_style: null })!;
    assert.equal(factoryConflict(vague, { ...empty, drivetrain: "AWD", transmission: "CVT" }), null);
  });

  test("prefill fills only blanks", () => {
    const filled = prefillFromFactory(spec, { engine: "", transmission: "Automatic swap", drivetrain: null, body_style: undefined, trim: "" });
    assert.equal(filled.engine, "5.7L 8-cyl 385 hp (LS6)");
    assert.equal(filled.transmission, "Automatic swap");
    assert.equal(filled.drivetrain, "RWD");
    assert.equal(filled.body_style, "Coupe");
    assert.equal(filled.trim, "Z06");
  });
});
