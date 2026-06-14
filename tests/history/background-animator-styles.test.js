// tests/history/background-animator-styles.test.js
//
// Example tests for task 9.3 of the history-timeline-bar spec.
//
// Validates:
//   - Requirement 5.4: brush-textured mask sourced from
//     `assets/images/brush-mask.svg`, with the `--to` layer animating
//     top-to-bottom (the wipe grows downward from the top of the viewport).
//   - Requirement 5.7: under `prefers-reduced-motion: reduce`, `paint(mood)`
//     applies the new mood synchronously without the brush-wipe transition.
//   - Requirement 7.6: the Background_Animator layer sits behind the
//     Timeline_Bar and Content_Panel via stacking context (z-index/position),
//     and does not interfere with sticky positioning or focus outlines.
//
// jsdom does not implement layout or honor `@media (prefers-reduced-motion)`,
// so style assertions parse `assets/css/style.css` and runtime assertions
// drive `BackgroundAnimator.paint()` after mocking `window.matchMedia`.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadMainJs, REPO_ROOT } from "./setup.js";

const STYLE_CSS_PATH = path.join(REPO_ROOT, "assets", "css", "style.css");
const STYLE_CSS = fs.readFileSync(STYLE_CSS_PATH, "utf8");

// -- CSS parsing helpers ------------------------------------------------------

/**
 * Extract the body of the first top-level (non-nested) CSS rule whose selector
 * list ends in `selector` followed by optional whitespace and `{`. Vanilla
 * CSS rules at the top level have flat bodies (no nested braces), so a
 * non-greedy `[^{}]*` body match is correct.
 */
function extractRuleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(?:^|[\\s,}])" + escaped + "\\s*\\{([^{}]*)\\}", "m");
  const match = css.match(re);
  return match ? match[1] : null;
}

/**
 * Return ALL top-level rule bodies whose selector list mentions `selector`
 * (the comma-separated rule may include other selectors too). This is needed
 * to inspect grouped rules such as `.history-bg-layer--to.is-painting,
 * .history-bg-layer--to[data-state="painting"] { ... }` that share a body.
 */
function extractAllRuleBodiesContaining(css, selectorFragment) {
  const out = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(css)) !== null) {
    const selectorList = m[1];
    if (selectorList.indexOf(selectorFragment) !== -1) {
      out.push({ selectors: selectorList.trim(), body: m[2] });
    }
  }
  return out;
}

/**
 * Parse the numeric `z-index` declared in a rule body, or `null` when no
 * `z-index` declaration is present.
 */
function parseZIndex(body) {
  if (body === null) return null;
  const m = body.match(/z-index\s*:\s*(-?\d+)\s*;/);
  return m ? Number(m[1]) : null;
}

// -- Mocking helpers ----------------------------------------------------------

