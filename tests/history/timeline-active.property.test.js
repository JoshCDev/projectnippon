// tests/history/timeline-active.property.test.js
//
// Property-based test for the TimelineBar's "single-active-button" invariant.
//
// Property 6 (from design.md "Correctness Properties"):
//   For any sequence of TimelineBar interactions (clicks and ArrowLeft /
//   ArrowRight / Home / End presses on either row), after each step:
//     - The eras tablist has exactly one button with `is-active`,
//       `aria-selected="true"`, and `aria-current="true"`.
//     - The markers tablist has exactly one such button when the active
//       Year_Range has at least one Time_Marker, otherwise zero.
//     - Re-activating the already-active Year_Range does not change which
//       buttons are active.
//
// **Validates: Requirements 2.4, 3.7, 3.8, 3.9**

import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { loadMainJs } from "./setup.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
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
];

const VALID_MOODS = ["dark", "positive", "negative", "sacred", "casual"];

function makePage() {
  return {
    eyebrow: "Eyebrow",
    title: "Title",
    intro: "Intro",
    emptyStateTitle: "Empty title",
    emptyStateBody: "Empty body",
    loadErrorMessage: "Load error",
    loadingMessage: "Loading",
    placeholderBadge: "Konten contoh",
    selectionAnnouncementTemplate: "Era {yearRange}, {month} {year}",
    monthNames: MONTH_NAMES.slice()
  };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const moodArb = fc.constantFrom(...VALID_MOODS);

// A Year_Range that is guaranteed to have at least one event - so its
// derived Time_Marker list is non-empty. This exercises the
// "exactly one active marker" branch of the invariant.
const rangeWithEventsArb = fc.record({
  mood: moodArb,
  fromYear: fc.integer({ min: 0, max: 500 }),
  spanYears: fc.integer({ min: 0, max: 100 }),
  eventSpecs: fc.array(
    fc.record({
      // year offset stays inside [from, to] so events look coherent in DOM
      // even though the loader is not run here.
      yearOffset: fc.integer({ min: 0, max: 100 }),
      // `undefined` means "month key absent" -> year-only marker (req 3.6).
      monthOpt: fc.option(fc.integer({ min: 1, max: 12 }), { nil: undefined }),
      mood: moodArb
    }),
    { minLength: 1, maxLength: 4 }
  )
});

// A Year_Range that has zero events - so its derived Time_Marker list is
// empty. This exercises req 3.9 ("no marker is marked active when the
// active Year_Range has zero markers").
const rangeWithoutEventsArb = fc.record({
  mood: moodArb,
  fromYear: fc.integer({ min: 0, max: 500 }),
  spanYears: fc.integer({ min: 0, max: 100 })
});

// Build a HistoryData payload with a mix of populated and empty
// Year_Ranges. The data is already in the normalized shape that
// `state.loadSuccess` expects, so it skips the loader.
const dataArb = fc
  .tuple(
    fc.array(rangeWithEventsArb, { minLength: 1, maxLength: 3 }),
    fc.array(rangeWithoutEventsArb, { minLength: 1, maxLength: 2 })
  )
  .map(([withEvents, withoutEvents]) => {
    const yearRanges = [];
    const events = [];
    let eventCounter = 0;

    // Interleave so the populated and empty ranges are not lumped together;
    // this exposes any off-by-one in the eras-row navigation logic.
    const maxLen = Math.max(withEvents.length, withoutEvents.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < withoutEvents.length) {
        const spec = withoutEvents[i];
        yearRanges.push({
          id: `yr-empty-${i}`,
          label: `Empty${i}`,
          from: spec.fromYear,
          to: spec.fromYear + spec.spanYears,
          mood: spec.mood
        });
      }
      if (i < withEvents.length) {
        const spec = withEvents[i];
        const id = `yr-full-${i}`;
        yearRanges.push({
          id,
          label: `Full${i}`,
          from: spec.fromYear,
          to: spec.fromYear + spec.spanYears,
          mood: spec.mood
        });
        spec.eventSpecs.forEach((ev) => {
          const event = {
            id: `evt-${String(eventCounter++).padStart(3, "0")}`,
            yearRangeId: id,
            year: spec.fromYear + ev.yearOffset,
            title: "T",
            body: "B",
            mood: ev.mood
          };
          if (ev.monthOpt !== undefined) {
            event.month = ev.monthOpt;
          }
          events.push(event);
        });
      }
    }

    return {
      page: makePage(),
      // The default Year_Range is the first one - it might be empty or
      // populated depending on the generated mix, so the initial render
      // already exercises both branches of the invariant.
      defaultYearRangeId: yearRanges[0].id,
      yearRanges,
      events
    };
  });

