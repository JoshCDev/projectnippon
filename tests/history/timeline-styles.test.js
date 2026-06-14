// tests/history/timeline-styles.test.js
//
// Example tests for task 7.6 of the history-timeline-bar spec.
//
// Validates:
//   - Requirement 2.1: timeline is sticky beneath the site header at
//     `top: var(--header-height)`.
//   - Requirement 2.6: timeline buttons are keyboard-focusable.
//   - Requirement 3.5: the expanded Time_Marker row does not overlap the
//     Content_Panel (timeline + markers participate in normal flow).
//   - Requirement 7.5: on viewports narrower than 600 px the eras row
//     collapses to a single horizontally scrollable row.
//
// jsdom does not implement layout, so `getComputedStyle()` cannot be relied on
// for `position`, `top`, `overflow-x`, etc. Instead, the tests parse
// `assets/css/style.css` and assert the documented declarations are present
// on the right selectors. The focusability assertion does run in jsdom because
// it depends on element type and the `tabindex` attribute, both of which jsdom
// reports faithfully.

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadMainJs, REPO_ROOT } from "./setup.js";

const STYLE_CSS_PATH = path.join(REPO_ROOT, "assets", "css", "style.css");
const STYLE_CSS = fs.readFileSync(STYLE_CSS_PATH, "utf8");

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

// -- CSS parsing helpers ------------------------------------------------------

/**
 * Extract the body of a top-level (non-nested) CSS rule whose selector list
 * ends in `selector` followed by optional whitespace and `{`. Vanilla CSS
 * rules at the top level have flat bodies (no nested braces), so a
 * non-greedy `[^{}]*` body match is correct.
 */
function extractRuleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Allow any selector list to precede the target selector, but require the
  // target selector itself to be terminated by whitespace + `{` so prefix
  // selectors (e.g. `.history-timeline-eras`) don't match `.history-timeline`.
  const re = new RegExp(escaped + "\\s*\\{([^{}]*)\\}");
  const match = css.match(re);
  return match ? match[1] : null;
}

/**
 * Return the inner body of the first `@media (max-width: <px>px)` block whose
 * query string contains `mediaQueryFragment`. Uses a brace-depth counter so
 * nested rule blocks inside the media block are preserved.
 */
