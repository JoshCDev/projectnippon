// tests/history/content-panel-live.property.test.js
//
// Property-based test for the ContentPanel's `aria-live="polite"`
// announcement region.
//
// Property 11 (from design.md "Correctness Properties"):
//   For any sequence of TimelineBar interactions, the live region's
//   `textContent` changes after a step iff the active
//   `(yearRangeId, year, month)` triple differs from the last announced
//   triple, and when it changes the new text equals
//   `page.selectionAnnouncementTemplate` with `{yearRange}` substituted
//   by the active YearRange's `label`, `{year}` by the active year, and
//   `{month}` by `monthNames[month - 1]` (or with the leading
//   `, {month}` segment stripped when the marker is year-only).
//
// **Validates: Requirements 8.3, 8.4**
//
// The harness mirrors `content-panel.property.test.js` (task 8.2): each
// fast-check iteration validates a generated payload through the loader's
// `validate`, mounts both the TimelineBar and the ContentPanel against a
// shared `createHistoryState`, dispatches `state.loadSuccess(data)`, then
// drives a sequence of `setYearRange` / `setTimeMarker` calls (including
// natural redundant calls so the dedup paths are exercised). After each
// step we observe the live region's textContent and check it against the
// announcement we predict from the active selection.
//
// Per the task notes: redundant transitions are filtered out by
// `HistoryState` itself (the no-op early return prevents listener
// notification entirely), and `ContentPanel.maybeAnnounce` adds a second
// dedup via `lastSelectionKey`. The test does not model the internal
// `lastSelectionKey` directly; it only asserts the externally-observable
// behavior: the textContent equals the predicted string after every step.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { loadMainJs } from "./setup.js";

// ---------------------------------------------------------------------------
// Constants matching the loader's documented schema
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

// The selection-announcement template uses the documented placeholders
// `{yearRange}`, `{year}`, and the optional `, {month}` segment that the
// implementation strips when the active marker is year-only. Holding the
// template constant across iterations keeps the predicted-string
// computation simple and matches the design's documented format.
const ANNOUNCEMENT_TEMPLATE = "Era {yearRange}, {month} {year}";

// ---------------------------------------------------------------------------
// Module bootstrap
// ---------------------------------------------------------------------------

let createHistoryState;
let TimelineBar;
let ContentPanel;
let validate;
let markersFor;

function ensureHistoryModule() {
  if (
    !window.NIPPON ||
    !window.NIPPON.history ||
    typeof window.NIPPON.history.createHistoryState !== "function" ||
    !window.NIPPON.history.TimelineBar ||
    !window.NIPPON.history.ContentPanel ||
    !window.NIPPON.history.loader ||
    typeof window.NIPPON.history.loader.validate !== "function" ||
    typeof window.NIPPON.history.markersFor !== "function"
  ) {
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
  }
  createHistoryState = window.NIPPON.history.createHistoryState;
  TimelineBar = window.NIPPON.history.TimelineBar;
  ContentPanel = window.NIPPON.history.ContentPanel;
  validate = window.NIPPON.history.loader.validate;
  markersFor = window.NIPPON.history.markersFor;
}

