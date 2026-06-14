// tests/history/timeline-render.property.test.js
//
// Property-based test for `TimelineBar` render fidelity against the loaded
// HistoryData.
//
// Property 5 (from design.md "Correctness Properties"):
//   For any valid HistoryData, after TimelineBar.mount completes its initial
//   render driven by `state.loadSuccess(data)`:
//     1. The Year_Range buttons under `[data-timeline-eras]` in DOM document
//        order map one-to-one to `data.yearRanges` in array order.
//     2. Each button's `textContent` contains the YearRange's `label` and the
//        `from` and `to` numbers.
//     3. The active Year_Range button equals `data.defaultYearRangeId` when
//        it matches an existing range, otherwise `yearRanges[0].id` (which
//        the loader's `resolveDefaultYearRangeId` resolves up-front in
//        `validate()`).
//
// **Validates: Requirements 2.2, 2.3, 2.5**
//
// The test mounts a fresh DOM scaffold matching `history.html` for every
// fast-check run, executes `validate()` to mirror what the orchestrator does
// before handing data to the state, mounts `TimelineBar` against the
// `.history-timeline` section, and dispatches `state.loadSuccess(data)` so
// the bar renders. The assertions then read the rendered DOM directly.

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

// ---------------------------------------------------------------------------
// Loader / module bootstrap
// ---------------------------------------------------------------------------

let createHistoryState;
let TimelineBar;
let validate;

function ensureHistoryModule() {
  if (
    !window.NIPPON ||
    !window.NIPPON.history ||
    typeof window.NIPPON.history.createHistoryState !== "function" ||
    !window.NIPPON.history.TimelineBar ||
    !window.NIPPON.history.loader ||
    typeof window.NIPPON.history.loader.validate !== "function"
  ) {
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
  }
  createHistoryState = window.NIPPON.history.createHistoryState;
  TimelineBar = window.NIPPON.history.TimelineBar;
  validate = window.NIPPON.history.loader.validate;
}

