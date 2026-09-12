import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { parseMarketplaceFilters, cleanFilters, filtersToSearchParams, hasActiveFilters, describeFilters } =
  await import("../../src/lib/marketplace/filters.ts");

describe("marketplace discovery filters (plan 25.1)", () => {
  test("parses query strings and drops unknown or invalid fields", () => {
    const filters = parseMarketplaceFilters(new URLSearchParams("make=Mazda&model=MX-5&minYear=2015&maxPrice=20000&maxMileage=60000&inspected=true&sellerType=member&sort=recently_inspected&evil=1"));
    assert.deepEqual(filters, {
      make: "Mazda", model: "MX-5", minYear: 2015, maxPrice: 20000, maxMileage: 60000, inspected: true, sellerType: "member", sort: "recently_inspected",
    });
    // A single invalid field invalidates nothing else silently: the whole set is dropped so a bad link cannot half-apply.
    assert.deepEqual(parseMarketplaceFilters({ make: "Mazda", sellerType: "dealer" }), {});
    assert.deepEqual(parseMarketplaceFilters({ minYear: "abc" }), {});
    assert.deepEqual(parseMarketplaceFilters({ make: ["Honda", "Mazda"], inspected: "0" }), { make: "Honda" });
  });

  test("clean drops empties, false, and the default sort", () => {
    assert.deepEqual(cleanFilters({ q: "", make: "  ", inspected: false, sort: "newest", region: "Portland" }), { make: "  ", region: "Portland" });
    assert.deepEqual(parseMarketplaceFilters({ make: "  ", sort: "newest" }), {});
    assert.equal(filtersToSearchParams({ maxPrice: 15000, inspected: true, sort: "price_asc" }).toString(), "maxPrice=15000&inspected=true&sort=price_asc");
  });

  test("sort alone is not an active filter", () => {
    assert.equal(hasActiveFilters({ sort: "price_desc" }), false);
    assert.equal(hasActiveFilters({ sort: "price_desc", inspected: true }), true);
    assert.equal(hasActiveFilters({}), false);
  });

  test("describes filters for chips and notices", () => {
    assert.equal(describeFilters({}), "All listings");
    assert.equal(
      describeFilters({ q: "club", make: "Mazda", model: "MX-5", minYear: 2015, maxPrice: 20000, transmission: "Manual", inspected: true, sellerType: "technician" }),
      "“club” · Mazda MX-5 · 2015–… · ≤ $20,000 · Manual · Inspected · Technician / shop",
    );
  });
});
