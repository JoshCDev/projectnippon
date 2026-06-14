// tests/history/markers-for.property.test.js
//
// Property-based test for the pure derivation helper `markersFor`.
//
// Property 3 (from design.md "Correctness Properties"):
//   For any list of HistoryEvent records belonging to a single Year_Range,
//   `markersFor(yearRangeId, data)` returns the same list of
//   `{ year, month: integer | null }` pairs as a reference implementation
//   that:
//     (a) collects each distinct `(year, month|null)` pair (treating absent
//         `month` as `null`),
//     (b) deduplicates them,
//     (c) sorts ascending by `year`, with `month: null` sorting before any
//         numeric month within the same year, then ascending month.
//
// Equivalently: a marker for `(y, m)` exists in the result iff at least one
// event has `year === y` and `month === m` (with `m === null` matching events
// that have no `month` field), and the result is in canonical sorted order.
//
// **Validates: Requirements 3.2, 3.3, 3.6**

import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { loadMainJs } from "./setup.js";

const TARGET_YEAR_RANGE_ID = "yr1";
const OTHER_YEAR_RANGE_IDS = ["yr-other-a", "yr-other-b"];
const VALID_MOODS = ["dark", "positive", "negative", "sacred", "casual"];

// ---------------------------------------------------------------------------
// Loader bootstrap
// ---------------------------------------------------------------------------

function getMarkersFor() {
  if (
    !window.NIPPON ||
    !window.NIPPON.history ||
    typeof window.NIPPON.history.markersFor !== "function"
  ) {
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
  }
  return window.NIPPON.history.markersFor;
}

beforeAll(() => {
  // Ensure the helper is available before fast-check starts iterating.
  getMarkersFor();
});

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// Year range covering the integers in [-2000, 2999], following the task
// description. Numbers in this range exercise BC eras (negative years) and a
// reasonably wide modern range.
const yearArb = fc.integer({ min: -2000, max: 2999 });

// `month` is either absent (modeled as the sentinel `undefined` here, which
// the event-builder uses to omit the key entirely) or an integer in [1, 12].
const monthOptArb = fc.option(fc.integer({ min: 1, max: 12 }), {
  nil: undefined
});

/**
 * Build an event source object. The `monthOpt` sentinel is intentionally
 * mapped to "no `month` key" rather than `month: undefined`, because the
 * production helper distinguishes those two cases via `"month" in event`.
 */
function buildEvent({ id, yearRangeId, year, monthOpt, mood }) {
  const ev = {
    id,
    yearRangeId,
    year,
    title: "t",
    body: "b",
    mood
  };
  if (monthOpt !== undefined) ev.month = monthOpt;
  return ev;
}

// Event arbitrary for the target Year_Range "yr1".
const targetEventArb = fc
  .record({
    year: yearArb,
    monthOpt: monthOptArb,
    mood: fc.constantFrom(...VALID_MOODS)
  })
  .map((raw) => ({
    yearRangeId: TARGET_YEAR_RANGE_ID,
    year: raw.year,
    monthOpt: raw.monthOpt,
    mood: raw.mood
  }));

// Event arbitrary for some OTHER Year_Range. These events must be filtered
// out by `markersFor("yr1", data)`.
const otherEventArb = fc
  .record({
    yearRangeId: fc.constantFrom(...OTHER_YEAR_RANGE_IDS),
    year: yearArb,
    monthOpt: monthOptArb,
    mood: fc.constantFrom(...VALID_MOODS)
  });

// A list of events mixing target and other year ranges. The list length is
// kept modest (up to 24) so generation stays fast while still producing
// duplicates and varied sort orders.
const eventListArb = fc
  .array(fc.oneof(targetEventArb, otherEventArb), {
    minLength: 0,
    maxLength: 24
  })
  .map((rawEvents) =>
    rawEvents.map((raw, index) =>
      buildEvent({
        id: `evt-${index}`,
        yearRangeId: raw.yearRangeId,
        year: raw.year,
        monthOpt: raw.monthOpt,
        mood: raw.mood
      })
    )
  );

// ---------------------------------------------------------------------------
// Reference implementation
//
// Independent of the production code: walks the events, treats absent
// `month` as `null`, dedupes via a string key, and sorts using the
// canonical comparator (year ascending; within a year, `null` month before
// any numeric month; then numeric month ascending).
// ---------------------------------------------------------------------------

function referenceMarkersFor(yearRangeId, events) {
  const seen = new Set();
  const markers = [];
  for (const event of events) {
    if (event.yearRangeId !== yearRangeId) continue;
    const hasMonthKey = Object.prototype.hasOwnProperty.call(event, "month");
    const month = hasMonthKey ? event.month : null;
    const key = `${event.year}:${month === null ? "null" : String(month)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push({ year: event.year, month });
  }
  markers.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month === b.month) return 0;
    if (a.month === null) return -1;
    if (b.month === null) return 1;
    return a.month - b.month;
  });
  return markers;
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("markersFor (Property 3, validates Requirements 3.2, 3.3, 3.6)", () => {
  it("matches a reference implementation for any list of events", () => {
    const markersFor = getMarkersFor();

    fc.assert(
      fc.property(eventListArb, (events) => {
        const data = { events };
        const actual = markersFor(TARGET_YEAR_RANGE_ID, data);
        const expected = referenceMarkersFor(TARGET_YEAR_RANGE_ID, events);
        expect(actual).toStrictEqual(expected);
      }),
      { numRuns: 200 }
    );
  });
});