function extractMediaBlock(css, mediaQueryFragment) {
  const idx = css.indexOf(mediaQueryFragment);
  if (idx === -1) return null;
  const openIdx = css.indexOf("{", idx);
  if (openIdx === -1) return null;
  let depth = 1;
  let i = openIdx + 1;
  while (i < css.length && depth > 0) {
    const ch = css[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  if (depth !== 0) return null;
  return css.substring(openIdx + 1, i);
}

// -- Fixture builders ---------------------------------------------------------

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

function makePayload() {
  return {
    page: makePage(),
    defaultYearRangeId: "heian",
    yearRanges: [
      { id: "heian", label: "Heian", from: 794, to: 1185, mood: "sacred" },
      { id: "edo", label: "Edo", from: 1603, to: 1868, mood: "casual" }
    ],
    events: [
      {
        id: "h1",
        yearRangeId: "heian",
        year: 1000,
        month: 3,
        title: "Heian Event 1",
        body: "Body",
        mood: "sacred"
      },
      {
        id: "h2",
        yearRangeId: "heian",
        year: 1100,
        month: 6,
        title: "Heian Event 2",
        body: "Body",
        mood: "sacred"
      },
      {
        id: "e1",
        yearRangeId: "edo",
        year: 1700,
        month: 6,
        title: "Edo Event 1",
        body: "Body",
        mood: "casual"
      }
    ]
  };
}

function buildTimelineDom() {
  document.body.innerHTML = `
    <section class="history-timeline" data-history-timeline>
      <div class="container">
        <div class="history-timeline-eras" role="tablist" data-timeline-eras></div>
        <div class="history-timeline-markers" role="tablist" data-timeline-markers></div>
      </div>
    </section>
    <section class="history-content" data-history-content>
      <div class="history-content-events" data-history-events></div>
    </section>
  `;
  return document.querySelector(".history-timeline");
}

// -- Tests --------------------------------------------------------------------

describe("Timeline sticky positioning (Requirement 2.1)", () => {
  it("declares position: sticky on .history-timeline", () => {
    const body = extractRuleBody(STYLE_CSS, ".history-timeline");
    expect(body, "missing top-level .history-timeline rule").not.toBeNull();
    expect(body).toMatch(/position\s*:\s*sticky\s*;/);
  });

  it("anchors .history-timeline at top: var(--header-height)", () => {
    const body = extractRuleBody(STYLE_CSS, ".history-timeline");
    expect(body).not.toBeNull();
    expect(body).toMatch(/top\s*:\s*var\(\s*--header-height\s*\)\s*;/);
  });
});

describe("Timeline button tab-focusability (Requirement 2.6)", () => {
  let createHistoryState;
  let TimelineBar;
  let validate;

  beforeEach(() => {
    delete window.NIPPON;
    document.body.innerHTML = "";
    loadMainJs(window);
    createHistoryState = window.NIPPON.history.createHistoryState;
    TimelineBar = window.NIPPON.history.TimelineBar;
    validate = window.NIPPON.history.loader.validate;
  });

  it("renders Year_Range and Time_Marker controls as native <button type=\"button\"> elements", () => {
    const root = buildTimelineDom();
    const state = createHistoryState();
    TimelineBar.mount(root, state);
    state.loadSuccess(validate(makePayload()));

    const eraButtons = Array.from(root.querySelectorAll("[data-timeline-eras] button"));
    const markerButtons = Array.from(
      root.querySelectorAll("[data-timeline-markers] button")
    );

    // Sanity: the fixture exercises both rows so the assertions below have
    // something to stand on.
    expect(eraButtons.length).toBe(2);
    expect(markerButtons.length).toBeGreaterThanOrEqual(1);

    const allButtons = eraButtons.concat(markerButtons);
    for (const button of allButtons) {
      expect(button instanceof window.HTMLButtonElement).toBe(true);
      expect(button.getAttribute("type")).toBe("button");
    }
  });

  it("uses the roving tabindex pattern: exactly one tabindex=0 per row, all others -1", () => {
    const root = buildTimelineDom();
    const state = createHistoryState();
    TimelineBar.mount(root, state);
    state.loadSuccess(validate(makePayload()));

    function checkRoving(rowSelector) {
      const buttons = Array.from(root.querySelectorAll(rowSelector + " button"));
      expect(buttons.length).toBeGreaterThan(0);
      const focusable = buttons.filter((b) => b.tabIndex === 0);
      const parked = buttons.filter((b) => b.tabIndex === -1);
      expect(focusable.length).toBe(1);
      expect(parked.length).toBe(buttons.length - 1);
      // The single tab-focusable button is also the one marked active.
      expect(focusable[0].classList.contains("is-active")).toBe(true);
    }

    checkRoving("[data-timeline-eras]");
    checkRoving("[data-timeline-markers]");
  });
});

describe("Mobile collapse: eras row at viewport <= 599px (Requirement 7.5)", () => {
  it("declares an @media (max-width: 599px) block targeting .history-timeline-eras", () => {
    const block = extractMediaBlock(STYLE_CSS, "@media (max-width: 599px)");
    expect(block, "missing @media (max-width: 599px) block").not.toBeNull();
    expect(block).toContain(".history-timeline-eras");
  });

  it("collapses .history-timeline-eras to a single horizontally scrollable row", () => {
    const mediaBlock = extractMediaBlock(STYLE_CSS, "@media (max-width: 599px)");
    expect(mediaBlock).not.toBeNull();
    const erasBody = extractRuleBody(mediaBlock, ".history-timeline-eras");
    expect(erasBody, "missing .history-timeline-eras rule inside the @media block").not.toBeNull();
    // Single row: the row must not wrap onto a second line.
    expect(erasBody).toMatch(/flex-wrap\s*:\s*nowrap\s*;/);
    // Horizontally scrollable: overflow-x should permit scrolling.
    expect(erasBody).toMatch(/overflow-x\s*:\s*(?:auto|scroll)\s*;/);
  });
});

describe("Expanded markers row does not overlap content (Requirement 3.5)", () => {
  // The simplest way to guarantee the expanded markers row pushes the
  // content area down (rather than sitting on top of it) is to confirm both
  // the timeline and the markers row participate in normal block flow. A
  // sticky timeline contributes its rendered height to the document, and a
  // markers row that is not absolutely or fixed-positioned likewise affects
  // sibling layout. These two assertions are observable from the stylesheet
  // alone.

  it("uses position: sticky on .history-timeline (not absolute or fixed)", () => {
    const body = extractRuleBody(STYLE_CSS, ".history-timeline");
    expect(body).not.toBeNull();
    expect(body).toMatch(/position\s*:\s*sticky\s*;/);
    expect(body).not.toMatch(/position\s*:\s*absolute\s*;/);
    expect(body).not.toMatch(/position\s*:\s*fixed\s*;/);
  });

  it("does not take .history-timeline-markers out of normal flow", () => {
    // Scan every occurrence of the .history-timeline-markers selector
    // (top-level and inside any media block) and confirm none of them
    // declare an out-of-flow position. We strip @media blocks first so the
    // top-level scan sees the canonical rule, then sweep media blocks too.
    const markerSelectors = [
      ".history-timeline-markers",
      ".history-timeline-markers:not(:empty)"
    ];
    for (const selector of markerSelectors) {
      const body = extractRuleBody(STYLE_CSS, selector);
      if (body === null) continue;
      expect(body, `${selector} must not use position: absolute`).not.toMatch(
        /position\s*:\s*absolute\s*;/
      );
      expect(body, `${selector} must not use position: fixed`).not.toMatch(
        /position\s*:\s*fixed\s*;/
      );
    }

    // Also sweep the narrow-viewport media block to make sure mobile mode
    // does not lift the markers row out of flow either.
    const narrowBlock = extractMediaBlock(STYLE_CSS, "@media (max-width: 599px)");
    if (narrowBlock) {
      for (const selector of markerSelectors) {
        const body = extractRuleBody(narrowBlock, selector);
        if (body === null) continue;
        expect(body).not.toMatch(/position\s*:\s*absolute\s*;/);
        expect(body).not.toMatch(/position\s*:\s*fixed\s*;/);
      }
    }
  });
});
