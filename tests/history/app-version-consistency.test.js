// tests/history/app-version-consistency.test.js
//
// Example test for APP_VERSION cache-buster consistency between
// `assets/js/main.js` and `history.html`.
//
// Requirement 7.4 says the History_Page must bump the cache-busting query
// string on its `style.css` and `main.js` references to a new `APP_VERSION`
// value when this feature ships, consistent with the existing pattern.
// The design document further requires that the same value is set in the
// `APP_VERSION` constant inside `main.js`. This test guards against drift
// between the two locations.
//
// Validates: Requirements 7.4

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MAIN_JS_PATH = path.join(REPO_ROOT, "assets", "js", "main.js");
const HISTORY_HTML_PATH = path.join(REPO_ROOT, "history.html");

/**
 * Extract the `APP_VERSION` constant declared at the top of `main.js`.
 * Throws if the constant cannot be located so a structural change to the
 * source file surfaces as an actionable test failure rather than a silent
 * skip.
 */
function extractAppVersionFromMainJs(source) {
  const match = source.match(/const\s+APP_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not locate APP_VERSION constant in main.js");
  }
  return match[1];
}

/**
 * Extract the `?v=...` cache-buster value attached to a given asset
 * reference (e.g. `assets/css/style.css` or `assets/js/main.js`) inside
 * `history.html`. Returns the captured version string.
 */
function extractCacheBusterFromHtml(html, assetPath) {
  // Escape forward slashes and dots so the asset path can be used inside the
  // regex literal directly.
  const escaped = assetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\?v=([^"'\\s]+)`);
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`Could not locate "?v=..." cache-buster for ${assetPath} in history.html`);
  }
  return match[1];
}

describe("APP_VERSION consistency between history.html and main.js", () => {
  const mainJsSource = fs.readFileSync(MAIN_JS_PATH, "utf8");
  const historyHtmlSource = fs.readFileSync(HISTORY_HTML_PATH, "utf8");
  const appVersion = extractAppVersionFromMainJs(mainJsSource);

  it("uses the APP_VERSION constant for the style.css cache-buster", () => {
    const styleVersion = extractCacheBusterFromHtml(historyHtmlSource, "assets/css/style.css");
    expect(styleVersion).toBe(appVersion);
  });

  it("uses the APP_VERSION constant for the main.js cache-buster", () => {
    const scriptVersion = extractCacheBusterFromHtml(historyHtmlSource, "assets/js/main.js");
    expect(scriptVersion).toBe(appVersion);
  });
});
