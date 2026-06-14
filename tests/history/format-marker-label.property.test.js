// tests/history/format-marker-label.property.test.js
//
// Property-based test for the pure helper `formatMarkerLabel` exposed at
// `window.NIPPON.history.formatMarkerLabel`.
//
// Property 4: Time_Marker label formatting.
//
// For any `year` (any integer), any `month` that is either `null` or an
// integer in `[1, 12]`, and any 12-element `monthNames` array of non-empty
// strings, `formatMarkerLabel(year, month, monthNames)` returns:
//   - `monthNames[month - 1] + " " + String(year)` when `month` is an integer
//     in `[1, 12]`,
//   - `String(year)` when `month` is `null`.
//
// **Validates: Requirements 3.4**

import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { loadMainJs } from "./setup.js";

// Generator for a 12-element array of non-empty strings. Using
// `fc.string({ minLength: 1 })` ensures every entry is a non-empty string,
// matching the contract documented in the design (`page.monthNames` is a
// fixed-length array of localized month names).
const monthNamesArb = fc.array(fc.string({ minLength: 1 }), {
  minLength: 12,
  maxLength: 12
});

// Any safe integer for `year` - the spec allows negative years for BC-style
// eras and arbitrarily large positive years.
const yearArb = fc.integer();

// Months covered by the property: integers in [1, 12].
const monthArb = fc.integer({ min: 1, max: 12 });

describe("formatMarkerLabel (Property 4)", () => {
  let formatMarkerLabel;

  beforeEach(() => {
    // Reset the loader-side effects between tests so we always exercise a
    // clean copy of `window.NIPPON.history`.
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
    formatMarkerLabel = window.NIPPON.history.formatMarkerLabel;
  });

  it("returns String(year) when month is null", () => {
    fc.assert(
      fc.property(yearArb, monthNamesArb, (year, monthNames) => {
        expect(formatMarkerLabel(year, null, monthNames)).toBe(String(year));
      }),
      { numRuns: 100 }
    );
  });

  it("returns `monthNames[month-1] + \" \" + year` for any month in [1, 12]", () => {
    fc.assert(
      fc.property(yearArb, monthArb, monthNamesArb, (year, month, monthNames) => {
        expect(formatMarkerLabel(year, month, monthNames)).toBe(
          monthNames[month - 1] + " " + String(year)
        );
      }),
      { numRuns: 100 }
    );
  });
});
