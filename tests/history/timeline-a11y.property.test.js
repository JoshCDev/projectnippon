// tests/history/timeline-a11y.property.test.js
//
// Property-based test for the accessibility structure of the Timeline_Bar.
//
// Property 10 (from design.md "Correctness Properties"):
//   For any valid HistoryData, after the TimelineBar renders:
//     - the eras row has role="tablist" and the markers row has role="tablist"
//     - every Year_Range and Time_Marker control is a `<button type="button">`
//       with role="tab"
//     - at all times during any interaction sequence, exactly the active
//       button per row has aria-selected="true" while the others have
//       aria-selected="false" — UNLESS the markers row has zero Time_Markers,
//       in which case no button exists in that row.
//
// Note about role="tablist": the role is applied by the page scaffold
// (history.html) on the same element that carries the `data-timeline-eras`
// and `data-timeline-markers` hooks, NOT by the TimelineBar itself. The test
// scaffold below mirrors history.html so the assertion exercises the real
// production wiring rather than something the test injected after the fact.
//
// **Validates: Requirements 8.1, 8.2**

import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { loadMainJs } from "./setup.js";

// ---------------------------------------------------------------------------
// Constants mirroring the production data shape
// ---------------------------------------------------------------------------

const VALID_MOODS = ["dark", "positive", "negative", "sacred", "casual"];

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

// ---------------------------------------------------------------------------
// Scaffold matching the relevant subset of history.html
// ---------------------------------------------------------------------------

/**
 * Reset the document body to the same scaffold the page ships with. The
 * `role="tablist"` and `aria-label` attributes live on the rows themselves
 * (the elements that also carry `data-timeline-eras` / `data-timeline-markers`)
 * and are owned by the HTML scaffold rather than by the TimelineBar module.
 */
function buildScaffold() {
  document.body.innerHTML = `
    <main id="main-content" class="history-page" data-history-root>
      <section class="history-timeline" aria-label="Linimasa sejarah" data-history-timeline>
        <div class="container" data-history-timeline-container>
          <div class="history-timeline-eras"
               role="tablist"
               aria-label="Era sejarah"
               data-timeline-eras></div>
          <div class="history-timeline-markers"
               role="tablist"
               aria-label="Bulan dalam era terpilih"
               data-timeline-markers></div>
        </div>
      </section>
    </main>
  `;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// A Year_Range shape with `to >= from`, drawn from a span wide enough to
// realistically host events but bounded to keep iteration cheap.
const yearRangeShapeArb = fc
  .tuple(fc.integer({ min: -1000, max: 2500 }), fc.nat({ max: 800 }))
  .map(([from, span]) => ({ from, to: from + span }));

const labelArb = fc.string({ minLength: 1, maxLength: 6 });

/**
 * Produce a fully-shaped `HistoryData` payload with `1..4` Year_Ranges and
 * `0..8` events. Every event is anchored to an existing Year_Range so the
 * loader's "drop event with unknown yearRangeId" branch is never exercised
 * (this property is about the rendered structure, not about validation
 * fall-back). `defaultYearRangeId` always points at `yearRanges[0]` so the
 * eras row has a guaranteed initial active button.
 */
const dataArb = fc
  .array(
    fc.record({
      shape: yearRangeShapeArb,
      label: labelArb,
      mood: fc.constantFrom(...VALID_MOODS)
    }),
    { minLength: 1, maxLength: 4 }
  )
  .chain((ranges) => {
    const yearRanges = ranges.map((r, i) => ({
      id: `yr-${i}`,
      label: r.label,
      from: r.shape.from,
      to: r.shape.to,
      mood: r.mood
    }));
    const eventArb = fc.record({
      rangeIndex: fc.integer({ min: 0, max: yearRanges.length - 1 }),
      yearOffset: fc.nat({ max: 1024 }),
      monthOpt: fc.option(fc.integer({ min: 1, max: 12 }), { nil: undefined }),
      mood: fc.constantFrom(...VALID_MOODS)
    });
    return fc
      .array(eventArb, { minLength: 0, maxLength: 8 })
      .map((rawEvents) => {
        const events = rawEvents.map((e, i) => {
          const range = yearRanges[e.rangeIndex];
          const span = Math.max(0, range.to - range.from);
          const year = range.from + (e.yearOffset % (span + 1));
          const ev = {
            id: `evt-${i}`,
            yearRangeId: range.id,
            year,
            title: "t",
            body: "b",
            mood: e.mood
          };
          if (e.monthOpt !== undefined) ev.month = e.monthOpt;
          return ev;
        });
        return {
          page: {
            eyebrow: "e",
            title: "t",
            intro: "i",
            emptyStateTitle: "et",
            emptyStateBody: "eb",
            loadErrorMessage: "lem",
            loadingMessage: "lm",
            placeholderBadge: "pb",
            selectionAnnouncementTemplate: "{yearRange} {year}",
            monthNames: MONTH_NAMES.slice()
          },
          defaultYearRangeId: yearRanges[0].id,
          yearRanges,
          events
        };
      });
  });

// A small interaction language exercised against the mounted TimelineBar.
// `idx` is interpreted modulo the current button count so every action
// resolves to a concrete control even when the row has only a handful of
// buttons or is empty (in which case clicks are treated as no-ops).
const actionArb = fc.oneof(
  fc.record({ kind: fc.constant("clickEra"), idx: fc.nat({ max: 64 }) }),
  fc.record({ kind: fc.constant("clickMarker"), idx: fc.nat({ max: 64 }) }),
  fc.record({
    kind: fc.constant("keyEras"),
    key: fc.constantFrom("ArrowLeft", "ArrowRight", "Home", "End")
  }),
  fc.record({
    kind: fc.constant("keyMarkers"),
    key: fc.constantFrom("ArrowLeft", "ArrowRight", "Home", "End")
  })
);

const actionsArb = fc.array(actionArb, { minLength: 0, maxLength: 8 });

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Verify the accessibility invariants for a single tablist row:
 *   - the row itself carries `role="tablist"` (set by the scaffold)
 *   - every direct child is a `<button type="button">` with `role="tab"`
 *   - every button has `aria-selected` set to either "true" or "false"
 *   - either zero buttons are present (only valid for the markers row when
 *     the active Year_Range has no Time_Markers) OR exactly one button has
 *     `aria-selected="true"`.
 */
function assertRowA11y(row) {
  expect(row.getAttribute("role")).toBe("tablist");
  const children = Array.from(row.children);
  for (const child of children) {
    expect(child.tagName).toBe("BUTTON");
    expect(child.getAttribute("type")).toBe("button");
    expect(child.getAttribute("role")).toBe("tab");
    const sel = child.getAttribute("aria-selected");
    expect(sel === "true" || sel === "false").toBe(true);
  }
  const activeCount = children.filter(
    (c) => c.getAttribute("aria-selected") === "true"
  ).length;
  if (children.length === 0) {
    expect(activeCount).toBe(0);
  } else {
    expect(activeCount).toBe(1);
  }
}

function dispatchClick(button) {
  button.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true })
  );
}