function mockReducedMotion(matches) {
  // Replace `window.matchMedia` with a stub that reports `matches: matches`
  // for the `prefers-reduced-motion: reduce` query and `false` otherwise.
  const original = window.matchMedia;
  window.matchMedia = function (query) {
    const isReducedMotionQuery =
      typeof query === "string" && query.indexOf("prefers-reduced-motion") !== -1;
    return {
      matches: isReducedMotionQuery ? Boolean(matches) : false,
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
  return function restore() {
    window.matchMedia = original;
  };
}

// -- Tests --------------------------------------------------------------------

describe("Wipe direction: --to layer animates top-to-bottom (Requirement 5.4)", () => {
  it("declares the start state as clip-path: inset(0 0 100% 0) on .history-bg-layer--to", () => {
    const body = extractRuleBody(STYLE_CSS, ".history-bg-layer--to");
    expect(body, "missing top-level .history-bg-layer--to rule").not.toBeNull();
    // The starting clip-path pins the top inset to 0 and sets the bottom
    // inset to 100% so the layer is fully clipped away from the top edge.
    // This is what the wipe grows away from.
    expect(body).toMatch(/clip-path\s*:\s*inset\(\s*0\s+0\s+100%\s+0\s*\)\s*;/);
  });

  it("declares the end state as clip-path: inset(0 0 0% 0) on the painting variant", () => {
    // The painting state can live on either `.is-painting` or
    // `[data-state="painting"]`; both forms are documented in style.css and
    // share a single rule body. We accept either.
    const matches = extractAllRuleBodiesContaining(STYLE_CSS, ".history-bg-layer--to");
    expect(matches.length).toBeGreaterThan(0);

    const paintingRule = matches.find(
      (rule) =>
        rule.selectors.indexOf(".is-painting") !== -1 ||
        rule.selectors.indexOf('data-state="painting"') !== -1
    );
    expect(paintingRule, "missing painting state rule for .history-bg-layer--to").toBeTruthy();
    // The bottom inset shrinks from 100% to 0%; top stays pinned to 0.
    // Together with the start-state assertion above, this proves the layer
    // grows from the top edge down to the bottom edge.
    expect(paintingRule.body).toMatch(/clip-path\s*:\s*inset\(\s*0\s+0\s+0%\s+0\s*\)\s*;/);
  });
});

describe("Brush mask: --to layer is masked by brush-mask.svg (Requirement 5.4)", () => {
  it("sets mask-image to a URL containing assets/images/brush-mask.svg on .history-bg-layer--to", () => {
    const body = extractRuleBody(STYLE_CSS, ".history-bg-layer--to");
    expect(body, "missing top-level .history-bg-layer--to rule").not.toBeNull();

    // Match either `mask-image` or the `-webkit-mask-image` prefix, and
    // accept any quoting style around the URL. The path is relative to the
    // stylesheet (`../images/brush-mask.svg`), but the substring
    // `assets/images/brush-mask.svg` is what the requirement asks for, and
    // the canonical relative form contains `images/brush-mask.svg`.
    const maskImageRe =
      /(?:-webkit-)?mask-image\s*:\s*url\(\s*["']?[^"')]*images\/brush-mask\.svg["']?\s*\)\s*;/;
    expect(body).toMatch(maskImageRe);
  });
});

describe("Reduced motion: paint() writes synchronously (Requirement 5.7)", () => {
  let restoreMatchMedia;

  beforeEach(() => {
    delete window.NIPPON;
    document.body.innerHTML = "";
    // Mock matchMedia BEFORE loading main.js so the BackgroundAnimator's
    // `prefersReducedMotion()` helper sees the mocked implementation on
    // every call.
    restoreMatchMedia = mockReducedMotion(true);
    loadMainJs(window);
  });

  afterEach(() => {
    if (typeof restoreMatchMedia === "function") restoreMatchMedia();
  });

  function mountAnimator() {
    document.body.innerHTML = `
      <div class="history-bg" data-history-bg aria-hidden="true">
        <div class="history-bg-layer history-bg-layer--from"></div>
        <div class="history-bg-layer history-bg-layer--to"></div>
      </div>
    `;
    const root = document.querySelector("[data-history-bg]");
    const fromLayer = root.querySelector(".history-bg-layer--from");
    const toLayer = root.querySelector(".history-bg-layer--to");

    // Minimal state stub: the BackgroundAnimator only needs `subscribe` and
    // `getState`. Returning `mood: null` from `getState` keeps the initial
    // paint as a no-op so the test can drive `paint()` explicitly.
    const stubState = {
      subscribe() {
        return function unsubscribe() {};
      },
      getState() {
        return { mood: null };
      }
    };
    window.NIPPON.history.BackgroundAnimator.mount(root, stubState);
    return {
      root,
      fromLayer,
      toLayer,
      paint: window.NIPPON.history.BackgroundAnimator.paint
    };
  }

  it("first paint writes mood directly to --from and leaves --to untouched", () => {
    const { fromLayer, toLayer, paint } = mountAnimator();

    paint("positive");

    expect(fromLayer.dataset.mood).toBe("positive");
    expect(toLayer.classList.contains("is-painting")).toBe(false);
    // The --to layer must not have been re-targeted at the new mood;
    // under reduced motion the wipe is short-circuited entirely.
    expect(toLayer.dataset.mood).toBeUndefined();
  });

  it("subsequent paints under reduced motion also write to --from synchronously", () => {
    const { fromLayer, toLayer, paint } = mountAnimator();

    paint("positive");
    expect(fromLayer.dataset.mood).toBe("positive");

    paint("dark");

    // Per the BackgroundAnimator spec: under reduced motion, every paint
    // (not just the first) writes directly to --from regardless of the
    // current mood. The --to layer remains in its zero-height starting
    // state.
    expect(fromLayer.dataset.mood).toBe("dark");
    expect(toLayer.classList.contains("is-painting")).toBe(false);
    expect(toLayer.dataset.mood).toBeUndefined();
  });
});

describe("Stacking context: background sits behind timeline and content (Requirement 7.6)", () => {
  it("declares .history-bg with an out-of-normal-flow position", () => {
    const body = extractRuleBody(STYLE_CSS, ".history-bg");
    expect(body, "missing top-level .history-bg rule").not.toBeNull();
    // `position: fixed` pulls the layer out of normal block flow so it
    // never affects sibling layout. `absolute` would also satisfy the
    // requirement; either is acceptable.
    expect(body).toMatch(/position\s*:\s*(?:fixed|absolute|sticky)\s*;/);
  });

  it("places .history-bg behind .history-timeline via z-index", () => {
    const bgBody = extractRuleBody(STYLE_CSS, ".history-bg");
    const timelineBody = extractRuleBody(STYLE_CSS, ".history-timeline");
    expect(bgBody).not.toBeNull();
    expect(timelineBody).not.toBeNull();

    const bgZ = parseZIndex(bgBody);
    const timelineZ = parseZIndex(timelineBody);

    // Both layers must declare a numeric z-index so the stacking order is
    // explicit and deterministic.
    expect(bgZ, ".history-bg must declare a numeric z-index").not.toBeNull();
    expect(timelineZ, ".history-timeline must declare a numeric z-index").not.toBeNull();

    expect(timelineZ).toBeGreaterThan(bgZ);
  });

  it("places .history-bg behind .history-content via z-index", () => {
    const bgBody = extractRuleBody(STYLE_CSS, ".history-bg");
    const contentBody = extractRuleBody(STYLE_CSS, ".history-content");
    expect(bgBody).not.toBeNull();
    expect(contentBody).not.toBeNull();

    const bgZ = parseZIndex(bgBody);
    const contentZ = parseZIndex(contentBody);

    expect(bgZ, ".history-bg must declare a numeric z-index").not.toBeNull();
    expect(contentZ, ".history-content must declare a numeric z-index").not.toBeNull();

    expect(contentZ).toBeGreaterThan(bgZ);
  });
});
