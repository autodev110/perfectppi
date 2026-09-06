import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  COMPLETE_SECTION_ORDER,
  DENTS_TIRES_SECTION_ORDER,
  SECTION_QUESTION_TEMPLATES,
  VEHICLE_BASICS_VIN_PROMPT,
  getSectionOrder,
} from "../../src/features/ppi/constants.ts";
import {
  buildQuestionOrder,
  deferQuestion,
} from "../../src/features/ppi/workflow-order.ts";
import {
  buildObdAnswerPrefills,
  OBD_ANSWER_PROMPTS,
} from "../../src/features/obd/answer-prefills.ts";
import { inspectionDisplayName } from "../../src/features/ppi/presentation.ts";
import { isValidVin } from "../../src/lib/utils/vin.ts";
import {
  inspectionAnswerValidationError,
  numberInputConstraints,
} from "../../src/features/ppi/answer-validation.ts";

describe("inspection question flow", () => {
  test("starts with vehicle details, exterior, interior, then road test", () => {
    assert.deepEqual(COMPLETE_SECTION_ORDER.slice(0, 4), [
      "vehicle_basics",
      "exterior",
      "interior",
      "road_test",
    ]);
  });

  test("asks for VIN first", () => {
    assert.equal(
      SECTION_QUESTION_TEMPLATES.vehicle_basics[0]?.prompt,
      VEHICLE_BASICS_VIN_PROMPT,
    );
  });

  // Uniqueness is per scope, not global. Dents & Tires deliberately reuses the
  // complete inspection's tread wording so the two read identically to an
  // inspector — renaming one to "fix a duplicate" would be a regression, not a
  // cleanup. What must never happen is the same prompt twice inside one
  // inspection, where an answer could no longer be identified by its prompt.
  for (const scope of ["complete", "dents_tires"] as const) {
    test(`keeps every prompt unique within a ${scope} inspection`, () => {
      const normalizedPrompts = getSectionOrder(scope)
        .flatMap((sectionType) => SECTION_QUESTION_TEMPLATES[sectionType] ?? [])
        .map((question) => question.prompt.trim().toLocaleLowerCase());

      assert.ok(normalizedPrompts.length > 0);
      assert.equal(new Set(normalizedPrompts).size, normalizedPrompts.length);
    });
  }

  test("scopes a dents & tires inspection to wheels and body damage", () => {
    assert.deepEqual(DENTS_TIRES_SECTION_ORDER, ["wheels_tires", "body_damage"]);
    assert.deepEqual(getSectionOrder("dents_tires"), DENTS_TIRES_SECTION_ORDER);
    assert.deepEqual(getSectionOrder("complete"), COMPLETE_SECTION_ORDER);

    // No brakes, engine, interior, or road test.
    for (const excluded of ["engine_bay", "road_test", "fluids", "interior"] as const) {
      assert.ok(!DENTS_TIRES_SECTION_ORDER.includes(excluded));
    }
  });

  test("requires a photo of every tire in a dents & tires inspection", () => {
    const tires = SECTION_QUESTION_TEMPLATES.wheels_tires.filter((question) =>
      question.prompt.includes("tread depth"),
    );

    assert.equal(tires.length, 4);
    for (const tire of tires) {
      assert.equal(tire.requiresPhoto, true, tire.prompt);
      assert.equal(tire.isRequired, true, tire.prompt);
      assert.ok(tire.photoPrompt);
    }

    // The rim question and every body-damage area stay optional, but each still
    // offers a photo.
    const optional = [
      ...SECTION_QUESTION_TEMPLATES.wheels_tires.filter(
        (question) => !question.prompt.includes("tread depth"),
      ),
      ...SECTION_QUESTION_TEMPLATES.body_damage,
    ];
    assert.equal(optional.length, 7);
    for (const question of optional) {
      assert.notEqual(question.isRequired, true, question.prompt);
      assert.notEqual(question.requiresPhoto, true, question.prompt);
      assert.ok(question.photoPrompt, question.prompt);
    }
  });

  test("accepts only whole-number tread readings from 0/32 through 32/32", () => {
    const prompt = "Front left tire tread depth (in 32nds of an inch)";
    assert.deepEqual(numberInputConstraints(prompt), {
      min: 0,
      max: 32,
      step: 1,
      unit: "/32 in",
    });
    for (const value of ["0", "2", "32"]) {
      assert.equal(inspectionAnswerValidationError({
        prompt,
        answerType: "number",
        value,
        required: true,
      }), null);
    }
    for (const value of ["", "-1", "33", "2.5", "2abc"]) {
      assert.ok(inspectionAnswerValidationError({
        prompt,
        answerType: "number",
        value,
        required: true,
      }));
    }
  });

  test("keeps all four tire tread questions together", () => {
    const prompts = SECTION_QUESTION_TEMPLATES.tires_brakes.map(
      (question) => question.prompt,
    );
    assert.deepEqual(prompts.slice(0, 4), [
      "Front left tire tread depth (in 32nds of an inch)",
      "Front right tire tread depth (in 32nds of an inch)",
      "Rear left tire tread depth (in 32nds of an inch)",
      "Rear right tire tread depth (in 32nds of an inch)",
    ]);
  });

  test("does not require a photo for the visible leak question", () => {
    const leakQuestion = SECTION_QUESTION_TEMPLATES.engine_bay.find(
      (question) => question.prompt === "Are there any visible oil or fluid leaks?",
    );
    assert.ok(leakQuestion);
    assert.notEqual(leakQuestion.requiresPhoto, true);
  });

  test("does not repeat the windows check in the door-lock question", () => {
    const prompts = SECTION_QUESTION_TEMPLATES.electrical_controls.map(
      (question) => question.prompt,
    );
    assert.ok(prompts.includes("Do all windows operate correctly?"));
    assert.ok(prompts.includes("Do all door locks work from the driver switch?"));
    assert.ok(!prompts.includes("Do all door locks and windows work from the driver switch?"));
  });
});

