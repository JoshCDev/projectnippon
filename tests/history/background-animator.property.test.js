// tests/history/background-animator.property.test.js
//
// Property-based test for the `BackgroundAnimator`.
//
// Property 9 (from design.md "Correctness Properties"):
//   For any sequence of `paint(mood)` calls (with arbitrary delays,
//   including delays smaller than `Medium_Pace`), after the last call has
//   had time to settle, the visible background color equals the CSS
//   variable mapped to the *last* effective mood in the sequence. Each
//   individual completed wipe's measured duration is within [1100, 1300]
//   ms, as declared by the `.history-bg-layer--to` transition rule.
//
// **Validates: Requirements 5.2, 5.3, 5.5**
//
// Two assertions cover the property:
//
//   1. Convergence (req 5.2, 5.5). For an arbitrarily long, arbitrarily
//      noisy sequence of `paint()` calls, after firing a single
//      `transitionend` (with `propertyName: 'clip-path'`) on the `--to`
//      layer the `fromLayer.dataset.mood` equals the model's predicted
//      final mood. The model mirrors the documented `paint()` semantics:
//      the first paint writes synchronously, subsequent calls re-target
//      the in-flight `--to` layer, and a paint whose mood matches the
//      current mood is a no-op.
//
//   2. Duration (req 5.3). `assets/css/style.css` declares the
//      `.history-bg-layer--to` transition with a `clip-path` duration in
//      [1100, 1300] ms and a `cubic-bezier(0.4, 0, 0.2, 1)` timing
//      function. Because jsdom does not run real CSS animations or fire
//      transitionend automatically, the documented duration on the rule
//      itself is the contract that the runtime relies on.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fc from "fast-check";
import fs from "node:fs";
import path from "node:path";
import { loadMainJs, REPO_ROOT } from "./setup.js";

// ---------------------------------------------------------------------------
// Constants matching the documented Mood enum and the Medium_Pace window
// ---------------------------------------------------------------------------

const VALID_MOODS = ["dark", "positive", "negative", "sacred", "casual"];
const MEDIUM_PACE_MIN_MS = 1100;
const MEDIUM_PACE_MAX_MS = 1300;

// ---------------------------------------------------------------------------
// Module bootstrap
// ---------------------------------------------------------------------------

let BackgroundAnimator;

function ensureHistoryModule() {
  if (
    !window.NIPPON ||
    !window.NIPPON.history ||
    !window.NIPPON.history.BackgroundAnimator
  ) {
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
  }
  BackgroundAnimator = window.NIPPON.history.BackgroundAnimator;
}

// A minimal stub state. The animator only invokes `subscribe` and
// `getState`; we keep `mood: null` in the initial snapshot so the mount
// itself does not paint, leaving the test in full control of the paint
// sequence.
function buildStubState() {
  return {
    subscribe() {
      return function unsubscribe() {};
    },
    getState() {
      return { mood: null };
    }
  };
}

// Build the documented background scaffold:
//   <div data-history-bg>
//     <div class="history-bg-layer history-bg-layer--from"></div>
//     <div class="history-bg-layer history-bg-layer--to"></div>
//   </div>
function buildScaffold() {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.setAttribute("data-history-bg", "");
  root.className = "history-bg";
  root.setAttribute("aria-hidden", "true");
  const fromLayer = document.createElement("div");
  fromLayer.className = "history-bg-layer history-bg-layer--from";
  const toLayer = document.createElement("div");
  toLayer.className = "history-bg-layer history-bg-layer--to";
  root.appendChild(fromLayer);
  root.appendChild(toLayer);
  document.body.appendChild(root);
  return { root, fromLayer, toLayer };
}

// Fire a `transitionend` event whose `propertyName` is `clip-path` so the
// animator's handler treats it as the wipe's natural settle. jsdom does
// not synthesize transitionend itself, so the test drives it explicitly.
function fireClipPathTransitionEnd(toLayer) {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", {
    value: "clip-path",
    writable: false
  });
  toLayer.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Pure model of `paint()` that we use to predict the final fromLayer mood.