beforeAll(() => {
  ensureHistoryModule();
  // The loader's per-event soft-drops and the `defaultYearRangeId` fallback
  // both emit `console.warn` lines on the branches fast-check will explore.
  // Quiet that channel so the test output stays readable - the warnings
  // themselves are validated by other property tests (Property 2 and the
  // loader-schema test).
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

beforeEach(() => {
  // Each fast-check property runs many iterations; we mount a fresh DOM
  // inside the loop. The outer `beforeEach` only clears the body so the
  // first iteration starts from a clean slate.
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// Generators for VALID HistoryData payloads
//
// The shape follows the same conventions as
// `tests/history/loader-schema.property.test.js` (Property 1): IDs are
// suffixed with their index so they are unique without restricting the
// underlying string generator, and `to >= from` is guaranteed by sorting two
// independent integers.
// ---------------------------------------------------------------------------

const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 16 })
  .filter((s) => s.length > 0);

const moodArb = fc.constantFrom(...VALID_MOODS);
const yearArb = fc.integer({ min: -2000, max: 2999 });

const pageArb = fc.record({
  eyebrow: nonEmptyStringArb,
  title: nonEmptyStringArb,
  intro: nonEmptyStringArb,
  emptyStateTitle: nonEmptyStringArb,
  emptyStateBody: nonEmptyStringArb,
  loadErrorMessage: nonEmptyStringArb,
  loadingMessage: nonEmptyStringArb,
  placeholderBadge: nonEmptyStringArb,
  selectionAnnouncementTemplate: fc.constant("Era {yearRange}, {month} {year}"),
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

// `defaultYearRangeId` is generated three ways: missing entirely, a real id
// from the generated yearRanges, or a synthetic "miss" id that does not match
// any range. The loader's `validate` resolves all three to the canonical
// active id (real id when present, otherwise `yearRanges[0].id`).
function defaultYearRangeIdArb(yearRangeIds) {
  return fc.oneof(
    fc.constant(undefined), // key omitted
    fc.constantFrom(...yearRangeIds), // real match
    nonEmptyStringArb.map((s) => `__missing__${s}`) // guaranteed miss
  );
}

const validHistoryDataArb = fc
  .record({
    page: pageArb,
    yearRangesBase: fc.array(yearRangeBaseArb, { minLength: 1, maxLength: 4 })
  })
  .chain(({ page, yearRangesBase }) => {
    const yearRanges = yearRangesBase.map((yr, i) => ({
      ...yr,
      id: `${yr.id}__yr${i}`
    }));
    const ids = yearRanges.map((yr) => yr.id);
    return fc
      .record({
        events: fc.array(eventArbForRanges(ids), { minLength: 0, maxLength: 5 }),
        defaultId: defaultYearRangeIdArb(ids)
      })
      .map(({ events, defaultId }) => {
        const payload = {
          page,
          yearRanges,
          events: events.map((e, i) => ({ ...e, id: `${e.id}__ev${i}` }))
        };
        if (defaultId !== undefined) {
          payload.defaultYearRangeId = defaultId;
        }
        return payload;
      });
  });

// ---------------------------------------------------------------------------
// DOM scaffold helpers
// ---------------------------------------------------------------------------

/**
 * Build a fresh DOM scaffold matching the structure used by `history.html`
 * and return references to the timeline section root that `TimelineBar.mount`
 * expects.
 */
function buildScaffold() {
  document.body.innerHTML = "";
  const root = document.createElement("main");
  root.setAttribute("data-history-root", "");
  root.className = "history-page";

  const timelineSection = document.createElement("section");
  timelineSection.className = "history-timeline";
  timelineSection.setAttribute("data-history-timeline", "");

  const container = document.createElement("div");
  container.className = "container";

  const eras = document.createElement("div");
  eras.className = "history-timeline-eras";
  eras.setAttribute("role", "tablist");
  eras.setAttribute("data-timeline-eras", "");

  const markers = document.createElement("div");
  markers.className = "history-timeline-markers";
  markers.setAttribute("role", "tablist");
  markers.setAttribute("data-timeline-markers", "");

  container.appendChild(eras);
  container.appendChild(markers);
  timelineSection.appendChild(container);
  root.appendChild(timelineSection);
  document.body.appendChild(root);

  return { root, timelineSection, eras, markers };
}

// ---------------------------------------------------------------------------
// Property assertions
// ---------------------------------------------------------------------------

/**
 * Run all three assertions (one-to-one mapping, label content, active state)
 * against the rendered DOM for a given normalized HistoryData payload.
 */
function assertRenderFidelity(eras, data) {
  const buttons = Array.from(eras.querySelectorAll('button[role="tab"]'));

  // 1) One-to-one mapping in DOM document order.
  expect(buttons).toHaveLength(data.yearRanges.length);
  buttons.forEach((btn, i) => {
    const range = data.yearRanges[i];
    expect(btn.dataset.yearRangeId).toBe(range.id);
  });

  // 2) Each button's textContent contains the label, from, and to values.
  buttons.forEach((btn, i) => {
    const range = data.yearRanges[i];
    const text = btn.textContent || "";
    expect(text).toContain(range.label);
    expect(text).toContain(String(range.from));
    expect(text).toContain(String(range.to));
  });

  // 3) Exactly one button is active, and its id equals
  //    `data.defaultYearRangeId` (which the loader has already resolved to a
  //    real range id - either the originally requested one when it matched,
  //    or `yearRanges[0].id` as the documented fallback).
  const activeButtons = buttons.filter((b) => b.classList.contains("is-active"));
  expect(activeButtons).toHaveLength(1);
  expect(activeButtons[0].dataset.yearRangeId).toBe(data.defaultYearRangeId);
  expect(activeButtons[0].getAttribute("aria-selected")).toBe("true");
  expect(activeButtons[0].getAttribute("aria-current")).toBe("true");

  // The non-active buttons must reflect the inverse aria-state.
  buttons
    .filter((b) => !b.classList.contains("is-active"))
    .forEach((btn) => {
      expect(btn.getAttribute("aria-selected")).toBe("false");
      expect(btn.getAttribute("aria-current")).toBeNull();
    });
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("TimelineBar render fidelity (Property 5, validates Requirements 2.2, 2.3, 2.5)", () => {
  it(
    "renders one button per yearRange in array order, labels carry label/from/to, " +
      "and the active button equals data.defaultYearRangeId",
    () => {
      ensureHistoryModule();

      fc.assert(
        fc.property(validHistoryDataArb, (rawPayload) => {
          // Validate first so the loader-side resolution of
          // `defaultYearRangeId` (and any per-event soft drops) match what
          // the production orchestrator would feed into the state. This is
          // the same flow as `initHistoryPage()`.
          const data = validate(rawPayload);

          const { timelineSection, eras } = buildScaffold();
          const state = createHistoryState();
          TimelineBar.mount(timelineSection, state);
          state.loadSuccess(data);

          assertRenderFidelity(eras, data);
        }),
        { numRuns: 100 }
      );
    }
  );
});
