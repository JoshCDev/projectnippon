// tests/history/setup.test.js
//
// Smoke test that confirms the test harness can load `assets/js/main.js`
// into the jsdom document and that the IIFE inside main.js registers the
// `window.NIPPON` global. This is intentionally minimal - it only verifies
// the harness itself, not any behavior that later tasks will cover.

import { describe, it, expect } from "vitest";
import { loadMainJs, MAIN_JS_SOURCE } from "./setup.js";

describe("test harness", () => {
  it("provides a non-empty main.js source string", () => {
    expect(typeof MAIN_JS_SOURCE).toBe("string");
    expect(MAIN_JS_SOURCE.length).toBeGreaterThan(0);
  });

  it("loads main.js into the jsdom document and exposes window.NIPPON", () => {
    document.body.innerHTML = "";
    expect(window.NIPPON).toBeUndefined();
    loadMainJs(window);
    expect(window.NIPPON).toBeDefined();
    expect(typeof window.NIPPON.qs).toBe("function");
    expect(typeof window.NIPPON.loadJSON).toBe("function");
  });
});
