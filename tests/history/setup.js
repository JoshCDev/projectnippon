// tests/history/setup.js
//
// Shared test setup for the history-timeline-bar feature. Vitest is configured
// to run this file via `setupFiles` in `vitest.config.js`, but tests can also
// import the helpers below directly when they need fine-grained control over
// when `main.js` is executed against the jsdom document.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const MAIN_JS_PATH = path.join(REPO_ROOT, "assets", "js", "main.js");
export const MAIN_JS_SOURCE = fs.readFileSync(MAIN_JS_PATH, "utf8");

/**
 * Execute `assets/js/main.js` so that its IIFE registers globals (such as
 * `window.NIPPON`) and event listeners against the active jsdom document.
 *
 * Vitest's `jsdom` environment does not run injected `<script>` tags, so the
 * helper evaluates the file in the current realm using indirect `eval`. The
 * jsdom environment already exposes `window`, `document`, `fetch`, and the
 * other browser globals on `globalThis`, which is exactly what the IIFE
 * expects when running in a real browser.
 *
 * The function is safe to call multiple times against the same window. Tests
 * that need a clean slate should reset `document.body.innerHTML` and any
 * globals (e.g. `window.NIPPON`) before re-loading.
 *
 * @param {Window} [targetWindow] - The jsdom window to load `main.js` into.
 *                                  Defaults to the global `window`.
 * @returns {Window} The same window, for chaining.
 */
export function loadMainJs(targetWindow = globalThis.window) {
  if (!targetWindow || !targetWindow.document) {
    throw new Error("loadMainJs: targetWindow must be a jsdom window with a document");
  }
  // Indirect eval runs in the global scope. Under Vitest's jsdom environment
  // the global scope already wires up `window`, `document`, and `fetch`, so
  // the IIFE in main.js sees the same shape it does in a browser.
  // eslint-disable-next-line no-eval
  (0, eval)(MAIN_JS_SOURCE);
  return targetWindow;
}

// Expose the helper as a global so tests that don't import it explicitly can
// still pick it up after vitest runs this file via `setupFiles`.
if (typeof globalThis !== "undefined") {
  globalThis.loadMainJs = loadMainJs;
}
