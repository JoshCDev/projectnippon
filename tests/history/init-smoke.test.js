// tests/history/init-smoke.test.js
//
// Integration smoke test for task 10.2 of the history-timeline-bar spec.
//
// Loads the real `history.html` body markup and the real
// `assets/data/history.json` payload (via a `fetch` stub) into the jsdom
// document, runs `NIPPON.history.initHistoryPage()`, and walks through the
// happy-path interaction the design promises:
//
//   1. After init, the Default_Year_Range button is active, the Time_Marker
//      row is populated for that range, and the Content_Panel renders an
//      article for the auto-selected marker.
//   2. Clicking another era updates the active era button, repopulates the
//      Time_Marker row, re-renders the matching articles, and repaints the
//      Background_Animator with the new Mood.
//   3. Clicking a Time_Marker re-renders the Content_Panel for the new
//      `(year, month)` and the `aria-live="polite"` region announces the
//      substituted template from `page.selectionAnnouncementTemplate`.
//
// Validates: Requirements 2.5, 3.1, 4.1, 4.2, 8.3
//
// Reduced motion (`prefers-reduced-motion: reduce`) is mocked BEFORE main.js
// loads so the BackgroundAnimator's `paint()` writes the new mood directly
// to the `--from` layer synchronously. This avoids having to fire fake
// `transitionend` events to settle the wipe and keeps the assertions
// deterministic.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadMainJs, REPO_ROOT } from "./setup.js";

const HISTORY_HTML_PATH = path.join(REPO_ROOT, "history.html");
const HISTORY_JSON_PATH = path.join(REPO_ROOT, "assets", "data", "history.json");

/**
 * Pull the contents between `<body ...>` and `</body>` out of `history.html`
 * so the test can write them straight into `document.body.innerHTML`. The
 * `<body>` attributes themselves (e.g. `data-page="history"`) are set
 * separately by the caller because `innerHTML` only assigns descendants.
 */
function extractBodyInnerHtml(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!match) {
    throw new Error("Could not extract <body> from history.html");
  }
  return match[1];
}

