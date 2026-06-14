// tests/history/loader-schema.property.test.js
//
// Property test for the History_Data_Loader's schema validation.
//
// Property 1 (from design.md "Correctness Properties"):
//   For any candidate HistoryData-shaped object, the HistoryDataLoader either
//   returns a normalized result whose yearRanges and events all satisfy the
//   documented schema, OR it throws when a structurally required field is
//   missing or wrong-typed.
//
// **Validates: Requirements 1.3, 1.4**
//
// The test exercises `NIPPON.HistoryDataLoader.validate` (the synchronous
// schema check) so no fetch is needed. The loader is loaded into the jsdom
// document via the shared `tests/history/setup.js` helper, matching the
// pattern used by `tests/history/setup.test.js`.

import { describe, it, expect, beforeAll, vi } from "vitest";
import fc from "fast-check";
import { loadMainJs } from "./setup.js";

// ---------------------------------------------------------------------------
// Constants matching the loader's documented schema
// ---------------------------------------------------------------------------

const VALID_MOODS = ["dark", "positive", "negative", "sacred", "casual"];

const REQUIRED_PAGE_STRING_KEYS = [
  "eyebrow",
  "title",
  "intro",
  "emptyStateTitle",
  "emptyStateBody",
  "loadErrorMessage",
  "loadingMessage",
  "placeholderBadge",
  "selectionAnnouncementTemplate"
];

const REQUIRED_EVENT_STRING_FIELDS = ["id", "yearRangeId", "title", "body"];

// ---------------------------------------------------------------------------
// Loader bootstrap
// ---------------------------------------------------------------------------

function getValidate() {
  if (!window.NIPPON || !window.NIPPON.HistoryDataLoader) {
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
  }
  return window.NIPPON.HistoryDataLoader.validate;
}

// Per-event soft drops (invalid month / unknown yearRangeId) emit
// `console.warn`. Those soft drops are out of scope for Property 1
// (Property 2 covers them), so quiet the channel here to keep test output
// readable when fast-check explores those branches in valid generators.
beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Generators for VALID HistoryData payloads
// ---------------------------------------------------------------------------

const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => s.length > 0);

const moodArb = fc.constantFrom(...VALID_MOODS);
const yearArb = fc.integer({ min: -3000, max: 3000 });

const monthNamesArb = fc.array(nonEmptyStringArb, {
  minLength: 12,
  maxLength: 12
});

const pageArb = fc.record({
  eyebrow: nonEmptyStringArb,
  title: nonEmptyStringArb,
  intro: nonEmptyStringArb,
  emptyStateTitle: nonEmptyStringArb,
  emptyStateBody: nonEmptyStringArb,
  loadErrorMessage: nonEmptyStringArb,
  loadingMessage: nonEmptyStringArb,
  placeholderBadge: nonEmptyStringArb,
  selectionAnnouncementTemplate: nonEmptyStringArb,
  monthNames: monthNamesArb
});

// Year ranges are generated from a (label, mood, two ints) tuple and we sort
// the two ints so that `to >= from` is guaranteed by construction.
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
      // optional fields: nil => key omitted, value => key present
      monthOpt: fc.option(fc.integer({ min: 1, max: 12 }), { nil: undefined }),
      imageOpt: fc.option(fc.string({ maxLength: 24 }), { nil: undefined }),
      altOpt: fc.option(fc.string({ maxLength: 24 }), { nil: undefined }),
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
    yearRangesBase: fc.array(yearRangeBaseArb, { minLength: 1, maxLength: 4 })
  })
  .chain(({ page, yearRangesBase }) => {
    // Suffix ids so they are unique without restricting the underlying
    // string generator.
    const yearRanges = yearRangesBase.map((yr, i) => ({
      ...yr,
      id: `${yr.id}__yr${i}`
    }));
    const ids = yearRanges.map((yr) => yr.id);
    return fc
      .array(eventArbForRanges(ids), { minLength: 0, maxLength: 6 })
      .map((events) => ({
        page,
        yearRanges,
        events: events.map((e, i) => ({ ...e, id: `${e.id}__ev${i}` }))
      }));
  });

// ---------------------------------------------------------------------------
// Schema check on the loader's normalized output
// ---------------------------------------------------------------------------

