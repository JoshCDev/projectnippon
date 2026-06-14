// tests/history/site-shell.test.js
//
// Example tests confirming the existing site shell on the History page is
// preserved and that the existing `initNavigation()` logic in main.js still
// activates the History nav link when `data-page="history"` is set on the
// body. Two layers of assertions:
//
//   1. Static markup checks: `history.html` still ships with `.site-header`,
//      `.site-footer`, and `data-page="history"` on the body element.
//   2. Behavior check: the existing `initNavigation()` (wired to the shared
//      `DOMContentLoaded` handler in main.js) adds `is-active` and
//      `aria-current="page"` to the nav link whose `data-page` attribute
//      matches `document.body.dataset.page`.
//
// Validates: Requirements 7.1, 7.2, 7.3

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadMainJs, REPO_ROOT } from "./setup.js";

const HISTORY_HTML_PATH = path.join(REPO_ROOT, "history.html");
const HISTORY_HTML_SOURCE = fs.readFileSync(HISTORY_HTML_PATH, "utf8");

describe("history.html preserves the existing site shell", () => {
  it("still declares the <header class=\"site-header\"> markup", () => {
    expect(HISTORY_HTML_SOURCE).toContain('<header class="site-header"');
  });

  it("still declares the <footer class=\"site-footer\"> markup", () => {
    // The footer in this project carries additional utility classes
    // alongside `site-footer`, so accept any class list that begins with it.
    expect(HISTORY_HTML_SOURCE).toMatch(/<footer\s+class="site-footer\b/);
  });

  it("declares data-page=\"history\" on the <body> element", () => {
    expect(HISTORY_HTML_SOURCE).toMatch(/<body\b[^>]*\bdata-page="history"/);
  });
});

describe("data-page=\"history\" triggers the existing initNavigation highlight", () => {
  beforeEach(() => {
    // Reset the jsdom document and any side-effects from earlier tests so the
    // DOMContentLoaded handler in main.js sees a clean slate.
    document.body.innerHTML = "";
    document.body.removeAttribute("data-page");
    delete window.NIPPON;
  });

  it("adds is-active and aria-current=\"page\" to the History nav link", () => {
    // Mirror the markup history.html ships with: a body tagged
    // `data-page="history"` plus the shared `[data-nav]` row that
    // `initNavigation()` scans.
    document.body.dataset.page = "history";
    document.body.innerHTML = `
      <header class="site-header">
        <nav class="nav-links" aria-label="Navigasi utama" data-nav>
          <a class="nav-link" href="history.html" data-page="history">History</a>
          <a class="nav-link" href="art-music.html" data-page="art-music">Seni &amp; Musik</a>
          <a class="nav-link" href="quiz.html" data-page="quiz">Kuis</a>
        </nav>
        <a class="nav-orb" href="quiz.html" aria-label="Kuis"><span aria-hidden="true">x</span></a>
      </header>
    `;

    loadMainJs(window);

    // The IIFE in main.js attaches `initNavigation` to DOMContentLoaded;
    // jsdom does not re-fire that event after the script is evaluated, so
    // dispatch it manually to exercise the existing wiring.
    document.dispatchEvent(new window.Event("DOMContentLoaded"));

    const historyLink = document.querySelector('.nav-link[data-page="history"]');
    expect(historyLink).not.toBeNull();
    expect(historyLink.classList.contains("is-active")).toBe(true);
    expect(historyLink.getAttribute("aria-current")).toBe("page");

    // Non-matching links must not pick up the active state, otherwise the
    // highlight would be ambiguous.
    const otherLink = document.querySelector('.nav-link[data-page="art-music"]');
    expect(otherLink).not.toBeNull();
    expect(otherLink.classList.contains("is-active")).toBe(false);
    expect(otherLink.getAttribute("aria-current")).toBeNull();

    const quizLink = document.querySelector('.nav-link[data-page="quiz"]');
    expect(quizLink).not.toBeNull();
    expect(quizLink.classList.contains("is-active")).toBe(false);
    expect(quizLink.getAttribute("aria-current")).toBeNull();
  });
});