// Mirrors `BackgroundAnimator.paint` in `assets/js/main.js`:
//   - The first paint (or any paint while currentMood is null) writes the
//     mood synchronously and leaves the --to layer at its zero-height
//     resting state (no wipe in flight).
//   - A paint whose mood already equals currentMood is a no-op.
//   - Otherwise the --to layer is re-targeted at the requested mood and a
//     wipe is in flight; any further paints during the wipe just
//     re-target the --to layer until the wipe settles.
//   - On `transitionend`, the --from layer adopts whatever mood the --to
//     layer is currently carrying (the most recently re-targeted mood).
// ---------------------------------------------------------------------------

function modelInitial() {
  return {
    fromMood: null, // CSS-visible mood on the --from layer
    toMood: null, // re-targeted mood on the --to layer (only during wipe)
    wipeInFlight: false,
    currentMood: null // matches the animator's internal `currentMood`
  };
}

function modelPaint(model, mood) {
  if (!mood) return model;
  if (mood === model.currentMood) return model;
  if (model.currentMood === null) {
    return {
      fromMood: mood,
      toMood: null,
      wipeInFlight: false,
      currentMood: mood
    };
  }
  // currentMood is set and the new mood differs => wipe path. The --to
  // layer carries the latest mood; the --from layer keeps its previous
  // mood until the wipe settles. currentMood does NOT change until the
  // transitionend handler fires.
  return {
    ...model,
    toMood: mood,
    wipeInFlight: true
  };
}

function modelSettle(model) {
  if (!model.wipeInFlight) return model;
  return {
    fromMood: model.toMood,
    toMood: null,
    wipeInFlight: false,
    currentMood: model.toMood
  };
}

// ---------------------------------------------------------------------------
// CSS parsing helpers (only used for the duration assertion)
// ---------------------------------------------------------------------------

const STYLE_CSS_PATH = path.join(REPO_ROOT, "assets", "css", "style.css");

/**
 * Extract the body of the first top-level CSS rule whose selector list
 * ends in `selector` followed by optional whitespace and `{`. Vanilla
 * top-level CSS rules have flat bodies, so a non-greedy `[^{}]*` body
 * match is correct.
 */
function extractRuleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    "(?:^|[\\s,}])" + escaped + "\\s*\\{([^{}]*)\\}",
    "m"
  );
  const match = css.match(re);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const moodArb = fc.constantFrom(...VALID_MOODS);

