// tests/history/history-state.test.js
//
// Unit tests for `createHistoryState` exposed at
// `window.NIPPON.history.createHistoryState`. Covers the state-machine
// transitions specified by task 6.2 of the history-timeline-bar spec:
// initial selection (default-id resolution and fallback), redundant
// transitions as no-ops, the zero-events branch of setYearRange,
// auto-selection of the first marker on setYearRange, mood recomputation
// after every transition, loadFailure status, listener call counts, and the
// unsubscribe handle.
//
// Validates: Requirements 2.5, 3.7, 3.8, 3.9

import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadMainJs } from "./setup.js";

// -- Fixture builders ---------------------------------------------------------
//
// A small dataset with three Year_Ranges that exercises every branch the
// HistoryState cares about:
//   - "first"  : two events on two distinct markers (auto-select picks the
//                earlier year via the canonical sort).
//   - "second" : one event on one marker (used as the explicit
//                defaultYearRangeId in most tests).
//   - "third"  : zero events (used to exercise the zero-marker fallback).

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
    loadErrorMessage: "Load error",
    loadingMessage: "Loading",
    placeholderBadge: "Konten contoh",
    selectionAnnouncementTemplate: "Era {yearRange}, {month} {year}",
    monthNames: MONTH_NAMES.slice()
  };
}

function makeYearRanges() {
  return [
    { id: "first", label: "First", from: 1, to: 100, mood: "casual" },
    { id: "second", label: "Second", from: 200, to: 300, mood: "sacred" },
    { id: "third", label: "Third", from: 400, to: 500, mood: "dark" }
  ];
}

function makeEvents() {
  return [
    // Order is intentionally non-canonical so we can also verify the loader
    // and downstream helpers do not rely on input ordering.
    {
      id: "f2",
      yearRangeId: "first",
      year: 60,
      month: 5,
      title: "First Event 2",
      body: "Body",
      mood: "negative"
    },
    {
      id: "f1",
      yearRangeId: "first",
      year: 50,
      month: 3,
      title: "First Event 1",
      body: "Body",
      mood: "positive"
    },
    {
      id: "s1",
      yearRangeId: "second",
      year: 250,
      month: 6,
      title: "Second Event 1",
      body: "Body",
      mood: "positive"
    }
    // "third" has zero events on purpose.
  ];
}

function makePayload(extra = {}) {
  return {
    page: makePage(),
    yearRanges: makeYearRanges(),
    events: makeEvents(),
    ...extra
  };
}

// -- Tests --------------------------------------------------------------------