// Each action either targets the eras row or the markers row. `index` is
// taken mod the current count so it is always in range; clicks on an empty
// markers row are silently skipped by the apply step.
const actionArb = fc.oneof(
  fc.record({
    type: fc.constant("clickEra"),
    index: fc.integer({ min: 0, max: 100 })
  }),
  fc.record({ type: fc.constant("arrowLeftEras") }),
  fc.record({ type: fc.constant("arrowRightEras") }),
  fc.record({ type: fc.constant("homeEras") }),
  fc.record({ type: fc.constant("endEras") }),
  fc.record({
    type: fc.constant("clickMarker"),
    index: fc.integer({ min: 0, max: 100 })
  }),
  fc.record({ type: fc.constant("arrowLeftMarkers") }),
  fc.record({ type: fc.constant("arrowRightMarkers") })
);

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

// Loaded once per file. fast-check then iterates against the same module
// singletons; each iteration rebuilds the DOM scaffold and re-mounts the
// TimelineBar against a freshly created state store.
beforeAll(() => {
  document.body.innerHTML = "";
  delete window.NIPPON;
  loadMainJs(window);
});

function setupTimeline(data) {
  document.body.innerHTML =
    '<main>' +
    '  <section data-history-timeline>' +
    '    <div data-timeline-eras role="tablist"></div>' +
    '    <div data-timeline-markers role="tablist"></div>' +
    '  </section>' +
    '</main>';
  const root = document.querySelector("[data-history-timeline]");
  const state = window.NIPPON.history.createHistoryState();
  window.NIPPON.history.TimelineBar.mount(root, state);
  state.loadSuccess(data);
  return { state, root };
}

function getButtons(row) {
  return Array.from(row.querySelectorAll('button[role="tab"]'));
}

function fullyActiveButtons(row) {
  return getButtons(row).filter(
    (b) =>
      b.classList.contains("is-active") &&
      b.getAttribute("aria-selected") === "true" &&
      b.getAttribute("aria-current") === "true"
  );
}

function dispatchKey(row, key) {
  const event = new window.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true
  });
  row.dispatchEvent(event);
}

/**
 * Apply one action to the mounted TimelineBar. Returns a small descriptor
 * object that the caller can use to make extra per-action assertions
 * (currently only `clickEra` exposes a "was already active?" hint so the
 * test can verify req 3.7's no-op semantics).
 */
