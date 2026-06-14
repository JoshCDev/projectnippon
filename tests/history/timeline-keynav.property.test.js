// tests/history/timeline-keynav.property.test.js
//
// Property-based test for the TimelineBar's modular tablist keyboard
// navigation, covering Task 7.5 of the history-timeline-bar spec.
//
// Property 12 (from design.md "Correctness Properties"):
//   For any tablist row of N >= 1 buttons (eras row or markers row) and for
//   any sequence of k arrow-key presses where each press is ArrowLeft
//   (delta -1) or ArrowRight (delta +1), starting from the active index i0,
//   the active and focused index after the sequence equals
//     ((i0 + sum(deltas)) mod N + N) mod N
//   with focus and activation moving together.
//
// **Validates: Requirements 8.5, 8.6**

import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { loadMainJs } from "./setup.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_MOODS = ["dark", "positive", "negative", "sacred", "casual"];

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

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

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

/**
 * Build a valid HistoryData payload from a list of marker counts. Each entry
 * `markerCounts[i]` is the number of distinct Time_Markers (and therefore
 * events, one per marker) belonging to year range `yr-i`. Markers are made
 * distinct by varying month from 1..M_i, so each year range in the payload
 * has exactly markerCounts[i] markers after derivation.
 */
function buildPayload(markerCounts) {
  const yearRanges = markerCounts.map((_, i) => ({
    id: `yr-${i}`,
    label: `Era${i}`,
    from: 1000 + i * 100,
    to: 1099 + i * 100,
    mood: VALID_MOODS[i % VALID_MOODS.length]
  }));

  const events = [];
  markerCounts.forEach((M, i) => {
    for (let j = 0; j < M; j++) {
      events.push({
        id: `e-${String(i).padStart(2, "0")}-${String(j).padStart(2, "0")}`,
        yearRangeId: `yr-${i}`,
        year: 1000 + i * 100,
        month: j + 1,
        title: `Title ${i}-${j}`,
        body: `Body ${i}-${j}`,
        mood: VALID_MOODS[(i + j) % VALID_MOODS.length]
      });
    }
  });

  return {
    page: makePage(),
    yearRanges,
    events
  };
}

/**
 * Replace `document.body` with a freshly scaffolded TimelineBar root, return
 * references to the root and both tablist rows. Each property iteration calls
 * this so previous DOM nodes (and their listeners) are dropped before mount.
 */
function setupDom() {
  document.body.innerHTML =
    '<div data-history-timeline-root>' +
    '  <div data-timeline-eras role="tablist"></div>' +
    '  <div data-timeline-markers role="tablist"></div>' +
    "</div>";
  return {
    root: document.querySelector("[data-history-timeline-root]"),
    erasRow: document.querySelector("[data-timeline-eras]"),
    markersRow: document.querySelector("[data-timeline-markers]")
  };
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
 * Apply the property's central assertions to a tablist row that has at
 * least one button rendered. Determines the initial active index `i0`
 * directly from the DOM (the design auto-selects the first item in both
 * rows after loadSuccess, but reading from the DOM keeps the test robust to
 * future changes in the default selection rule).
 */
function applyKeysAndAssert(row, keys) {
  const buttons = Array.from(row.querySelectorAll('button[role="tab"]'));
  const N = buttons.length;
  expect(N).toBeGreaterThanOrEqual(1);

  const i0 = buttons.findIndex((b) => b.classList.contains("is-active"));
  expect(i0).not.toBe(-1);

  // Per-task setup: focus the first button before sending any keys. The
  // implementation reads document.activeElement only as a fallback when no
  // button has `is-active`, but immediately after loadSuccess one button
  // already does, so this focus does not bias the active-index selection.
  buttons[0].focus();

  let sumDeltas = 0;
  for (const k of keys) {
    sumDeltas += k === "ArrowLeft" ? -1 : 1;
    dispatchKey(row, k);
  }

  const expectedIndex = (((i0 + sumDeltas) % N) + N) % N;

  // Re-query because every state-changing key triggers a re-render that
  // replaces the row's children with fresh button nodes.
  const refreshed = Array.from(row.querySelectorAll('button[role="tab"]'));
  expect(refreshed.length).toBe(N);

  // Single-active-button invariant within the row.
  const activeButtons = refreshed.filter((b) =>
    b.classList.contains("is-active")
  );
  expect(activeButtons.length).toBe(1);

  // The active button is exactly the one at the modular expected index, and
  // it carries both `is-active` and `aria-selected="true"`.
  expect(refreshed[expectedIndex].classList.contains("is-active")).toBe(true);
  expect(refreshed[expectedIndex].getAttribute("aria-selected")).toBe("true");

  // Focus and activation move together. After the last keypress, focus must
  // be on the same button that is `is-active`. With zero keys, the test
  // setup focused buttons[0]; in our generator i0 = 0 (the default
  // selection auto-picks index 0 in both rows), so focus also equals
  // refreshed[expectedIndex] and the assertion still holds.
  expect(document.activeElement).toBe(refreshed[expectedIndex]);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// N year ranges in [1, 8]. Each yearRange has [1, 6] markers, which also
// guarantees the markers row of the default-active range yr-0 is non-empty
// (so the markers row arm of the property test is always exercised).
const markerCountsArb = fc.array(fc.integer({ min: 1, max: 6 }), {
  minLength: 1,
  maxLength: 8
});

// Up to 25 arrow-key presses per iteration. Includes k = 0 to cover the
// no-op case (no presses) where the expected index equals i0 directly.
const keySeqArb = fc.array(fc.constantFrom("ArrowLeft", "ArrowRight"), {
  minLength: 0,
  maxLength: 25
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TimelineBar tablist keyboard navigation (Property 12, validates Requirements 8.5, 8.6)", () => {
  beforeEach(() => {
    // Fresh main.js per `it` so the TimelineBar module's closure variables
    // start in their initial state. Inside each fast-check iteration we
    // reuse the loaded module and only swap the DOM, which is supported by
    // TimelineBar.mount (it tears down the previous subscription).
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
  });

  it("eras row: index after k arrow-key presses equals ((i0 + sum(deltas)) mod N + N) mod N, focus tracks activation", () => {
    fc.assert(
      fc.property(markerCountsArb, keySeqArb, (markerCounts, keys) => {
        const { root, erasRow } = setupDom();

        const validate = window.NIPPON.history.loader.validate;
        const data = validate(buildPayload(markerCounts));

        const state = window.NIPPON.history.createHistoryState();
        window.NIPPON.history.TimelineBar.mount(root, state);
        state.loadSuccess(data);

        applyKeysAndAssert(erasRow, keys);
      }),
      { numRuns: 50 }
    );
  });

  it("markers row: index after k arrow-key presses equals ((i0 + sum(deltas)) mod M + M) mod M, focus tracks activation", () => {
    fc.assert(
      fc.property(markerCountsArb, keySeqArb, (markerCounts, keys) => {
        const { root, markersRow } = setupDom();

        const validate = window.NIPPON.history.loader.validate;
        const data = validate(buildPayload(markerCounts));

        const state = window.NIPPON.history.createHistoryState();
        window.NIPPON.history.TimelineBar.mount(root, state);
        state.loadSuccess(data);

        // The default-active range is yr-0, which has markerCounts[0] >= 1
        // markers by construction, so the markers row is guaranteed to host
        // at least one button when this assertion runs.
        applyKeysAndAssert(markersRow, keys);
      }),
      { numRuns: 50 }
    );
  });
});