describe("OBD inspection answer prefills", () => {
  test("prefills VIN, MIL state, and an explicit no-code scan result", () => {
    const prefills = buildObdAnswerPrefills({
      vin: "1HGCM82633A004352",
      monitorStatus: { milOn: false },
      storedDTCs: [],
      pendingDTCs: [],
      permanentDTCs: [],
      rawStoredDtcsResponse: "43 00 00",
      rawPendingDtcsResponse: "47 00 00",
    });

    assert.equal(prefills.get(OBD_ANSWER_PROMPTS.vin), "1HGCM82633A004352");
    assert.equal(prefills.get(OBD_ANSWER_PROMPTS.checkEngine), "no");
    assert.equal(
      prefills.get(OBD_ANSWER_PROMPTS.dtcCodes),
      "Scanned - no DTC codes found",
    );
    assert.equal(prefills.has(OBD_ANSWER_PROMPTS.warningLights), false);
  });

  test("deduplicates codes and marks the MIL warning when it is on", () => {
    const prefills = buildObdAnswerPrefills({
      monitorStatus: { milOn: true },
      storedDTCs: ["p0300"],
      pendingDTCs: ["P0300", "P0420"],
    });

    assert.equal(prefills.get(OBD_ANSWER_PROMPTS.warningLights), "yes");
    assert.equal(
      prefills.get(OBD_ANSWER_PROMPTS.activeWarningLights),
      "Check engine light (MIL)",
    );
    assert.equal(
      prefills.get(OBD_ANSWER_PROMPTS.dtcCodes),
      "Scanned - P0300, P0420",
    );
  });

  test("does not claim a clean DTC scan after incomplete ECU responses", () => {
    const prefills = buildObdAnswerPrefills({
      monitorStatus: { milOn: false },
      storedDTCs: [],
      pendingDTCs: [],
      rawStoredDtcsResponse: "43 00 00",
      rawPendingDtcsResponse: "NO DATA",
    });

    assert.equal(prefills.has(OBD_ANSWER_PROMPTS.dtcCodes), false);
  });
});

describe("VIN validation", () => {
  test("accepts international VINs without enforcing a North American check digit", () => {
    assert.equal(isValidVin("WVWZZZ1JZXW000001"), true);
  });

  test("still rejects invalid characters and incorrect length", () => {
    assert.equal(isValidVin("WVWZZZ1JZXW00000I"), false);
    assert.equal(isValidVin("WVWZZZ1JZXW00001"), false);
  });
});

describe("inspection display names", () => {
  test("combines year, make, model, and inspection type", () => {
    assert.equal(
      inspectionDisplayName(
        { year: 2019, make: "Acura", model: "TLX" },
        "personal",
      ),
      "2019 Acura TLX Personal",
    );
  });
});

describe("deferred inspection questions", () => {
  test("moves skipped questions behind the normal inspection flow", () => {
    const questionIds = ["vin", "exterior", "transmission", "interior"];
    const firstSkip = deferQuestion(questionIds, [], "transmission");

    assert.equal(firstSkip.nextQuestionId, "interior");
    assert.deepEqual(
      buildQuestionOrder(questionIds, firstSkip.deferredQuestionIds),
      ["vin", "exterior", "interior", "transmission"],
    );
  });

  test("preserves the order of multiple skipped questions", () => {
    const questionIds = ["a", "b", "c", "d"];
    const firstSkip = deferQuestion(questionIds, [], "b");
    const secondSkip = deferQuestion(
      questionIds,
      firstSkip.deferredQuestionIds,
      "c",
    );

    assert.deepEqual(buildQuestionOrder(questionIds, secondSkip.deferredQuestionIds), [
      "a",
      "d",
      "b",
      "c",
    ]);
    assert.equal(secondSkip.nextQuestionId, "d");
  });

  test("does not allow the final remaining question to be skipped", () => {
    assert.deepEqual(deferQuestion(["a"], [], "a"), {
      deferredQuestionIds: [],
      nextQuestionId: null,
    });
  });
});
