// tests/history/data-schema.test.js
//
// Schema sanity example test for the shipped `assets/data/history.json`.
// Validates the placeholder dataset against the requirements listed in
// task 1.3 of the history-timeline-bar spec.
//
// Validates: Requirements 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { REPO_ROOT } from "./setup.js";

const HISTORY_JSON_PATH = path.join(REPO_ROOT, "assets", "data", "history.json");

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

const ALL_MOODS = ["dark", "positive", "negative", "sacred", "casual"];

function readHistoryJson() {
  const raw = fs.readFileSync(HISTORY_JSON_PATH, "utf8");
  return JSON.parse(raw);
}

describe("assets/data/history.json schema sanity", () => {
  const data = readHistoryJson();

  it("is parseable JSON with a top-level object", () => {
    expect(data).toBeTypeOf("object");
    expect(data).not.toBeNull();
    expect(Array.isArray(data)).toBe(false);
  });

  describe("page object", () => {
    it("exists as an object", () => {
      expect(data.page).toBeTypeOf("object");
      expect(data.page).not.toBeNull();
    });

    it.each(REQUIRED_PAGE_STRING_KEYS)(
      "has page.%s as a non-empty string",
      (key) => {
        const value = data.page[key];
        expect(typeof value).toBe("string");
        expect(value.trim().length).toBeGreaterThan(0);
      }
    );

    it("has page.monthNames as an array of 12 non-empty strings", () => {
      expect(Array.isArray(data.page.monthNames)).toBe(true);
      expect(data.page.monthNames).toHaveLength(12);
      for (const name of data.page.monthNames) {
        expect(typeof name).toBe("string");
        expect(name.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe("yearRanges", () => {
    it("is an array with at least 3 entries", () => {
      expect(Array.isArray(data.yearRanges)).toBe(true);
      expect(data.yearRanges.length).toBeGreaterThanOrEqual(3);
    });

    it("has well-formed entries (id/label/mood non-empty strings, from/to integers, to >= from)", () => {
      for (const yr of data.yearRanges) {
        expect(yr).toBeTypeOf("object");
        expect(yr).not.toBeNull();

        for (const key of ["id", "label", "mood"]) {
          expect(typeof yr[key]).toBe(
            "string",
            `yearRange ${JSON.stringify(yr)} key "${key}" must be a string`
          );
          expect(yr[key].trim().length).toBeGreaterThan(0);
        }

        expect(Number.isInteger(yr.from)).toBe(true);
        expect(Number.isInteger(yr.to)).toBe(true);
        expect(yr.to).toBeGreaterThanOrEqual(yr.from);
      }
    });

    it("has unique year-range ids", () => {
      const ids = data.yearRanges.map((yr) => yr.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("events", () => {
    it("is an array with at least 5 entries", () => {
      expect(Array.isArray(data.events)).toBe(true);
      expect(data.events.length).toBeGreaterThanOrEqual(5);
    });

    it("references only existing yearRange ids", () => {
      const validIds = new Set(data.yearRanges.map((yr) => yr.id));
      for (const event of data.events) {
        expect(typeof event.yearRangeId).toBe("string");
        expect(validIds.has(event.yearRangeId)).toBe(
          true,
          `event ${event.id} references unknown yearRangeId "${event.yearRangeId}"`
        );
      }
    });

    it("contains at least one placeholder event (placeholder: true)", () => {
      const placeholderEvents = data.events.filter(
        (event) => event.placeholder === true
      );
      expect(placeholderEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("mood coverage", () => {
    it("exercises all five Mood values across yearRanges and events", () => {
      const seen = new Set();
      for (const yr of data.yearRanges) {
        if (typeof yr.mood === "string") seen.add(yr.mood);
      }
      for (const event of data.events) {
        if (typeof event.mood === "string") seen.add(event.mood);
      }
      for (const mood of ALL_MOODS) {
        expect(seen.has(mood)).toBe(
          true,
          `expected at least one yearRange or event with mood "${mood}"`
        );
      }
    });
  });
});
