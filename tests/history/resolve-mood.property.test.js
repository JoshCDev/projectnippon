// tests/history/resolve-mood.property.test.js
//
// Property-based test for `resolveMood`.
//
// Property 8: Mood resolution.
//
// For any list of currently-rendered events `events` and any active
// Year_Range `yr`:
//   - When `events.length > 0`, `resolveMood(events, yr)` returns
//     `events[0].mood`.
//   - When `events.length === 0`, `resolveMood(events, yr)` returns
//     `yr.mood`.
//
// **Validates: Requirements 5.1, 5.6**

import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { loadMainJs } from "./setup.js";

// The five-value Mood enum, per requirements glossary and req 5.1.
const VALID_MOODS = ["dark", "positive", "negative", "sacred", "casual"];

// An event shape carrying just enough fields for `resolveMood` to inspect
// (`mood`). We let the rest be arbitrary so the property does not depend on
// any field other than the Mood of the first event.
const eventArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  mood: fc.constantFrom(...VALID_MOODS)
});

// Year_Range stub with a valid Mood. Other fields are unused by `resolveMood`
// but we include `id`, `label`, `from`, `to` to keep the shape realistic.
const yearRangeArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  label: fc.string({ minLength: 1, maxLength: 16 }),
  from: fc.integer({ min: -1000, max: 3000 }),
  to: fc.integer({ min: -1000, max: 3000 }),
  mood: fc.constantFrom(...VALID_MOODS)
});

describe("resolveMood (Property 8)", () => {
  let resolveMood;

  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
    resolveMood = window.NIPPON.history.resolveMood;
  });

  it("returns events[0].mood for any non-empty events array", () => {
    fc.assert(
      fc.property(
        fc.array(eventArb, { minLength: 1, maxLength: 12 }),
        yearRangeArb,
        (events, yearRange) => {
          expect(resolveMood(events, yearRange)).toBe(events[0].mood);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns yearRange.mood for any empty events array", () => {
    fc.assert(
      fc.property(yearRangeArb, (yearRange) => {
        expect(resolveMood([], yearRange)).toBe(yearRange.mood);
      }),
      { numRuns: 100 }
    );
  });
});