describe("createHistoryState transitions", () => {
  let createHistoryState;
  let validate;

  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
    createHistoryState = window.NIPPON.history.createHistoryState;
    validate = window.NIPPON.history.loader.validate;
  });

  it("initial selection equals defaultYearRangeId when it matches an existing yearRange", () => {
    const data = validate(makePayload({ defaultYearRangeId: "second" }));
    const store = createHistoryState();

    store.loadSuccess(data);

    const state = store.getState();
    expect(state.status).toBe("ready");
    expect(state.selection.yearRangeId).toBe("second");
    expect(state.selection.year).toBe(250);
    expect(state.selection.month).toBe(6);
    // mood is taken from the first event matching the auto-selected marker
    expect(state.mood).toBe("positive");
  });

  it("initial selection falls back to yearRanges[0].id when defaultYearRangeId is unset", () => {
    // The loader's `validate` resolves a missing defaultYearRangeId to
    // `yearRanges[0].id`, so feeding the validated payload into loadSuccess
    // exercises the documented fallback path end-to-end.
    const data = validate(makePayload());
    expect(data.defaultYearRangeId).toBe("first");

    const store = createHistoryState();
    store.loadSuccess(data);

    const state = store.getState();
    expect(state.selection.yearRangeId).toBe("first");
    // Canonical sort puts the year-50 marker before the year-60 marker.
    expect(state.selection.year).toBe(50);
    expect(state.selection.month).toBe(3);
    expect(state.mood).toBe("positive");
  });

  it("redundant setYearRange(currentId) does not invoke listeners", () => {
    const data = validate(makePayload({ defaultYearRangeId: "second" }));
    const store = createHistoryState();
    store.loadSuccess(data);

    const listener = vi.fn();
    store.subscribe(listener);

    store.setYearRange("second");

    expect(listener).not.toHaveBeenCalled();
  });

  it("redundant setTimeMarker(currentYear, currentMonth) does not invoke listeners", () => {
    const data = validate(makePayload({ defaultYearRangeId: "second" }));
    const store = createHistoryState();
    store.loadSuccess(data);
    const { year, month } = store.getState().selection;

    const listener = vi.fn();
    store.subscribe(listener);

    store.setTimeMarker(year, month);

    expect(listener).not.toHaveBeenCalled();
  });

  it("setYearRange to a range with zero events clears (year, month) and uses yearRange.mood", () => {
    const data = validate(makePayload({ defaultYearRangeId: "second" }));
    const store = createHistoryState();
    store.loadSuccess(data);

    const listener = vi.fn();
    store.subscribe(listener);

    store.setYearRange("third");

    const state = store.getState();
    expect(state.selection.yearRangeId).toBe("third");
    expect(state.selection.year).toBeNull();
    expect(state.selection.month).toBeNull();
    // No events -> resolveMood falls back to the active Year_Range's mood.
    expect(state.mood).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("setYearRange to a range with markers auto-selects the first marker (canonical sort) and recomputes mood", () => {
    const data = validate(makePayload({ defaultYearRangeId: "second" }));
    const store = createHistoryState();
    store.loadSuccess(data);

    store.setYearRange("first");

    const state = store.getState();
    expect(state.selection.yearRangeId).toBe("first");
    // First marker by ascending year (50 before 60).
    expect(state.selection.year).toBe(50);
    expect(state.selection.month).toBe(3);
    // mood from eventsAt("first", 50, 3)[0].mood -> "f1" -> "positive"
    expect(state.mood).toBe("positive");
  });

  it("setTimeMarker(year, month) updates the selection and recomputes mood", () => {
    const data = validate(makePayload({ defaultYearRangeId: "first" }));
    const store = createHistoryState();
    store.loadSuccess(data);

    // Sanity: starts on the auto-selected first marker.
    expect(store.getState().selection.year).toBe(50);
    expect(store.getState().mood).toBe("positive");

    store.setTimeMarker(60, 5);

    const state = store.getState();
    expect(state.selection.yearRangeId).toBe("first");
    expect(state.selection.year).toBe(60);
    expect(state.selection.month).toBe(5);
    // mood from eventsAt("first", 60, 5)[0].mood -> "f2" -> "negative"
    expect(state.mood).toBe("negative");
  });

  it("after loadFailure, status is 'error' and subscribed listeners are notified", () => {
    const store = createHistoryState();

    const listener = vi.fn();
    store.subscribe(listener);

    store.loadFailure("network down");

    const state = store.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("network down");
    expect(listener).toHaveBeenCalledTimes(1);
    // Listener was invoked with the current state object.
    expect(listener.mock.calls[0][0]).toBe(state);
  });

  it("listeners are called exactly once per non-no-op transition", () => {
    const data = validate(makePayload({ defaultYearRangeId: "second" }));
    const store = createHistoryState();

    const listener = vi.fn();
    store.subscribe(listener);

    // loadStart -> notify (1)
    store.loadStart();
    expect(listener).toHaveBeenCalledTimes(1);

    // loadSuccess -> notify (2)
    store.loadSuccess(data);
    expect(listener).toHaveBeenCalledTimes(2);

    // setYearRange to a different range -> notify (3)
    store.setYearRange("first");
    expect(listener).toHaveBeenCalledTimes(3);

    // Redundant setYearRange -> no-op
    store.setYearRange("first");
    expect(listener).toHaveBeenCalledTimes(3);

    // setTimeMarker to a different marker -> notify (4)
    store.setTimeMarker(60, 5);
    expect(listener).toHaveBeenCalledTimes(4);

    // Redundant setTimeMarker -> no-op
    store.setTimeMarker(60, 5);
    expect(listener).toHaveBeenCalledTimes(4);

    // loadFailure -> notify (5)
    store.loadFailure("oops");
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it("unsubscribe removes the listener", () => {
    const data = validate(makePayload({ defaultYearRangeId: "second" }));
    const store = createHistoryState();

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.loadSuccess(data);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    store.setYearRange("first");
    store.setTimeMarker(60, 5);
    store.loadFailure("later");

    // Listener was not invoked again after unsubscribe.
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