function dispatchKeydown(row, key) {
  row.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true
    })
  );
}

function performAction(action, erasRow, markersRow) {
  if (action.kind === "clickEra") {
    const buttons = erasRow.querySelectorAll('button[role="tab"]');
    if (buttons.length === 0) return;
    dispatchClick(buttons[action.idx % buttons.length]);
  } else if (action.kind === "clickMarker") {
    const buttons = markersRow.querySelectorAll('button[role="tab"]');
    if (buttons.length === 0) return;
    dispatchClick(buttons[action.idx % buttons.length]);
  } else if (action.kind === "keyEras") {
    dispatchKeydown(erasRow, action.key);
  } else if (action.kind === "keyMarkers") {
    dispatchKeydown(markersRow, action.key);
  }
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("TimelineBar accessibility structure (Property 10)", () => {
  beforeAll(() => {
    // Load main.js once so `window.NIPPON.history.{createHistoryState,
    // TimelineBar}` is available for every iteration. The TimelineBar module
    // tears down its previous subscription on each `mount` call, so we can
    // safely re-mount against a fresh scaffold without leaking listeners.
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
  });

  it("preserves role wiring and the per-row exactly-one-active invariant under any interaction sequence", () => {
    fc.assert(
      fc.property(dataArb, actionsArb, (data, actions) => {
        buildScaffold();

        const { createHistoryState, TimelineBar } = window.NIPPON.history;
        const container = document.querySelector(
          "[data-history-timeline-container]"
        );
        const erasRow = document.querySelector("[data-timeline-eras]");
        const markersRow = document.querySelector("[data-timeline-markers]");

        const state = createHistoryState();
        TimelineBar.mount(container, state);
        state.loadSuccess(data);

        // Initial render must already satisfy the invariant.
        assertRowA11y(erasRow);
        assertRowA11y(markersRow);

        for (const action of actions) {
          performAction(action, erasRow, markersRow);
          assertRowA11y(erasRow);
          assertRowA11y(markersRow);
        }
      }),
      { numRuns: 50 }
    );
  });
});