describe("History page integration smoke test", () => {
  let originalFetch;
  let originalMatchMedia;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    delete window.NIPPON;
    document.body.innerHTML = "";
    delete document.body.dataset.page;
    originalFetch = globalThis.fetch;
    originalMatchMedia = window.matchMedia;
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mock matchMedia BEFORE main.js loads so the BackgroundAnimator's
    // `prefersReducedMotion()` helper sees a stable `true` for the
    // documented `prefers-reduced-motion: reduce` query, which short-
    // circuits the wipe and writes the new mood synchronously to the
    // --from layer. Other media queries return `false` so unrelated
    // matchMedia callers (e.g. layout-related queries the page may add
    // later) are unaffected.
    window.matchMedia = function (query) {
      const isReducedMotionQuery =
        typeof query === "string" && query.indexOf("prefers-reduced-motion") !== -1;
      return {
        matches: isReducedMotionQuery,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        }
      };
    };

    // Stub fetch to return the real `history.json` payload from disk.
    // Using `.mockImplementation` (not `mockResolvedValue`) so each call
    // gets a fresh `Response` body, in case any caller reads it more than
    // once across the test lifetime.
    const jsonText = fs.readFileSync(HISTORY_JSON_PATH, "utf8");
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(jsonText, {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    // Mount the real history.html body markup on the jsdom document and
    // mark the page so `initHistoryPage()` proceeds past its
    // `data-page === "history"` guard.
    const html = fs.readFileSync(HISTORY_HTML_PATH, "utf8");
    document.body.innerHTML = extractBodyInnerHtml(html);
    document.body.dataset.page = "history";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.matchMedia = originalMatchMedia;
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("loads the real history.json, renders the default era, and updates on era + marker clicks", async () => {
    // The DOMContentLoaded handler inside main.js may already have fired
    // by the time the IIFE adds its listener (vitest's jsdom environment
    // has typically completed DOM construction before the test runs), so
    // we explicitly call the orchestrator and `await` it to avoid any
    // race between fetch resolution and the assertions below.
    loadMainJs(window);
    await window.NIPPON.history.initHistoryPage();

    const erasRow = document.querySelector("[data-timeline-eras]");
    const markersRow = document.querySelector("[data-timeline-markers]");
    const eventsContainer = document.querySelector("[data-history-events]");
    const liveRegion = document.querySelector("[data-history-live]");
    const fromLayer = document.querySelector(".history-bg-layer--from");

    expect(erasRow, "history.html must expose [data-timeline-eras]").not.toBeNull();
    expect(markersRow, "history.html must expose [data-timeline-markers]").not.toBeNull();
    expect(eventsContainer, "history.html must expose [data-history-events]").not.toBeNull();
    expect(liveRegion, "history.html must expose [data-history-live]").not.toBeNull();
    expect(fromLayer, "history.html must expose .history-bg-layer--from").not.toBeNull();

    function getActiveEra() {
      return Array.from(erasRow.querySelectorAll("button")).find((btn) =>
        btn.classList.contains("is-active")
      );
    }

    function getMarkerButtons() {
      return Array.from(markersRow.querySelectorAll("button"));
    }

    function getEventArticles() {
      return Array.from(eventsContainer.querySelectorAll("article.history-event"));
    }

    // -- 1. Default era is active and the page is fully populated ------------

    // The shipped history.json sets `defaultYearRangeId: "jomon"` and lists
    // four year ranges, so we expect four era buttons with jomon active.
    const eraButtons = Array.from(erasRow.querySelectorAll("button"));
    expect(eraButtons.length).toBe(4);

    const defaultActiveEra = getActiveEra();
    expect(defaultActiveEra).toBeDefined();
    expect(defaultActiveEra.dataset.yearRangeId).toBe("jomon");
    expect(defaultActiveEra.getAttribute("aria-current")).toBe("true");

    // The jomon range has a single year-only event (year -5000, no month),
    // which produces exactly one Time_Marker labeled with the year alone.
    let markerButtons = getMarkerButtons();
    expect(markerButtons.length).toBe(1);
    expect(markerButtons[0].dataset.year).toBe("-5000");
    // No `data-month` attribute is set when the marker is year-only.
    expect(markerButtons[0].dataset.month).toBeUndefined();
    expect(markerButtons[0].classList.contains("is-active")).toBe(true);

    // The Content_Panel renders the matching article (jomon-komunitas-awal,
    // mood: casual). The static head copy from `data.page` is also wired up.
    let articles = getEventArticles();
    expect(articles.length).toBe(1);
    expect(articles[0].dataset.mood).toBe("casual");

    expect(document.querySelector("[data-history-eyebrow]").textContent.length)
      .toBeGreaterThan(0);
    expect(document.querySelector("[data-history-title]").textContent.length)
      .toBeGreaterThan(0);

    // First paint under reduced motion writes mood directly to --from.
    expect(fromLayer.dataset.mood).toBe("casual");

    // -- 2. Click another era and assert everything updates ------------------

    const heianBtn = eraButtons.find(
      (btn) => btn.dataset.yearRangeId === "heian"
    );
    expect(heianBtn).toBeDefined();
    heianBtn.click();

    // The active era moves to heian and exactly one era button is active.
    const heianActive = getActiveEra();
    expect(heianActive).toBeDefined();
    expect(heianActive.dataset.yearRangeId).toBe("heian");
    expect(
      Array.from(erasRow.querySelectorAll("button")).filter((b) =>
        b.classList.contains("is-active")
      ).length
    ).toBe(1);

    // The markers row is repopulated with heian's three sorted Time_Markers:
    // (794, 10), (1010, 3), (1185, 4) - ascending by year, then month.
    markerButtons = getMarkerButtons();
    expect(markerButtons.length).toBe(3);
    expect(markerButtons.map((b) => b.dataset.year)).toEqual(["794", "1010", "1185"]);
    expect(markerButtons.map((b) => b.dataset.month)).toEqual(["10", "3", "4"]);

    // The first marker auto-activates per requirement 3.8 / Property 6.
    expect(markerButtons[0].classList.contains("is-active")).toBe(true);
    expect(
      markerButtons.filter((b) => b.classList.contains("is-active")).length
    ).toBe(1);

    // The Content_Panel re-renders for the new (heian, 794, 10) selection.
    // That marker carries one event (heian-pemindahan-ibukota, mood: sacred).
    articles = getEventArticles();
    expect(articles.length).toBe(1);
    expect(articles[0].dataset.mood).toBe("sacred");

    // BackgroundAnimator picks up the new mood from the resolved selection.
    expect(fromLayer.dataset.mood).toBe("sacred");

    // -- 3. Click a Time_Marker and assert content + live region update -----

    const danNoUraMarker = markerButtons.find(
      (b) => b.dataset.year === "1185" && b.dataset.month === "4"
    );
    expect(danNoUraMarker).toBeDefined();
    danNoUraMarker.click();

    // After re-render, exactly one marker button is active and it points at
    // the freshly clicked (1185, 4) Time_Marker.
    const refreshedMarkers = getMarkerButtons();
    const activeMarker = refreshedMarkers.find((b) =>
      b.classList.contains("is-active")
    );
    expect(activeMarker).toBeDefined();
    expect(activeMarker.dataset.year).toBe("1185");
    expect(activeMarker.dataset.month).toBe("4");
    expect(
      refreshedMarkers.filter((b) => b.classList.contains("is-active")).length
    ).toBe(1);

    // The Content_Panel re-renders the matching event (heian-dan-no-ura,
    // mood: dark) and the BackgroundAnimator follows the topmost event mood.
    articles = getEventArticles();
    expect(articles.length).toBe(1);
    expect(articles[0].dataset.mood).toBe("dark");
    expect(fromLayer.dataset.mood).toBe("dark");

    // The aria-live region announces the new selection using the
    // substituted template from `page.selectionAnnouncementTemplate`:
    //   "Era {yearRange}, {month} {year}"  ->  "Era Heian, April 1185"
    // (April is `monthNames[3]` in the shipped Indonesian month list.)
    expect(liveRegion.textContent).toBe("Era Heian, April 1185");
  });
});
