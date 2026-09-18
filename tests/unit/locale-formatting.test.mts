import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatCurrency, formatDate, formatDateTime, formatMileage, formatRelativeTime } from "../../src/lib/utils/formatting.ts";

describe("locale-aware display formatting", () => {
  test("keeps English defaults and accepts locale-specific numbers and currency", () => {
    assert.equal(formatMileage(12345), "12,345");
    assert.equal(formatCurrency(123456), "$1,234.56");
    assert.equal(formatMileage(12345, "de-DE"), new Intl.NumberFormat("de-DE").format(12345));
    assert.equal(formatCurrency(123456, "de-DE"), new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD" }).format(1234.56));
  });

  test("dates follow the supplied locale rather than a hard-coded US format", () => {
    const date = new Date("2026-09-18T12:30:00Z");
    assert.equal(formatDate(date, "de-DE"), new Intl.DateTimeFormat("de-DE", { year: "numeric", month: "short", day: "numeric" }).format(date));
    assert.equal(formatDateTime(date, "de-DE"), new Intl.DateTimeFormat("de-DE", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date));
  });

  test("relative times preserve compact English and handle future clock skew", (context) => {
    const now = Date.parse("2026-09-18T12:30:00Z");
    context.mock.method(Date, "now", () => now);
    assert.equal(formatRelativeTime(new Date(now - 10_000)), "just now");
    assert.equal(formatRelativeTime(new Date(now - 120_000)), "2m ago");
    assert.equal(formatRelativeTime(new Date(now + 120_000)), "in 2m");
    assert.equal(formatRelativeTime(new Date(now - 120_000), "de-DE"), new Intl.RelativeTimeFormat("de-DE", { style: "narrow", numeric: "auto" }).format(-2, "minute"));
  });
});