function isInt(v) {
  return typeof v === "number" && Number.isInteger(v);
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function assertNormalizedSatisfiesSchema(data) {
  expect(data).toBeTypeOf("object");
  expect(data).not.toBeNull();

  // page object: 9 required string keys + monthNames[12]
  expect(data.page).toBeTypeOf("object");
  expect(data.page).not.toBeNull();
  for (const key of REQUIRED_PAGE_STRING_KEYS) {
    expect(isNonEmptyString(data.page[key])).toBe(true);
  }
  expect(Array.isArray(data.page.monthNames)).toBe(true);
  expect(data.page.monthNames).toHaveLength(12);
  for (const name of data.page.monthNames) {
    expect(isNonEmptyString(name)).toBe(true);
  }

  // yearRanges: at least one, every entry well-formed and to >= from
  expect(Array.isArray(data.yearRanges)).toBe(true);
  expect(data.yearRanges.length).toBeGreaterThanOrEqual(1);
  const yearRangeIdSet = new Set();
  for (const yr of data.yearRanges) {
    expect(isNonEmptyString(yr.id)).toBe(true);
    expect(isNonEmptyString(yr.label)).toBe(true);
    expect(isInt(yr.from)).toBe(true);
    expect(isInt(yr.to)).toBe(true);
    expect(yr.to).toBeGreaterThanOrEqual(yr.from);
    expect(VALID_MOODS).toContain(yr.mood);
    yearRangeIdSet.add(yr.id);
  }

  // events: every kept event references an existing yearRange and respects
  // the documented optional-field types.
  expect(Array.isArray(data.events)).toBe(true);
  for (const event of data.events) {
    expect(isNonEmptyString(event.id)).toBe(true);
    expect(isNonEmptyString(event.yearRangeId)).toBe(true);
    expect(yearRangeIdSet.has(event.yearRangeId)).toBe(true);
    expect(isInt(event.year)).toBe(true);
    expect(isNonEmptyString(event.title)).toBe(true);
    expect(isNonEmptyString(event.body)).toBe(true);
    expect(VALID_MOODS).toContain(event.mood);

    if ("month" in event) {
      expect(isInt(event.month)).toBe(true);
      expect(event.month).toBeGreaterThanOrEqual(1);
      expect(event.month).toBeLessThanOrEqual(12);
    }
    if ("image" in event) expect(typeof event.image).toBe("string");
    if ("alt" in event) expect(typeof event.alt).toBe("string");
    if ("placeholder" in event) expect(typeof event.placeholder).toBe("boolean");
  }

  // The loader always sets a defaultYearRangeId pointing at an existing range.
  expect(typeof data.defaultYearRangeId).toBe("string");
  expect(yearRangeIdSet.has(data.defaultYearRangeId)).toBe(true);
}

// ---------------------------------------------------------------------------
// Generators for MALFORMED HistoryData payloads
//
// Each mutation breaks exactly one structurally required field of an
// otherwise-valid base payload. The validator must throw on every variant.
// ---------------------------------------------------------------------------

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function pickMutationArbFor(base) {
  const choices = [];

  // ---- top level ----
  choices.push(fc.constant((d) => { delete d.page; }));
  choices.push(fc.constant((d) => { d.page = "not an object"; }));
  choices.push(fc.constant((d) => { d.page = null; }));
  choices.push(fc.constant((d) => { d.page = []; }));

  // ---- page string keys: drop / wrong type / empty string ----
  for (const key of REQUIRED_PAGE_STRING_KEYS) {
    choices.push(fc.constant((d) => { delete d.page[key]; }));
    choices.push(fc.constant((d) => { d.page[key] = 42; }));
    choices.push(fc.constant((d) => { d.page[key] = ""; }));
  }

  // ---- monthNames ----
  choices.push(fc.constant((d) => { delete d.page.monthNames; }));
  choices.push(fc.constant((d) => { d.page.monthNames = "Januari"; }));
  choices.push(fc.constant((d) => { d.page.monthNames = []; }));
  choices.push(fc.constant((d) => { d.page.monthNames = ["Januari"]; }));
  choices.push(
    fc.integer({ min: 0, max: 11 }).map((i) => (d) => {
      d.page.monthNames[i] = 7;
    })
  );
  choices.push(
    fc.integer({ min: 0, max: 11 }).map((i) => (d) => {
      d.page.monthNames[i] = "";
    })
  );

  // ---- yearRanges container ----
  choices.push(fc.constant((d) => { delete d.yearRanges; }));
  choices.push(fc.constant((d) => { d.yearRanges = "nope"; }));
  choices.push(fc.constant((d) => { d.yearRanges = []; }));

  // ---- yearRanges entry-level ----
  if (base.yearRanges.length > 0) {
    const rangeIdxArb = fc.integer({
      min: 0,
      max: base.yearRanges.length - 1
    });
    for (const field of ["id", "label", "mood"]) {
      choices.push(rangeIdxArb.map((i) => (d) => { delete d.yearRanges[i][field]; }));
      choices.push(rangeIdxArb.map((i) => (d) => { d.yearRanges[i][field] = 7; }));
    }
    choices.push(rangeIdxArb.map((i) => (d) => { d.yearRanges[i].id = ""; }));
    choices.push(rangeIdxArb.map((i) => (d) => { d.yearRanges[i].label = ""; }));
    choices.push(rangeIdxArb.map((i) => (d) => { d.yearRanges[i].mood = "happy"; }));
    choices.push(rangeIdxArb.map((i) => (d) => { delete d.yearRanges[i].from; }));
    choices.push(rangeIdxArb.map((i) => (d) => { d.yearRanges[i].from = "no"; }));
    choices.push(rangeIdxArb.map((i) => (d) => { d.yearRanges[i].from = 1.5; }));
    choices.push(rangeIdxArb.map((i) => (d) => { delete d.yearRanges[i].to; }));
    choices.push(rangeIdxArb.map((i) => (d) => { d.yearRanges[i].to = "no"; }));
    choices.push(
      rangeIdxArb.map((i) => (d) => {
        d.yearRanges[i].to = d.yearRanges[i].from - 1;
      })
    );
  }

  // ---- events container ----
  choices.push(fc.constant((d) => { delete d.events; }));
  choices.push(fc.constant((d) => { d.events = "nope"; }));
  choices.push(fc.constant((d) => { d.events = {}; }));

  // ---- events entry-level ----
  if (base.events.length > 0) {
    const eventIdxArb = fc.integer({ min: 0, max: base.events.length - 1 });
    for (const field of REQUIRED_EVENT_STRING_FIELDS) {
      choices.push(eventIdxArb.map((i) => (d) => { delete d.events[i][field]; }));
      choices.push(eventIdxArb.map((i) => (d) => { d.events[i][field] = 9; }));
      choices.push(eventIdxArb.map((i) => (d) => { d.events[i][field] = ""; }));
    }
    choices.push(eventIdxArb.map((i) => (d) => { delete d.events[i].year; }));
    choices.push(eventIdxArb.map((i) => (d) => { d.events[i].year = "1900"; }));
    choices.push(eventIdxArb.map((i) => (d) => { d.events[i].year = 1.5; }));
    choices.push(eventIdxArb.map((i) => (d) => { delete d.events[i].mood; }));
    choices.push(eventIdxArb.map((i) => (d) => { d.events[i].mood = "weird"; }));
    // Optional fields with the wrong type are also structural rejections.
    choices.push(eventIdxArb.map((i) => (d) => { d.events[i].image = 5; }));
    choices.push(eventIdxArb.map((i) => (d) => { d.events[i].alt = 5; }));
    choices.push(eventIdxArb.map((i) => (d) => { d.events[i].placeholder = "yes"; }));
  }

  return fc.oneof(...choices);
}

const malformedHistoryDataArb = validHistoryDataArb.chain((base) =>
  pickMutationArbFor(base).map((mutate) => {
    const clone = deepClone(base);
    mutate(clone);
    return clone;
  })
);

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("HistoryDataLoader.validate (Property 1, validates Requirements 1.3, 1.4)", () => {
  it("accepts well-formed payloads and returns a result satisfying the documented schema", () => {
    const validate = getValidate();
    fc.assert(
      fc.property(validHistoryDataArb, (payload) => {
        const result = validate(payload);
        assertNormalizedSatisfiesSchema(result);
      }),
      { numRuns: 100 }
    );
  });

  it("rejects payloads where a structurally required field is missing or wrong-typed", () => {
    const validate = getValidate();
    fc.assert(
      fc.property(malformedHistoryDataArb, (payload) => {
        expect(() => validate(payload)).toThrow();
      }),
      { numRuns: 200 }
    );
  });
});