beforeAll(() => {
  ensureHistoryModule();
  // The loader's per-event soft drops and the `defaultYearRangeId` fallback
  // emit warnings on branches fast-check explores. Quiet that channel so
  // test output stays readable; those warning paths are validated by other
  // property tests.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

beforeEach(() => {
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// Generators for VALID HistoryData payloads
// ---------------------------------------------------------------------------

const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 16 })
  .filter((s) => s.length > 0);

const moodArb = fc.constantFrom(...VALID_MOODS);
const yearArb = fc.integer({ min: -200, max: 2200 });

const pageArb = fc.record({
  eyebrow: nonEmptyStringArb,
  title: nonEmptyStringArb,
  intro: nonEmptyStringArb,
  emptyStateTitle: nonEmptyStringArb,
  emptyStateBody: nonEmptyStringArb,
  loadErrorMessage: nonEmptyStringArb,
  loadingMessage: nonEmptyStringArb,
  placeholderBadge: nonEmptyStringArb,
  selectionAnnouncementTemplate: fc.constant(ANNOUNCEMENT_TEMPLATE),
  monthNames: fc.constant(MONTH_NAMES.slice())
});

const yearRangeBaseArb = fc
  .tuple(nonEmptyStringArb, nonEmptyStringArb, moodArb, yearArb, yearArb)
  .map(([id, label, mood, a, b]) => ({
    id,
    label,
    mood,
    from: Math.min(a, b),
    to: Math.max(a, b)
  }));

function eventArbForRanges(yearRangeIds) {
  return fc
    .record({
      id: nonEmptyStringArb,
      yearRangeId: fc.constantFrom(...yearRangeIds),
      year: yearArb,
      title: nonEmptyStringArb,
      body: nonEmptyStringArb,
      mood: moodArb,
      monthOpt: fc.option(fc.integer({ min: 1, max: 12 }), { nil: undefined })
    })
    .map((raw) => {
      const out = {
        id: raw.id,
        yearRangeId: raw.yearRangeId,
        year: raw.year,
        title: raw.title,
        body: raw.body,
        mood: raw.mood
      };
      if (raw.monthOpt !== undefined) out.month = raw.monthOpt;
      return out;
    });
}

// The non-trivial events list is enforced by `minLength: 1` so most
// iterations have a real default selection that produces an initial
// announcement; setting it any higher would hide the year-only empty
// branches we still want to exercise via the `setYearRange` action when
// fast-check picks a range that happens to have zero events.
const validHistoryDataArb = fc
  .record({
    page: pageArb,
    yearRangesBase: fc.array(yearRangeBaseArb, { minLength: 2, maxLength: 4 })
  })
  .chain(({ page, yearRangesBase }) => {
    const yearRanges = yearRangesBase.map((yr, i) => ({
      ...yr,
      id: `${yr.id}__yr${i}`
    }));
    const ids = yearRanges.map((yr) => yr.id);
    return fc
      .record({
        events: fc.array(eventArbForRanges(ids), { minLength: 1, maxLength: 10 })
      })
      .map(({ events }) => ({
        page,
        yearRanges,
        events: events.map((e, i) => ({ ...e, id: `${e.id}__ev${i}` }))
      }));
  });

// ---------------------------------------------------------------------------
// Action generator
//
// Each action picks either a Year_Range or a Time_Marker via array indices
// modulo the relevant count. Because indices are unconstrained integers,
// fast-check naturally produces redundant transitions (selecting the
// already-active Year_Range, or the already-active Time_Marker), which
// exercise the documented dedup paths.
// ---------------------------------------------------------------------------

const actionArb = fc.oneof(
  fc.record({
    type: fc.constant("setYearRange"),
    rangeIndex: fc.integer({ min: 0, max: 100 })
  }),
  fc.record({
    type: fc.constant("setTimeMarker"),
    markerIndex: fc.integer({ min: 0, max: 100 })
  })
);

const actionSequenceArb = fc.array(actionArb, { minLength: 0, maxLength: 12 });

// ---------------------------------------------------------------------------
// DOM scaffold helpers (mirrors the 8.2 ContentPanel scaffold)
// ---------------------------------------------------------------------------

function buildScaffold() {
  document.body.innerHTML = "";
  const root = document.createElement("main");
  root.setAttribute("data-history-root", "");
  root.className = "history-page";

  const timelineSection = document.createElement("section");
  timelineSection.className = "history-timeline";
  timelineSection.setAttribute("data-history-timeline", "");

  const tlContainer = document.createElement("div");
  tlContainer.className = "container";

  const eras = document.createElement("div");
  eras.className = "history-timeline-eras";
  eras.setAttribute("role", "tablist");
  eras.setAttribute("data-timeline-eras", "");

  const markers = document.createElement("div");
  markers.className = "history-timeline-markers";
  markers.setAttribute("role", "tablist");
  markers.setAttribute("data-timeline-markers", "");

  tlContainer.appendChild(eras);
  tlContainer.appendChild(markers);
  timelineSection.appendChild(tlContainer);

  const contentSection = document.createElement("section");
  contentSection.className = "history-content";
  contentSection.setAttribute("data-history-content", "");

  const head = document.createElement("header");
  head.className = "history-content-head";
  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  eyebrow.setAttribute("data-history-eyebrow", "");
  const title = document.createElement("h1");
  title.className = "page-placeholder-title";
  title.setAttribute("data-history-title", "");
  const intro = document.createElement("p");
  intro.className = "lead";
  intro.setAttribute("data-history-intro", "");
  head.appendChild(eyebrow);
  head.appendChild(title);
  head.appendChild(intro);

  const eventsContainer = document.createElement("div");
  eventsContainer.className = "history-content-events";
  eventsContainer.setAttribute("data-history-events", "");

  const live = document.createElement("p");
  live.className = "history-live";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("data-history-live", "");

  contentSection.appendChild(head);
  contentSection.appendChild(eventsContainer);
  contentSection.appendChild(live);

  root.appendChild(timelineSection);
  root.appendChild(contentSection);
  document.body.appendChild(root);

  return { root, timelineSection, contentSection, liveEl: live };
}

// ---------------------------------------------------------------------------
// Action application (drives the state through its public API)
// ---------------------------------------------------------------------------

function applyAction(action, state, data) {
  switch (action.type) {
    case "setYearRange": {
      const ranges = data.yearRanges;
      if (ranges.length === 0) return;
      const target = ranges[action.rangeIndex % ranges.length];
      state.setYearRange(target.id);
      return;
    }
    case "setTimeMarker": {
      const sel = state.getState().selection;
      if (sel.yearRangeId === null || sel.yearRangeId === undefined) return;
      const markers = markersFor(sel.yearRangeId, data);
      if (markers.length === 0) return;
      const target = markers[action.markerIndex % markers.length];
      state.setTimeMarker(target.year, target.month);
      return;
    }
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Predicted-text model
//
// A pure mirror of the documented `buildAnnouncement` logic in `main.js`:
//   1. Strip the literal `, {month}` segment when `month` is null.
//   2. Substitute `{yearRange}`, `{year}`, and `{month}`.
// We re-implement (rather than reach into `main.js`) so the property
// independently anchors what the announcement should look like.
// ---------------------------------------------------------------------------

function predictAnnouncement(template, label, year, month, monthNames) {
  let result = String(template);
  if (month === null || month === undefined) {
    result = result.replace(", {month}", "");
  }
  result = result.split("{yearRange}").join(String(label));
  result = result.split("{year}").join(String(year));
  if (
    typeof month === "number" &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    Array.isArray(monthNames) &&
    typeof monthNames[month - 1] === "string"
  ) {
    result = result.split("{month}").join(monthNames[month - 1]);
  } else {
    result = result.split("{month}").join("");
  }
  return result;
}

function findRange(data, id) {
  for (const range of data.yearRanges) {
    if (range.id === id) return range;
  }
  return null;
}

function triplesEqual(a, b) {
  if (a === null || b === null) return a === b;
  return (
    a.yearRangeId === b.yearRangeId &&
    a.year === b.year &&
    a.month === b.month
  );
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("ContentPanel live-region announcement (Property 11, validates Requirements 8.3, 8.4)", () => {
  it(
    "updates aria-live textContent only when the active " +
      "(yearRangeId, year, month) triple actually changes, and the new " +
      "text matches selectionAnnouncementTemplate with the documented " +
      "substitutions",
    () => {
      ensureHistoryModule();

      fc.assert(
        fc.property(validHistoryDataArb, actionSequenceArb, (rawPayload, actions) => {
          const data = validate(rawPayload);

          const { timelineSection, contentSection, liveEl } = buildScaffold();
          const state = createHistoryState();
          TimelineBar.mount(timelineSection, state);
          ContentPanel.mount(contentSection, state);

          // ---------------------------------------------------------------
          // Predicted-state model
          //
          //   `lastAnnouncedTriple` - the triple that produced the text
          //     currently in the live region. Stays null until a non-null
          //     year selection has been observed.
          //   `expectedText` - the predicted live region textContent.
          //
          // The model assigns to `expectedText` only when the implementation
          // is required to write to the live region: status === 'ready',
          // selection.year is non-null, and the triple differs from
          // `lastAnnouncedTriple`. Otherwise the prediction stays where it
          // is, mirroring the implementation's "leave previous text in
          // place" branch (no Time_Marker / status not ready).
          // ---------------------------------------------------------------
          let lastAnnouncedTriple = null;
          let expectedText = "";

          function step() {
            const s = state.getState();
            if (s.status !== "ready") return;
            if (
              s.selection.yearRangeId === null ||
              s.selection.yearRangeId === undefined
            ) {
              return;
            }
            if (s.selection.year === null || s.selection.year === undefined) {
              // Year-less selection (active Year_Range with zero events):
              // the implementation does not announce, so the live region
              // keeps whatever text it last carried.
              return;
            }
            const currTriple = {
              yearRangeId: s.selection.yearRangeId,
              year: s.selection.year,
              month:
                s.selection.month === undefined ? null : s.selection.month
            };
            if (triplesEqual(currTriple, lastAnnouncedTriple)) return;

            const range = findRange(data, currTriple.yearRangeId);
            // `validate` keeps `data.yearRanges` intact so the active id
            // always resolves to a Year_Range.
            expect(range).not.toBeNull();

            expectedText = predictAnnouncement(
              data.page.selectionAnnouncementTemplate,
              range.label,
              currTriple.year,
              currTriple.month,
              data.page.monthNames
            );
            lastAnnouncedTriple = currTriple;
          }

          // Drive loadSuccess: the orchestrator's first transition. The
          // ContentPanel renders, computes the default selection, and (when
          // a marker exists) announces it.
          state.loadSuccess(data);
          step();
          expect(liveEl.textContent).toBe(expectedText);

          // Apply each action and re-check. The invariant must hold after
          // every step, including ones that the state turns into no-ops.
          for (const action of actions) {
            const beforeText = liveEl.textContent;
            const beforeTriple = lastAnnouncedTriple;

            applyAction(action, state, data);
            step();

            // Property: the textContent equals the predicted text after
            // each step.
            expect(liveEl.textContent).toBe(expectedText);

            // Property (the iff): if the predicted triple did not change,
            // the textContent must not have changed either; if it did
            // change to a new triple, the textContent must equal the
            // freshly built announcement (already checked above).
            if (triplesEqual(beforeTriple, lastAnnouncedTriple)) {
              expect(liveEl.textContent).toBe(beforeText);
            }
          }
        }),
        { numRuns: 100 }
      );
    }
  );
});
