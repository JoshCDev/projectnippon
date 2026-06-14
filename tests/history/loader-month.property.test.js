// tests/history/loader-month.property.test.js
//
// Property-based test for HistoryDataLoader's `month` field handling.
//
// Property 2: Loader preserves missing month as missing and drops invalid
// months with a warning.
//
// For any candidate event:
//   - When source has no `month` key, the loaded record has no `month` key.
//   - When source has `month` that is an integer in [1, 12], the loaded
//     record carries the same integer value.
//   - When source has `month` whose value is not an integer in [1, 12]
//     (floats, strings, null, out-of-range integers), the event is excluded
//     from the loaded result and `console.warn` is called with a message
//     containing the event's `id`.
//
// **Validates: Requirements 1.5, 1.6**

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import { loadMainJs } from "./setup.js";

const VALID_MOODS = ["dark", "positive", "negative", "sacred", "casual"];

// Minimal valid `page` payload (every required key present and non-empty).
// The loader does not inspect the values beyond the structural checks, so
// short placeholder strings are fine here.
const VALID_PAGE = Object.freeze({
  eyebrow: "e",
  title: "t",
  intro: "i",
  emptyStateTitle: "et",
  emptyStateBody: "eb",
  loadErrorMessage: "le",
  loadingMessage: "lm",
  placeholderBadge: "pb",
  selectionAnnouncementTemplate: "{yearRange} {year}",
  monthNames: [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember"
  ]
});

// One year range that all generated events will reference, so per-event
// `yearRangeId` validation never causes a drop in this test. That keeps the
// only "drop reason" the loader can hit the month check.
const VALID_YEAR_RANGES = Object.freeze([
  Object.freeze({ id: "yr1", label: "Range", from: 0, to: 9999, mood: "casual" })
]);

// Three flavors of `month` field shape:
//   - 'absent'  : the source object has no `month` key at all.
//   - 'valid'   : the source object has `month` set to an integer in [1, 12].
//   - 'invalid' : the source object has `month` set to a non-integer-in-[1,12]
//                 value (float, out-of-range integer, string, or null).
const monthShapeArb = fc.oneof(
  fc.constant({ kind: "absent" }),
  fc.integer({ min: 1, max: 12 }).map((value) => ({ kind: "valid", value })),
  fc
    .oneof(
      // Non-integer finite doubles in a reasonable range.
      fc
        .double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true })
        .filter((v) => !Number.isInteger(v)),
      // Integers explicitly outside [1, 12].
      fc.integer().filter((v) => v < 1 || v > 12),
      // Arbitrary strings - including the empty string and unicode.
      fc.string(),
      // Explicit JSON null.
      fc.constant(null)
    )
    .map((value) => ({ kind: "invalid", value }))
);

// Per-event shape - everything except `id` (which we assign by index so the
// loader sees stable, unique ids across the generated batch).
const eventShapeArb = fc.record({
  monthShape: monthShapeArb,
  year: fc.integer({ min: 0, max: 9999 }),
  mood: fc.constantFrom(...VALID_MOODS)
});

const eventsArb = fc.array(eventShapeArb, { minLength: 0, maxLength: 12 });

/**
 * Build an event source object from a generated shape. When the shape is
 * 'absent' the `month` key is intentionally not assigned, so the resulting
 * object has no own `month` property. For 'valid' and 'invalid' shapes the
 * key is set (even if the value is `null`) so the loader sees `'month' in
 * event` as `true`.
 */
function buildEvent(index, shape) {
  const ev = {
    id: `evt-${index}`,
    yearRangeId: "yr1",
    year: shape.year,
    title: "t",
    body: "b",
    mood: shape.mood
  };
  if (shape.monthShape.kind === "valid") {
    ev.month = shape.monthShape.value;
  } else if (shape.monthShape.kind === "invalid") {
    ev.month = shape.monthShape.value;
  }
  // 'absent' -> deliberately leave `month` key off the object.
  return ev;
}

describe("HistoryDataLoader month-field handling (Property 2)", () => {
  let validateHistoryData;
  let warnSpy;

  beforeEach(() => {
    // Reset the module side-effects before each test so that loadMainJs
    // re-installs `window.NIPPON` against a clean global.
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
    validateHistoryData = window.NIPPON.HistoryDataLoader.validate;

    // Capture warnings emitted by the loader. We mock the implementation so
    // the test output stays clean; assertions read from `warnSpy.mock.calls`.
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (warnSpy) warnSpy.mockRestore();
  });

  it("preserves absent months, keeps valid months, and drops invalid months with a warning", () => {
    fc.assert(
      fc.property(eventsArb, (eventShapes) => {
        // Reset the spy per iteration so warnings from previous iterations
        // don't bleed into this one's assertions.
        warnSpy.mockClear();

        const events = eventShapes.map((shape, index) => buildEvent(index, shape));
        const data = {
          page: VALID_PAGE,
          yearRanges: VALID_YEAR_RANGES.map((yr) => ({ ...yr })),
          events
        };

        const result = validateHistoryData(data);
        const loadedById = new Map(result.events.map((e) => [e.id, e]));

        eventShapes.forEach((shape, index) => {
          const id = `evt-${index}`;

          if (shape.monthShape.kind === "absent") {
            // Loader must keep the event and must not synthesize a `month`.
            expect(loadedById.has(id)).toBe(true);
            const loaded = loadedById.get(id);
            // Use `'month' in loaded` rather than `loaded.month === undefined`
            // so we genuinely verify the absence of the key.
            expect("month" in loaded).toBe(false);
            expect(
              Object.prototype.hasOwnProperty.call(loaded, "month")
            ).toBe(false);
          } else if (shape.monthShape.kind === "valid") {
            // Loader must keep the event and preserve the month value.
            expect(loadedById.has(id)).toBe(true);
            const loaded = loadedById.get(id);
            expect("month" in loaded).toBe(true);
            expect(loaded.month).toBe(shape.monthShape.value);
          } else {
            // Loader must drop the event and emit a warning naming its id.
            expect(loadedById.has(id)).toBe(false);
            const warnedAboutId = warnSpy.mock.calls.some((call) =>
              call.some(
                (arg) => typeof arg === "string" && arg.includes(id)
              )
            );
            expect(warnedAboutId).toBe(true);
          }
        });
      }),
      { numRuns: 100 }
    );
  });
});
