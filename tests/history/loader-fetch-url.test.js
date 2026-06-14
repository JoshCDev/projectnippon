// tests/history/loader-fetch-url.test.js
//
// Example test for HistoryDataLoader's fetch URL.
//
// Asserts that the loader delegates to `NIPPON.loadJSON` (and therefore the
// shared cache-busting helper) by inspecting the URL passed to `fetch`. The
// URL must contain the relative path `assets/data/history.json` and the
// `v=<APP_VERSION>` query string, where `APP_VERSION` is the constant defined
// at the top of `assets/js/main.js`.
//
// Validates: Requirements 1.1

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadMainJs, MAIN_JS_SOURCE } from "./setup.js";

/**
 * Extract the APP_VERSION constant from main.js so this test stays in sync
 * with whatever value the loader actually uses, without exposing the
 * constant publicly.
 */
function extractAppVersion(source) {
  const match = source.match(/const\s+APP_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not locate APP_VERSION in main.js");
  }
  return match[1];
}

const APP_VERSION = extractAppVersion(MAIN_JS_SOURCE);

const VALID_HISTORY_PAYLOAD = {
  page: {
    eyebrow: "Eyebrow",
    title: "Title",
    intro: "Intro",
    emptyStateTitle: "Empty",
    emptyStateBody: "Empty body",
    loadErrorMessage: "Load error",
    loadingMessage: "Loading",
    placeholderBadge: "Konten contoh",
    selectionAnnouncementTemplate: "Era {yearRange}, {month} {year}",
    monthNames: [
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
    ]
  },
  yearRanges: [
    { id: "heian", label: "Heian", from: 794, to: 1185, mood: "sacred" }
  ],
  events: []
};

describe("HistoryDataLoader fetch URL", () => {
  let originalFetch;

  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.NIPPON;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("calls fetch once with a URL containing assets/data/history.json and the APP_VERSION cache-buster", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(VALID_HISTORY_PAYLOAD), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    globalThis.fetch = fetchMock;

    loadMainJs(window);

    await window.NIPPON.HistoryDataLoader.load();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestedUrl] = fetchMock.mock.calls[0];
    const urlString = String(requestedUrl);

    expect(urlString).toContain("assets/data/history.json");
    expect(urlString).toContain(`v=${APP_VERSION}`);
  });
});
