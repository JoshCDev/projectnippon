// tests/history/content-panel.property.test.js
//
// Property-based test for the ContentPanel render against the active
// selection.
//
// Property 7 (from design.md "Correctness Properties"):
//   For any sequence of TimelineBar interactions over any valid
//   HistoryData, after each step the Content_Panel's rendered DOM matches
//   `eventsAt(activeYearRangeId, activeYear, activeMonth, data)` exactly:
//     - Each rendered `<article class="history-event" data-mood="<mood>">`
//       corresponds to one event in ascending-`id` order.
//     - The article's heading textContent equals `event.title`; the body
//       paragraph textContent contains `event.body`.
//     - An `<img>` with `alt = event.alt ?? ""` is present iff
//       `event.image` is set; the `src` equals `event.image`.
//     - A `<span class="history-event-badge">` containing
//       `page.placeholderBadge` is present iff `event.placeholder === true`.
//     - When zero events match, the events container holds a
//       `<div class="history-empty">` with an `<h2>` whose text equals
//       `page.emptyStateTitle` and a `<p>` whose text equals
//       `page.emptyStateBody`, and zero `<article class="history-event">`
//       nodes.
//
// **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 6.5**
//
// The harness builds a fresh DOM scaffold per fast-check iteration that
// contains both the Timeline_Bar markup and the Content_Panel markup,
// validates the generated payload through the loader's `validate` (so the
// per-event soft drops and `defaultYearRangeId` resolution match the
// production flow), mounts both modules against a shared
// `createHistoryState`, and then dispatches `state.loadSuccess(data)`. A
// per-iteration sequence of `setYearRange` / `setTimeMarker` actions is
// applied directly through the state API (not through DOM events), and the
// invariant is asserted after every step including the initial render.

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
// Module bootstrap
// ---------------------------------------------------------------------------

let createHistoryState;
let TimelineBar;
let ContentPanel;
let validate;
let eventsAt;
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
    typeof window.NIPPON.history.eventsAt !== "function" ||
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
  eventsAt = window.NIPPON.history.eventsAt;
  markersFor = window.NIPPON.history.markersFor;
}

