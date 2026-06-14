// tests/history/content-panel-states.test.js
//
// Example tests for task 8.4 of the history-timeline-bar spec.
//
// Validates:
//   - Requirement 4.5: Content_Panel renders a loading placeholder while the
//     History_Data_File has not finished loading on first paint.
//   - Requirement 1.8: Content_Panel renders the `.error-state` block using
//     `page.loadErrorMessage` when the file's `page` block is available, and
//     falls back to the documented in-code constant
//     `"Konten sejarah belum dapat dimuat. Pastikan situs dijalankan lewat
//     server lokal."` when the file itself is unreadable.
//
// These are example (not property-based) tests intentionally: the behavior
// under test is a small, fixed state-transition surface (loading-with-no-data,
// error-with-data, error-without-data) that example tests express clearly.
// The full content-render fidelity is covered by the property tests in
// `content-panel-render.property.test.js` (task 8.2).

import { describe, it, expect, beforeEach } from "vitest";
import { loadMainJs } from "./setup.js";

// -- Fixture builders ---------------------------------------------------------

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

function makePage() {
  return {
    eyebrow: "Eyebrow",
    title: "Title",
    intro: "Intro",
    emptyStateTitle: "Empty title",
    emptyStateBody: "Empty body",
    loadErrorMessage: "Load error from data file",
    loadingMessage: "Memuat sejarah",
    placeholderBadge: "Konten contoh",
    selectionAnnouncementTemplate: "Era {yearRange}, {month} {year}",
    monthNames: MONTH_NAMES.slice()
  };
}

function makePayload(extra = {}) {
  return {
    page: makePage(),
    yearRanges: [
      { id: "first", label: "First", from: 1, to: 100, mood: "casual" }
    ],
    events: [
      {
        id: "f1",
        yearRangeId: "first",
        year: 50,
        month: 3,
        title: "First Event",
        body: "Body",
        mood: "positive"
      }
    ],
    ...extra
  };
}

/**
 * Build the `data-history-content` scaffold ContentPanel.mount expects and
 * return the root element. Mirrors the markup defined in the design doc.
 */
function buildContentScaffold() {
  document.body.innerHTML = `
    <section data-history-content>
      <span data-history-eyebrow></span>
      <h1 data-history-title></h1>
      <p data-history-intro></p>
      <div data-history-events></div>
      <p data-history-live aria-live="polite"></p>
    </section>
  `;
  return document.querySelector("[data-history-content]");
}

// -- Tests --------------------------------------------------------------------

describe("ContentPanel loading state (Requirement 4.5)", () => {
  let createHistoryState;
  let ContentPanel;

  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
    createHistoryState = window.NIPPON.history.createHistoryState;
    ContentPanel = window.NIPPON.history.ContentPanel;
  });

  it("renders a single .history-loading placeholder before the load resolves", () => {
    const root = buildContentScaffold();
    const store = createHistoryState();
    ContentPanel.mount(root, store);

    // Pre-condition: status is 'idle' and the events container is empty.
    const eventsEl = root.querySelector("[data-history-events]");
    expect(eventsEl.children.length).toBe(0);

    // Transition: loadStart sets status='loading' and notifies subscribers,
    // which is exactly the state the ContentPanel renders the loading
    // placeholder for.
    store.loadStart();

    // The events container holds exactly one child: the loading placeholder.
    expect(eventsEl.children.length).toBe(1);
    const loading = eventsEl.firstElementChild;
    expect(loading.tagName).toBe("DIV");
    expect(loading.className).toBe("history-loading");

    // At loadStart() time the data is still null, so the implementation has
    // no `page.loadingMessage` to read and falls back to an empty string.
    // (The non-empty branch is exercised indirectly by the integration smoke
    // test once the load resolves.)
    expect(loading.textContent).toBe("");
  });
});

describe("ContentPanel error state (Requirement 1.8)", () => {
  let createHistoryState;
  let ContentPanel;
  let HISTORY_LOAD_ERROR_FALLBACK;
  let validate;

  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
    createHistoryState = window.NIPPON.history.createHistoryState;
    ContentPanel = window.NIPPON.history.ContentPanel;
    HISTORY_LOAD_ERROR_FALLBACK =
      window.NIPPON.history.HISTORY_LOAD_ERROR_FALLBACK;
    validate = window.NIPPON.history.loader.validate;
  });

  it("uses page.loadErrorMessage when the data file's page block is available", () => {
    const root = buildContentScaffold();
    const data = validate(makePayload());
    const store = createHistoryState();
    ContentPanel.mount(root, store);

    // Populate `state.data` first so the error path can read
    // `data.page.loadErrorMessage`. createHistoryState.loadFailure only flips
    // status and error - it preserves `data`, which is the documented case
    // where at least the page block was readable.
    store.loadSuccess(data);
    store.loadFailure("backend exploded");

    const eventsEl = root.querySelector("[data-history-events]");
    expect(eventsEl.children.length).toBe(1);
    const errorBlock = eventsEl.firstElementChild;
    expect(errorBlock.tagName).toBe("DIV");
    expect(errorBlock.className).toBe("error-state");
    expect(errorBlock.textContent).toBe(data.page.loadErrorMessage);
    // Sanity-check: the rendered text isn't accidentally the in-code fallback.
    expect(errorBlock.textContent).not.toBe(HISTORY_LOAD_ERROR_FALLBACK);
  });

  it("falls back to the documented constant when the data file itself is unreadable", () => {
    const root = buildContentScaffold();
    const store = createHistoryState();
    ContentPanel.mount(root, store);

    // No loadSuccess call -> `state.data` stays `null`. This models the
    // failure mode where the JSON file could not be fetched or parsed at
    // all, so `data.page.loadErrorMessage` is unavailable.
    store.loadStart();
    store.loadFailure("fetch failed");

    const eventsEl = root.querySelector("[data-history-events]");
    expect(eventsEl.children.length).toBe(1);
    const errorBlock = eventsEl.firstElementChild;
    expect(errorBlock.tagName).toBe("DIV");
    expect(errorBlock.className).toBe("error-state");
    // The fallback exposed at NIPPON.history.HISTORY_LOAD_ERROR_FALLBACK is
    // the documented constant declared at the top of the history module.
    expect(HISTORY_LOAD_ERROR_FALLBACK).toBe(
      "Konten sejarah belum dapat dimuat. Pastikan situs dijalankan lewat server lokal."
    );
    expect(errorBlock.textContent).toBe(HISTORY_LOAD_ERROR_FALLBACK);
  });
});
