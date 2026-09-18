import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { containsContactDetails, CONTACT_SHARING_WARNING } = await import("../../src/lib/messages/contact-warning.ts");

describe("contact-sharing caution (plan 22.3)", () => {
  test("detects emails and phone-shaped numbers", () => {
    assert.equal(containsContactDetails("reach me at dan.k@example.com"), true);
    assert.equal(containsContactDetails("call 404-555-0134"), true);
    assert.equal(containsContactDetails("text me: (404) 555 0134"), true);
    assert.equal(containsContactDetails("+1 404 555 0134 anytime"), true);
    assert.equal(containsContactDetails("+44 7700 900123"), true);
  });

  test("ignores ordinary automotive numbers", () => {
    assert.equal(containsContactDetails("Asking $67,700, 50,000 mi, 2022 R8"), false);
    assert.equal(containsContactDetails("VIN ends in 4821, mileage 118432"), false);
    assert.equal(containsContactDetails("Torque to 96 ft-lb, 10w-40 oil, P0420 code"), false);
    assert.equal(containsContactDetails(""), false);
  });

  test("the warning names the no-payment rule", () => {
    assert.match(CONTACT_SHARING_WARNING, /never asks for payment/);
  });
});