function applyAction(action, root, state) {
  const erasRow = root.querySelector("[data-timeline-eras]");
  const markersRow = root.querySelector("[data-timeline-markers]");

  switch (action.type) {
    case "clickEra": {
      const buttons = getButtons(erasRow);
      if (buttons.length === 0) return { kind: "no-op" };
      const targetIdx = action.index % buttons.length;
      const targetBtn = buttons[targetIdx];
      const targetId = targetBtn.dataset.yearRangeId;
      const before = state.getState().selection;
      const wasAlreadyActive = before.yearRangeId === targetId;
      const prevYear = before.year;
      const prevMonth = before.month;
      targetBtn.click();
      return {
        kind: "clickEra",
        wasAlreadyActive,
        prevYear,
        prevMonth
      };
    }
    case "clickMarker": {
      const buttons = getButtons(markersRow);
      if (buttons.length === 0) return { kind: "no-op" };
      const targetIdx = action.index % buttons.length;
      buttons[targetIdx].click();
      return { kind: "clickMarker" };
    }
    case "arrowLeftEras":
      dispatchKey(erasRow, "ArrowLeft");
      return { kind: "key" };
    case "arrowRightEras":
      dispatchKey(erasRow, "ArrowRight");
      return { kind: "key" };
    case "homeEras":
      dispatchKey(erasRow, "Home");
      return { kind: "key" };
    case "endEras":
      dispatchKey(erasRow, "End");
      return { kind: "key" };
    case "arrowLeftMarkers":
      dispatchKey(markersRow, "ArrowLeft");
      return { kind: "key" };
    case "arrowRightMarkers":
      dispatchKey(markersRow, "ArrowRight");
      return { kind: "key" };
    default:
      return { kind: "no-op" };
  }
}

/**
 * Assert the single-active-button invariant after a render step.
 *
 * Req 2.4: exactly one era button is fully active.
 * Req 3.8: exactly one marker button is fully active when the active
 *          Year_Range has at least one Time_Marker.
 * Req 3.9: zero marker buttons carry any of the three "active"
 *          attributes when the active Year_Range has no Time_Markers.
 */
function assertInvariants(state, root, data) {
  const erasRow = root.querySelector("[data-timeline-eras]");
  const markersRow = root.querySelector("[data-timeline-markers]");

  // ---- Eras row: exactly one active button (req 2.4) -------------------
  const activeEras = fullyActiveButtons(erasRow);
  expect(activeEras).toHaveLength(1);
  expect(activeEras[0].dataset.yearRangeId).toBe(
    state.getState().selection.yearRangeId
  );

  // ---- Markers row: zero or exactly one active, depending on data -----
  const activeYearRangeId = state.getState().selection.yearRangeId;
  const markers = window.NIPPON.history.markersFor(activeYearRangeId, data);

  const allMarkerButtons = getButtons(markersRow);
  const activeMarkers = fullyActiveButtons(markersRow);

  if (markers.length > 0) {
    expect(activeMarkers).toHaveLength(1);
    const activeBtn = activeMarkers[0];
    const expectedYear = String(state.getState().selection.year);
    const expectedMonth = state.getState().selection.month;
    expect(activeBtn.dataset.year).toBe(expectedYear);
    if (expectedMonth === null) {
      expect(activeBtn.dataset.month).toBeUndefined();
    } else {
      expect(activeBtn.dataset.month).toBe(String(expectedMonth));
    }
  } else {
    // Req 3.9: no marker button has any of the three "active" attributes.
    expect(activeMarkers).toHaveLength(0);
    for (const btn of allMarkerButtons) {
      expect(btn.classList.contains("is-active")).toBe(false);
      expect(btn.getAttribute("aria-selected")).not.toBe("true");
      expect(btn.getAttribute("aria-current")).not.toBe("true");
    }
  }
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("TimelineBar single-active-button invariant (Property 6)", () => {
  it("preserves the invariant after any interaction sequence", () => {
    fc.assert(
      fc.property(
        dataArb,
        fc.array(actionArb, { minLength: 0, maxLength: 12 }),
        (data, actions) => {
          const { state, root } = setupTimeline(data);

          // Initial render must already satisfy the invariant.
          assertInvariants(state, root, data);

          for (const action of actions) {
            const beforeMarker = {
              year: state.getState().selection.year,
              month: state.getState().selection.month
            };

            const info = applyAction(action, root, state);

            assertInvariants(state, root, data);

            // Req 3.7: re-clicking the already-active era button keeps
            // both the year-range AND the active marker unchanged.
            if (info.kind === "clickEra" && info.wasAlreadyActive) {
              const after = state.getState().selection;
              expect(after.year).toBe(beforeMarker.year);
              expect(after.month).toBe(beforeMarker.month);
            }
          }
        }
      ),
      { numRuns: 80 }
    );
  });
});