// 1+ paint moods, freely sampled from the enum so fast-check naturally
// covers no-op repeats and back-and-forth toggling.
const paintSequenceArb = fc.array(moodArb, { minLength: 1, maxLength: 12 });

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("BackgroundAnimator (Property 9, validates Requirements 5.2, 5.3, 5.5)", () => {
  beforeAll(() => {
    ensureHistoryModule();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.NIPPON;
    loadMainJs(window);
    BackgroundAnimator = window.NIPPON.history.BackgroundAnimator;
  });

  it(
    "converges to the most recent effective Mood after settling: " +
      "fromLayer.dataset.mood equals the model-predicted final mood for " +
      "any sequence of paint() calls",
    () => {
      fc.assert(
        fc.property(
          moodArb,
          paintSequenceArb,
          (initialMood, sequence) => {
            // Fresh DOM and animator per iteration so prior listeners,
            // pending handlers, and dataset state never leak across runs.
            const { root, fromLayer, toLayer } = buildScaffold();
            BackgroundAnimator.mount(root, buildStubState());

            // Step 1: initial paint sets `currentMood` and writes
            // `fromLayer.dataset.mood = initialMood` synchronously. This
            // is the prerequisite for exercising the wipe path on
            // subsequent calls (the first paint never animates).
            BackgroundAnimator.paint(initialMood);

            // Build the predicted state by feeding the same calls to the
            // pure model. The model lets us reason about what
            // `fromLayer.dataset.mood` should equal after the wipe
            // settles for *any* generated sequence, including ones where
            // every paint is a no-op (sequence === initial mood).
            let model = modelPaint(modelInitial(), initialMood);

            // Step 2: drive the rapid-fire sequence.
            for (const mood of sequence) {
              BackgroundAnimator.paint(mood);
              model = modelPaint(model, mood);
            }

            // Step 3: simulate the wipe finishing by firing transitionend
            // on the --to layer. We only do this when the model says a
            // wipe is in flight; firing on an idle --to layer would
            // exercise behavior outside the property's scope.
            if (model.wipeInFlight) {
              fireClipPathTransitionEnd(toLayer);
            }
            const expected = modelSettle(model);

            // Property: the visible mood on the --from layer equals the
            // model's predicted final mood (req 5.2, 5.5).
            expect(fromLayer.dataset.mood).toBe(expected.fromMood);

            // The --to layer ends in its zero-height resting state with
            // no pending dataset mood: either the wipe finished and the
            // handler cleared it, or no wipe was ever started.
            expect(toLayer.dataset.mood).toBeUndefined();
            expect(toLayer.classList.contains("is-painting")).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    "declares the .history-bg-layer--to wipe duration within [1100, 1300] ms " +
      "with cubic-bezier(0.4, 0, 0.2, 1) per the design's Medium_Pace (req 5.3)",
    () => {
      const css = fs.readFileSync(STYLE_CSS_PATH, "utf8");
      const body = extractRuleBody(css, ".history-bg-layer--to");
      expect(
        body,
        "missing top-level .history-bg-layer--to rule in style.css"
      ).not.toBeNull();

      // Capture every `transition` declaration on the --to layer. The rule
      // body may declare one or more `transition` lines (e.g., the
      // standard property and the `-webkit-` variant); each must satisfy
      // the duration window so the wipe runs at Medium_Pace regardless
      // of which property the browser observes.
      const transitionDeclRe = /transition\s*:\s*([^;]+);/g;
      const declarations = [];
      let m;
      while ((m = transitionDeclRe.exec(body)) !== null) {
        declarations.push(m[1]);
      }
      expect(
        declarations.length,
        "missing transition declaration on .history-bg-layer--to"
      ).toBeGreaterThan(0);

      // Each transition declaration may bundle multiple properties via
      // commas (e.g., `clip-path 1200ms cubic-bezier(...), -webkit-clip-path 1200ms cubic-bezier(...)`).
      // We expand a list of `(property, durationMs, easing)` tuples.
      // Durations are matched as integers (`1200ms`) or fractional
      // seconds (`1.2s`); both are normalized to milliseconds before
      // checking the [1100, 1300] window.
      const segmentRe =
        /(\S+)\s+(\d+(?:\.\d+)?)(ms|s)\s+(cubic-bezier\(\s*[^)]+\))/g;
      const segments = [];
      for (const decl of declarations) {
        // Split on top-level commas (cubic-bezier itself uses commas
        // inside parens, so we need a depth-aware splitter).
        const parts = [];
        let depth = 0;
        let buf = "";
        for (const ch of decl) {
          if (ch === "(") depth += 1;
          else if (ch === ")") depth -= 1;
          if (ch === "," && depth === 0) {
            parts.push(buf.trim());
            buf = "";
          } else {
            buf += ch;
          }
        }
        if (buf.trim().length > 0) parts.push(buf.trim());
        for (const part of parts) {
          segmentRe.lastIndex = 0;
          const sm = segmentRe.exec(part);
          if (!sm) continue;
          const [, prop, durRaw, durUnit, easing] = sm;
          const durMs =
            durUnit === "ms" ? Number(durRaw) : Number(durRaw) * 1000;
          segments.push({ prop, durMs, easing });
        }
      }

      // We require at least one segment that targets the `clip-path`
      // (or `-webkit-clip-path`) property; that is the one driving the
      // wipe. All such segments must fall in the window and use the
      // documented easing.
      const clipSegments = segments.filter(
        (seg) => seg.prop === "clip-path" || seg.prop === "-webkit-clip-path"
      );
      expect(
        clipSegments.length,
        "no clip-path transition segment found on .history-bg-layer--to"
      ).toBeGreaterThan(0);

      for (const seg of clipSegments) {
        expect(seg.durMs).toBeGreaterThanOrEqual(MEDIUM_PACE_MIN_MS);
        expect(seg.durMs).toBeLessThanOrEqual(MEDIUM_PACE_MAX_MS);
        // Normalize whitespace before comparing the easing function
        // signature so formatting differences in the source CSS do not
        // break the assertion.
        const easingNorm = seg.easing.replace(/\s+/g, "");
        expect(easingNorm).toBe("cubic-bezier(0.4,0,0.2,1)");
      }
    }
  );
});
