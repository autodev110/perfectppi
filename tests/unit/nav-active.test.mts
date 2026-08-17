import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Mirrors the Sidebar active-item rule.
function activeHref(items: string[], pathname: string): string | null {
  return items.reduce<string | null>((best, href) => {
    const isPortalRoot = href.split("/").filter(Boolean).length === 1;
    const matches = isPortalRoot
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
    if (!matches) return best;
    return best === null || href.length > best.length ? href : best;
  }, null);
}

const org = [
  "/org", "/org/technicians", "/org/inspections",
  "/org/inspections/dealerspace", "/tech/ppi", "/org/profile",
  "/org/messages", "/org/settings",
];

describe("sidebar active item", () => {
  test("the DealerSpace page does not also light up Inspections", () => {
    assert.equal(activeHref(org, "/org/inspections/dealerspace"), "/org/inspections/dealerspace");
  });

  test("a DealerSpace detail page stays on DealerSpace", () => {
    assert.equal(
      activeHref(org, "/org/inspections/dealerspace/abc-123"),
      "/org/inspections/dealerspace",
    );
  });

  test("the plain inspections queue still highlights Inspections", () => {
    assert.equal(activeHref(org, "/org/inspections"), "/org/inspections");
  });

  test("the portal root only matches itself", () => {
    assert.equal(activeHref(org, "/org"), "/org");
    assert.equal(activeHref(org, "/org/technicians"), "/org/technicians");
    // Dashboard must not stay lit on a page that has no nav entry of its own.
    assert.equal(activeHref(org, "/org/some-unlisted-page"), null);
  });

  test("matching is on a segment boundary, not a raw prefix", () => {
    assert.equal(activeHref(org, "/org/inspections-archive"), null);
  });

  test("an unknown path highlights nothing", () => {
    assert.equal(activeHref(org, "/dashboard"), null);
  });

  test("a cross-portal entry matches on its own path", () => {
    // Managers get a "My Inspections" entry pointing into the technician
    // portal; it must not disturb the /org entries around it.
    assert.equal(activeHref(org, "/tech/ppi"), "/tech/ppi");
    assert.equal(activeHref(org, "/tech/ppi/abc-123"), "/tech/ppi");
    assert.equal(activeHref(org, "/org/inspections"), "/org/inspections");
  });
});