beforeAll(() => {
  ensureHistoryModule();
  // The loader's per-event soft-drops, the `defaultYearRangeId` fallback,
  // and the unrelated `console.warn` paths emit warnings on the branches
  // fast-check explores. Quiet that channel so the test output stays
  // readable - the warnings themselves are validated by other property
  // tests (Property 1 and Property 2).
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

beforeEach(() => {
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// Generators for VALID HistoryData payloads
//
// Mirrors `tests/history/timeline-render.property.test.js` so the same
// shape that exercised Property 5 also exercises Property 7. Image and
// placeholder fields are added so the per-article assertions cover their
// presence/absence branches.
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
      monthOpt: fc.option(fc.integer({ min: 1, max: 12 }), { nil: undefined }),
      // Image and alt are independent options so all four combinations
      // (image+alt, image only, alt only, neither) are explored.
      imageOpt: fc.option(
        fc.string({ minLength: 1, maxLength: 12 }).map((s) => "assets/images/" + s + ".png"),
        { nil: undefined }
      ),
      altOpt: fc.option(fc.string({ minLength: 0, maxLength: 16 }), { nil: undefined }),
      placeholderOpt: fc.option(fc.boolean(), { nil: undefined })
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
      if (raw.imageOpt !== undefined) out.image = raw.imageOpt;
      if (raw.altOpt !== undefined) out.alt = raw.altOpt;
      if (raw.placeholderOpt !== undefined) out.placeholder = raw.placeholderOpt;
      return out;
    });
}

const validHistoryDataArb = fc
  .record({
    page: pageArb,
    yearRangesBase: fc.array(yearRangeBaseArb, { minLength: 1, maxLength: 3 })
  })
  .chain(({ page, yearRangesBase }) => {
    const yearRanges = yearRangesBase.map((yr, i) => ({
      ...yr,
      id: `${yr.id}__yr${i}`
    }));
    const ids = yearRanges.map((yr) => yr.id);
    return fc
      .record({
        events: fc.array(eventArbForRanges(ids), { minLength: 0, maxLength: 8 })
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
// taken modulo the relevant count, so generated indices are always valid.
// Selection happens through the state API rather than DOM clicks because
// Property 7 is about the rendered DOM matching `eventsAt(...)`, not about
// the click-handler wiring (which Property 6 already exercises).
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

const actionSequenceArb = fc.array(actionArb, { minLength: 0, maxLength: 8 });

// ---------------------------------------------------------------------------
// DOM scaffold helpers
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

  return { root, timelineSection, contentSection, eventsContainer };
}

// ---------------------------------------------------------------------------
// Action application
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
// Invariant assertion
// ---------------------------------------------------------------------------

function assertContentMatchesSelection(eventsContainer, state, data) {
  const s = state.getState();
  const expected = eventsAt(
    s.selection.yearRangeId,
    s.selection.year,
    s.selection.month,
    data
  );

  const articles = Array.from(
    eventsContainer.querySelectorAll("article.history-event")
  );

  if (expected.length === 0) {
    // Empty-state branch: zero history-event articles, exactly one
    // .history-empty block with an h2 (emptyStateTitle) and a p
    // (emptyStateBody).
    expect(articles).toHaveLength(0);
    const empties = eventsContainer.querySelectorAll("div.history-empty");
    expect(empties).toHaveLength(1);
    const empty = empties[0];
    const h2 = empty.querySelector("h2");
    const p = empty.querySelector("p");
    expect(h2).not.toBeNull();
    expect(p).not.toBeNull();
    expect(h2.textContent).toBe(data.page.emptyStateTitle);
    expect(p.textContent).toBe(data.page.emptyStateBody);
    return;
  }

  // Non-empty branch.
  expect(articles).toHaveLength(expected.length);
  // No empty-state block is rendered when there is at least one match.
  expect(eventsContainer.querySelectorAll("div.history-empty")).toHaveLength(0);

  for (let i = 0; i < expected.length; i++) {
    const ev = expected[i];
    const article = articles[i];

    // The article carries the event's mood as a data attribute (per the
    // design: `<article class="history-event" data-mood="<mood>">`).
    expect(article.getAttribute("data-mood")).toBe(ev.mood);

    // Heading: textContent equals event.title.
    const heading = article.querySelector("h2.history-event-title");
    expect(heading).not.toBeNull();
    expect(heading.textContent).toBe(ev.title);

    // Body: textContent contains event.body. The design allows the body
    // paragraph to contain additional formatting in the future, so a
    // contains-check (rather than equals) keeps the property minimal.
    const body = article.querySelector("p.history-event-body");
    expect(body).not.toBeNull();
    expect(body.textContent).toContain(ev.body);

    // Image: present iff event.image is a non-empty string.
    const img = article.querySelector("img");
    if (typeof ev.image === "string" && ev.image.length > 0) {
      expect(img).not.toBeNull();
      expect(img.getAttribute("src")).toBe(ev.image);
      const expectedAlt = typeof ev.alt === "string" ? ev.alt : "";
      // jsdom always returns a string for img.alt, so a direct compare is
      // safe even when the underlying attribute was set to "".
      expect(img.getAttribute("alt")).toBe(expectedAlt);
    } else {
      expect(img).toBeNull();
    }

    // Placeholder badge: present iff event.placeholder === true.
    const badge = article.querySelector("span.history-event-badge");
    if (ev.placeholder === true) {
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe(data.page.placeholderBadge);
    } else {
      expect(badge).toBeNull();
    }
  }
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("ContentPanel render against eventsAt (Property 7, validates Requirements 4.1, 4.2, 4.3, 4.4, 6.5)", () => {
  it(
    "renders one article per matching event in ascending-id order with " +
      "title/body/image/badge fidelity, and the empty-state block when no " +
      "events match",
    () => {
      ensureHistoryModule();

      fc.assert(
        fc.property(validHistoryDataArb, actionSequenceArb, (rawPayload, actions) => {
          // Validate so the data fed to `state.loadSuccess` is the same
          // shape the production orchestrator produces.
          const data = validate(rawPayload);

          const { timelineSection, contentSection, eventsContainer } =
            buildScaffold();
          const state = createHistoryState();
          TimelineBar.mount(timelineSection, state);
          ContentPanel.mount(contentSection, state);
          state.loadSuccess(data);

          // Initial render after loadSuccess.
          assertContentMatchesSelection(eventsContainer, state, data);

          // Step through the generated action sequence and assert after
          // each step.
          for (const action of actions) {
            applyAction(action, state, data);
            assertContentMatchesSelection(eventsContainer, state, data);
          }
        }),
        { numRuns: 100 }
      );
    }
  );
});
