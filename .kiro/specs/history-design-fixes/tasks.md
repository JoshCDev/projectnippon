# Implementation Plan: History Design Fixes

## Overview

Convert the design into a series of incremental coding steps. The implementation language stays **vanilla JavaScript** authored in **ECMAScript 5 / Internet Explorer 11-compatible** syntax (no `let`/`const`, no arrow functions, no template literals, no destructuring, no spread/rest, no default parameters, no async/await, no Promise chains in user code, no ES6 classes), matching the parent `history-timeline-bar` spec. Every fix lives inside the four History_Page module files (`history.html`, `assets/js/history.js`, `assets/css/history.css`, `assets/data/history.json`); the shared `assets/js/main.js` and `assets/css/style.css` stay byte-identical.

The seven requirements split into three subsystems:

1. **State + content rendering** (Req 4, Req 5): a new `selection.markerDrilled` boolean flag in `HistoryState`; a new `eventsForYearRange` helper plus a branch in `ContentPanel.renderReady` that renders the full Card_List when `markerDrilled === false`; expanded PDF-sourced events in `assets/data/history.json`.
2. **Timeline geometry** (Reqs 1, 2, 3): JS-measured `Header_Clearance` for the fixed bar's `top` offset; corrected single-source-of-truth thumb centering math; circular Stop_Markers with an `Active_Stop` treatment via a `data-active="true"` attribute on the active span on both sliders.
3. **Footer + module isolation** (Reqs 6, 7): a scoped `body[data-page="history"] .site-footer` rule that lifts the footer above the fixed background layers; static lint guards confirming the deny-list (`clip-path`, `backdrop-filter`, `isolation: isolate`, `var(--mood-*)`, `position: sticky`) and the ES5 syntax constraint hold.

Tests use the existing **Vitest** + **jsdom** + **fast-check** harness under `tests/history/` (the parent spec already wires up the fixtures `loadMainJs`, `historyDataArb`, `interactionSequenceArb`, `mountSliders`). Each property test runs at least 100 iterations via `fc.assert(prop, { numRuns: 100 })`. Property tags follow the design's numbering (Property 1..6).

## Tasks

- [x] 1. Extend `assets/data/history.json` with PDF-sourced events per Year_Range (Req 5)
  - [x] 1.1 Add the missing PDF-sourced History_Event entries to `assets/data/history.json`
    - For `edo`, add the 1614 Osaka winter siege and the 1657 Meireki fire entries; for `taisho-showa-awal`, add the May 15, 1932 Incident (assassination of PM Inukai); for `kontemporer`, add the March 11, 2011 Tōhoku earthquake / Fukushima disaster and the May 1, 2019 transition to Reiwa under Emperor Naruhito; optionally add 1156 Hōgen-no-ran for `heian` and a Kofun sub-event for `yamato` if narrative balance benefits
    - Each new event uses the existing `evt-<yearRangeId>-<slug>` id convention and carries: a non-empty Indonesian `title` summarizing the event, a non-empty Indonesian `body` paragraph derived from the source PDF, a valid `yearRangeId` referencing one of the eleven shipped Year_Ranges, an integer `year` consistent with the PDF, an optional integer `month` in `[1, 12]` when the PDF gives a specific month, and exactly one `mood` value from `dark|positive|negative|sacred|casual` chosen per parent Req 6.3 guidance
    - Preserve every existing dated entry from parent Req 6.2 (Juli 645, Maret 794, Agustus 1543, Juni 1582, Oktober 1600, Maret 1854, Januari 1868, September 1923, Agustus 1945, Mei 1989) verbatim by id; this task is purely additive
    - Confirm the post-fix per-range counts satisfy `events.filter(e => e.yearRangeId === yr.id).length >= 3` for every Year_Range; do not introduce any user-visible Indonesian string literal into HTML or JS
    - The schema (`page`, `defaultYearRangeId`, `yearRanges` shape, `events` shape, the `_source` field) is unchanged; the loader's validation contract is unchanged
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 1.2 Extend `tests/history/data-schema.test.js` with per-Year_Range event count and PDF-coverage assertions
    - Assert `events.filter(e => e.yearRangeId === yr.id).length >= 3` for every Year_Range in `data.yearRanges` (Req 5.1)
    - Assert the documented dated events from parent Req 6.2 are still present by `(yearRangeId, year, month)` lookup, including the new dated entries added in task 1.1 (e.g., 1614 and 1657 for `edo`, 1932/05 for `taisho-showa-awal`, 2011/03 and 2019/05 for `kontemporer`)
    - Assert every event references an existing `yearRangeId` and carries a `mood` in the documented enum
    - _Requirements: 5.1, 5.2, 5.5, 5.6_

- [x] 2. Add the `markerDrilled` flag to `HistoryState` (Req 4 state machine)
  - [x] 2.1 Extend `createHistoryState()` in `assets/js/history.js` with the `Marker_Drill_State` flag and the `userInitiated` option
    - Author in ES5 (`var` only, function declarations / function expressions, no arrow functions, no destructuring, no default parameters, no template literals)
    - Initialize `state.selection.markerDrilled = false` inside the initial selection object and inside the value returned by `defaultSelection(data)`; also set it to `false` in `loadSuccess(data)` when the selection is reset to the default
    - Update `setYearRange(id)`: when the call actually changes the active Year_Range, set `state.selection.markerDrilled = false` after the auto-select side-effect that picks the first Time_Marker; preserve the existing no-op behavior when `id` matches the active Year_Range (the flag stays at its current value in that case)
    - Update `setTimeMarker(year, month, opts)` to accept an optional `opts` argument: when `opts && opts.userInitiated === true` and the call actually changes the `(year, month)` pair, set `state.selection.markerDrilled = true`; calls without `opts` (the auto-select side-effect of `setYearRange`) do not change the flag; redundant calls (same `(year, month)` already active) remain a no-op
    - The flag is purely in-memory; do not serialize it and do not include it in the `aria-live` announcement key (which stays `(yearRangeId, year, month)`)
    - _Requirements: 4.1, 4.3, 4.4_

  - [ ]* 2.2 Write property test for the Marker_Drill_State state machine
    - Create `tests/history/marker-drill-state.property.test.js` and re-import `createHistoryState` from `assets/js/history.js`
    - **Property 5: Marker_Drill_State follows the documented state machine**
    - Generate `historyDataArb()` plus a sequence of transitions drawn from `setYearRange(id)` (random ids over the loaded yearRanges plus a few random misses), `setTimeMarker(year, month)` (no `userInitiated`), and `setTimeMarker(year, month, { userInitiated: true })`; replay against a reference reducer that flips the flag exactly when (a) `setYearRange` actually changes the active Year_Range (→ `false`) or (b) `setTimeMarker` with `userInitiated: true` actually changes `(year, month)` (→ `true`); assert `state.getState().selection.markerDrilled` matches the reference after every step
    - Run with `fc.assert(prop, { numRuns: 100 })`
    - **Validates: Requirements 4.1, 4.3, 4.4**

- [x] 3. Add `eventsForYearRange` and branch the Content_Panel on `markerDrilled` (Req 4 rendering)
  - [x] 3.1 Add the `eventsForYearRange(yearRangeId, data)` helper and update `ContentPanel.renderReady` in `assets/js/history.js`
    - Author the helper in ES5: `var` only, explicit `for (var i = 0; i < n; i++)` loops, no destructuring; return every event whose `yearRangeId` matches, sorted ascending by `year`, then by `month` (year-only events first), then by `id` ascending; the sort matches the parent spec's `markersFor` ordering plus a stable id tiebreak
    - In `ContentPanel.renderReady(snapshot)`, branch on `snapshot.selection.markerDrilled`: when `true`, call the existing `eventsAt(sel.yearRangeId, sel.year, sel.month, data)` (preserving parent-spec Drilled_Time_Marker_Cards behavior); when `false`, call `eventsForYearRange(sel.yearRangeId, data)` (the new Active_Year_Range_Cards branch); when the resulting array is empty, render the existing empty-state block from `page.emptyStateTitle` / `page.emptyStateBody`
    - Loop over the matches and call the existing `renderEventArticle(ev, data)` once per event so each card retains the same `<article class="history-event" data-mood="...">` markup (head, badge, title, body, optional figure) the parent spec already produces, including the `.history-event-when` label populated by `formatMarkerLabel(ev.year, monthVal, monthNames)`
    - Do not change the live-region announcement contract: `maybeAnnounce(snapshot)` still keys on `(yearRangeId, year, month)` and ignores `markerDrilled`
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7_

  - [ ]* 3.2 Write property test for the Content_Panel Card_List render
    - Create `tests/history/card-list.property.test.js`; re-import `ContentPanel` and `createHistoryState` from `assets/js/history.js`
    - **Property 6: Content_Panel Card_List matches the active selection**
    - Generate `historyDataArb()` plus an `interactionSequenceArb()` mixing `setYearRange` and `setTimeMarker` (with and without `userInitiated: true`); after each step, when `markerDrilled === false` assert the rendered `<article class="history-event">` set equals `eventsForYearRange(activeYearRangeId, data)` in canonical sorted order, and when `markerDrilled === true` assert it equals `eventsAt(activeYearRangeId, activeYear, activeMonth, data)` in canonical sorted order; for every rendered article, assert `.history-event-when` text equals `formatMarkerLabel(event.year, event.month, page.monthNames)`; when matches are empty, assert the empty-state block is rendered
    - Run with `fc.assert(prop, { numRuns: 100 })`
    - **Validates: Requirements 4.2, 4.5, 4.7**

- [x] 4. Implement the JS-measured Header_Clearance for the Timeline_Bar (Req 1)
  - [x] 4.1 Add `updateTimelineTop(timelineEl)` and wire it into `TimelineBar.mount` plus the `window.resize` handler in `assets/js/history.js`
    - Author in ES5; the function reads `document.querySelector('.site-header')` and, when present, sets `timelineEl.style.top = (Math.max(0, Math.round(headerRect.bottom)) + 2) + 'px'`, where `headerRect = header.getBoundingClientRect()`; reading `headerRect.bottom` (instead of `.height`) tolerates a non-zero header `top` offset; the `+ 2` literal is the documented Header_Clearance budget within the `[0, 8]` range
    - When `.site-header` is missing, return without writing `style.top` so the CSS fallback (task 4.2) keeps the bar in roughly the right place; do not emit a console warning for this case
    - Call `updateTimelineTop(timelineEl)` once on mount and again from the existing debounced `window.resize` handler that already runs `updateSpacerHeight`; co-locate the two updates so the bar's `top` and the spacer's `height` cannot drift apart; do not install a `window.scroll` listener for re-measurement (the existing `position: fixed` strategy plus `position: sticky` header keeps `headerRect.bottom` stable while sticky-stuck)
    - Do not change the parent spec's `position: fixed`, `left: 0`, `right: 0`, `z-index: 50` strategy; only the `top` value is updated by this requirement
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 4.2 Update the `.history-timeline` rule in `assets/css/history.css` to use the JS fallback `top: 78px`
    - Replace the existing `top: 76px` literal with `top: 78px` (the measured-default header height of `76px` plus the `2px` Header_Clearance budget) so the bar still renders correctly before JavaScript runs and on browsers with JS disabled; add a leading comment noting JS overrides this value at runtime by writing `style.top` from the measured `.site-header` `getBoundingClientRect().bottom`
    - Keep `position: fixed`, `left: 0`, `right: 0`, `z-index: 50` unchanged; do not introduce `position: sticky`, `clip-path`, `backdrop-filter`, `isolation: isolate`, or `var(--mood-*)` anywhere in the file
    - _Requirements: 1.1, 1.5, 7.5, 7.6_

  - [ ]* 4.3 Write property test for the Header_Clearance budget
    - Create `tests/history/header-clearance.property.test.js`; re-import the TimelineBar mount fixture from `tests/history/setup.js`
    - **Property 1: Header_Clearance is bounded across header heights, scroll positions, and resizes**
    - Use `headerHeightArb = fc.integer({ min: 40, max: 200 })` to mock the `.site-header` `getBoundingClientRect().bottom` shim, mount `TimelineBar`, and assert `timelineEl.getBoundingClientRect().top - headerEl.getBoundingClientRect().bottom` lies in `[0, 8]` after mount; then synthesize a `window.resize` with a different mocked height and assert the invariant holds again; and synthesize a no-op resize (same height) and assert the invariant still holds
    - Run with `fc.assert(prop, { numRuns: 100 })`
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 4.4 Write example test confirming `TimelineBar` reads the live header height
    - In the same file or a new `tests/history/header-clearance.test.js`, spy on `Element.prototype.getBoundingClientRect` and assert `TimelineBar.mount` calls it on `document.querySelector('.site-header')` at least once; assert the bar's `style.top` is set to `(Math.round(headerRect.bottom) + 2) + 'px'`
    - _Requirements: 1.4_

- [x] 5. Fix the Year_Range_Slider and Time_Marker_Slider thumb centering (Req 2)
  - [x] 5.1 Replace the duplicate `translateX(<pct>%)` thumb math with a single-transform centering rule in `assets/js/history.js`
    - Add (or update) a shared helper `setThumbCenterPercent(thumb, percent)` authored in ES5 that sets `thumb.style.left = percent + '%';` and `thumb.style.transform = 'translate(-50%, -50%)';` only; use this helper from every place that currently writes `eraThumb.style.transform = "translate(-50%, -50%) translateX(" + pct + "%)"` (and the equivalent on the marker thumb), so the thumb's center sits at `left: <pct>%` of the track without any per-stop scaling proportional to the thumb's own width
    - Keep the existing `previewThumb(thumb, p)` drag handler using `thumb.style.left = (p * 100) + '%'` so the live drag preview also stays centered on the pointer; the duplicate `translateX` is removed entirely; the thumb's `.history-slider-thumb-line` and `.history-slider-thumb-label` children continue to use `left: 50%; transform: translateX(-50%)` relative to the thumb so they stay centered above the thumb's circle within 1 px
    - The Stop_Marker spans already use `style.left = (positions[k] * 100) + '%'` plus `transform: translateX(-50%)` from CSS (task 6.2 keeps that), so the thumb's center and the active Stop_Marker's center coincide for every value of `i`, including `i = 0` and `i = N - 1`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 5.2 Write property test for slider thumb centering
    - Create `tests/history/thumb-centering.property.test.js`; reuse the `mountSliders` fixture from `tests/history/setup.js`
    - **Property 2: Slider thumb centering**
    - Generate `N` in `fc.integer({ min: 1, max: 12 })` and active index `i` modulo `N`; mount both sliders, assert the thumb's center x equals the active Stop_Marker's center x within 1 px; assert the thumb's left edge is `>= track.left` and right edge is `<= track.right`; assert the thumb-line and thumb-label center x both equal the thumb's center x within 1 px; for any drag pointer `p` in `fc.double({ min: 0, max: 1 })`, after the drag-snap commit the thumb's center x equals the chosen stop's center x within 1 px
    - Run with `fc.assert(prop, { numRuns: 100 })`
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [x] 6. Render circular Stop_Markers with the `Active_Stop` treatment on both sliders (Req 3)
  - [x] 6.1 Tag the active stop with `data-active="true"` inside `renderEra(s)` and `renderMarker(s)` in `assets/js/history.js`
    - In the existing per-stop `for` loop in `renderEra`, when the loop index `k` equals the active Year_Range index, call `span.setAttribute('data-active', 'true')` immediately after the existing `style.left` assignment; do not write `data-active` on non-active spans (so a clean re-render with `clearChildren(eraStops)` automatically re-applies the attribute to whichever stop matches the newly active Year_Range)
    - Apply the same `data-active="true"` writing pattern in `renderMarker` keyed off the active Time_Marker index; when the active Year_Range has zero markers, the loop iterates zero times and no Stop_Marker is rendered, so no `data-active` attribute exists (consistent with parent Req 3.9 and this spec's Req 3.6)
    - Do not change the existing click-on-stops handler, the `snapToNearest` math, the `aria-valuemin`/`aria-valuemax`/`aria-valuenow`/`aria-valuetext` writes, or the keyboard map; the new attribute is purely a CSS hook for the `Active_Stop` treatment
    - _Requirements: 3.2, 3.5, 3.6_

  - [x] 6.2 Restyle `.history-slider-stops > span` as circular Stop_Markers with the `Active_Stop` modifier in `assets/css/history.css`
    - Replace the parent spec's narrow vertical-tick rules (`width: 1px; height: 8px; background: rgba(...);`) with circular Stop_Marker rules per the design: `.history-slider--years .history-slider-stops > span { top: 50%; width: 8px; height: 8px; border-radius: 50%; background: rgba(17, 36, 63, 0.35); border: 1px solid rgba(17, 36, 63, 0.45); -webkit-transform: translate(-50%, -50%); -ms-transform: translate(-50%, -50%); transform: translate(-50%, -50%); }` and the matching `.history-slider--years .history-slider-stops > span[data-active="true"] { background: #11243f; border-color: #11243f; width: 10px; height: 10px; }` for the Year_Range_Slider's `Active_Stop`
    - Add the parallel rule for the Time_Marker_Slider: `.history-slider--markers .history-slider-stops > span { top: 50%; width: 7px; height: 7px; border-radius: 50%; background: #fcf6e6; border: 1px solid rgba(17, 36, 63, 0.45); -webkit-transform: translate(-50%, -50%); -ms-transform: translate(-50%, -50%); transform: translate(-50%, -50%); }` and `.history-slider--markers .history-slider-stops > span[data-active="true"] { background: #11243f; border-color: #11243f; width: 9px; height: 9px; }`
    - Do not change the marker thumb shape (it stays the vertical line via `.history-slider-thumb--line` from the parent spec); do not introduce `clip-path`, `backdrop-filter`, `isolation: isolate`, or `var(--mood-*)`; keep mobile-first authoring
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 7.5, 7.6_

  - [ ]* 6.3 Write property test for the Stop_Marker count and circular shape
    - Create `tests/history/stop-markers.property.test.js`; reuse `historyDataArb` and `interactionSequenceArb` from `tests/history/setup.js`
    - **Property 3: Rendered Stop_Marker count matches the data on both sliders**
    - For any valid `HistoryData` and any sequence of `setYearRange` / `setTimeMarker` interactions, after each step assert the `<span>` count inside `.history-slider--years .history-slider-stops` equals `data.yearRanges.length`; the `<span>` count inside `.history-slider--markers .history-slider-stops` equals `markersFor(activeYearRangeId, data).length`; each rendered `<span>`'s `getBoundingClientRect()` width equals its height within ±1 px and its computed `border-radius` is `50%`
    - Run with `fc.assert(prop, { numRuns: 100 })`
    - **Validates: Requirements 3.1, 3.4, 3.5, 3.6**

  - [ ]* 6.4 Write property test for the single-`Active_Stop` invariant
    - Create `tests/history/active-stop.property.test.js`; reuse the same fixtures
    - **Property 4: Exactly one Active_Stop on a non-empty slider, zero on an empty marker slider**
    - For any `historyDataArb` and any `interactionSequenceArb`, after each step assert the era slider has exactly one `[data-active="true"]` span and that span's index in `eraStops.children` equals the active Year_Range index; the marker slider has exactly one `[data-active="true"]` span when `markersFor(activeYearRangeId, data).length > 0` and zero such spans otherwise; when the active marker is at index `j`, the marker slider's `data-active="true"` span is the j-th `<span>` in DOM order
    - Run with `fc.assert(prop, { numRuns: 100 })`
    - **Validates: Requirements 3.2, 3.5, 3.6**

- [x] 7. Wire `userInitiated: true` from `TimelineBar` user interactions to `setTimeMarker` (Req 4 plumbing)
  - [x] 7.1 Update `commitMarkerIndex(i)` and the marker-thumb keyboard / click / dropdown handlers in `assets/js/history.js`
    - In `commitMarkerIndex(i)` (the funnel for marker-thumb mouse drag release, touch drag release, click on the marker track or stop, and keyboard ArrowLeft / ArrowRight / Home / End), pass `{ userInitiated: true }` as the third argument to `state.setTimeMarker(year, month, ...)` so every real user interaction flips `markerDrilled` to `true`
    - The era-slider `commitEraIndex` and the Era_Dropdown `change` handler continue to call `state.setYearRange(id)` (which resets `markerDrilled = false` per task 2.1); they do not pass `userInitiated`
    - The internal `setTimeMarker` side-effect inside `setYearRange` (auto-selecting the first marker) does not pass `userInitiated`, so `markerDrilled` stays `false` on Year_Range entry per Req 4.4
    - Do not change the `aria-live` announcement key, the keyboard map, the drag-and-snap math, or the spacer height bookkeeping; this task is purely about adding the `{ userInitiated: true }` option object at the existing call sites
    - _Requirements: 4.1, 4.3, 4.4_

- [x] 8. Make the site footer fully visible at the bottom of the History_Page (Req 6)
  - [x] 8.1 Add a scoped `body[data-page="history"] .site-footer` stacking rule in `assets/css/history.css`
    - Append the rule `body[data-page="history"] .site-footer { position: relative; z-index: 60; background: #f4ead4; }` near the end of the file with a leading comment noting that `z-index: 60` sits above `.history-timeline (50)` and the three background layers (`--from(1)`, `--phase1(2)`, `--phase2(3)`); the duplicated `background` value matches the existing `.site-footer` paper color from shared `assets/css/style.css` so the History_Page footer renders the same paper hue without modifying the shared file
    - Do not introduce any new `position: fixed` element below the bar; do not introduce `clip-path`, `backdrop-filter`, `isolation: isolate`, or `var(--mood-*)`; the rule is the only change required by Requirement 6 (the existing `.site-footer` markup already lives as a sibling of `<main class="history-page">` in `history.html` with the documented links and `<span data-current-year>`)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.5, 7.6_

  - [ ]* 8.2 Write example test for footer stacking on the History_Page
    - Create `tests/history/footer-stacking.test.js`; load `history.html` into jsdom with `assets/css/history.css` parsed against the document
    - Assert `<footer class="site-footer">` exists as a sibling of `<main class="history-page">` (Req 6.1); assert all four documented links (`history.html`, `art-music.html`, `architecture.html`, `quiz.html`) and the `<span data-current-year>` element exist (Req 6.5); assert that under `body[data-page="history"]` the computed `z-index` of `.site-footer` is greater than the computed `z-index` of `.history-bg-layer--phase2` (Reqs 6.2, 6.3, 6.4); assert the `assets/css/history.css` text contains no `position: fixed` declaration on any selector other than `.history-bg`, `.history-timeline`, and the existing parent-spec rules (Req 6.6)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 9. Static guards for module isolation, ES5 syntax, and the CSS deny-list (Req 7)
  - [ ]* 9.1 Write a CSS deny-list lint test for `assets/css/history.css`
    - Create `tests/history/css-deny-list.test.js`; read `assets/css/history.css` as text and assert it contains zero matches for each of `clip-path`, `backdrop-filter`, `isolation: isolate`, `var(--mood-`, and `position: sticky` (the `--mood-*` names are allowed only inside CSS comment blocks, which the test exempts by stripping `/* ... */` ranges before grepping); this is the static guard for parent Reqs 9.10, 9.11, 9.12, 9.13 and this spec's Req 7.5
    - _Requirements: 7.5, 7.6_

  - [ ]* 9.2 Write an ES5 syntax lint test for `assets/js/history.js`
    - Create `tests/history/es5-syntax.test.js`; if `acorn` is installed in `devDependencies`, parse `assets/js/history.js` with `acorn.parse(source, { ecmaVersion: 5 })` and assert no parse errors; if `acorn` is not available, fall back to a grep-based lint that strips `/* ... */` and `// ...` ranges plus quoted string literals, then asserts the residual source contains zero matches for `\blet\s+`, `\bconst\s+`, `=>`, `` ` ``, `\.\.\.`, and `\bclass\s+` (Req 7.4)
    - _Requirements: 7.4_

  - [ ]* 9.3 Write a static check that the shared site files were not modified by this spec
    - Create `tests/history/shared-files-untouched.test.js`; assert `assets/js/main.js` contains no `markerDrilled` references, no `eventsForYearRange` declarations, and no `History_Clearance` / Stop_Marker rendering helpers (the History_Page-only code was already moved out by the parent spec's task 2.2 and this spec adds nothing back); assert `assets/css/style.css` contains no `body[data-page="history"]` selector and no Stop_Marker rules introduced by this spec (Reqs 7.1, 7.2, 7.3)
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 10. Final checkpoint - all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Sub-tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation sub-tasks are never optional.
- Each sub-task references the granular acceptance criteria it covers so traceability is preserved.
- Property test sub-tasks are placed close to the implementation they validate (Property 1 next to the Header_Clearance work, Property 2 next to thumb centering, Properties 3-4 next to Stop_Marker rendering, Property 5 next to the state machine, Property 6 next to the Card_List branch) so regressions surface early.
- Property numbering matches the design document (1..6); each annotated property tag is the design's source of truth.
- All Indonesian-language copy lives in `assets/data/history.json` (Req 5.7 + parent Req 1.7); no new string literals are introduced into HTML or JS by this spec.
- Only the four History_Page module files (`history.html`, `assets/js/history.js`, `assets/css/history.css`, `assets/data/history.json`) are touched. The shared `assets/js/main.js` and `assets/css/style.css` stay byte-identical (Reqs 7.1, 7.2, 7.3).
- All JavaScript stays in ES5 / IE11-compatible syntax (Req 7.4); the CSS deny-list (`clip-path`, `backdrop-filter`, `isolation: isolate`, `var(--mood-*)`, `position: sticky`) and the mobile-first authoring discipline are preserved (Reqs 7.5, 7.6).

## Task Dependency Graph

Tasks that write to `assets/js/history.js` (2.1, 3.1, 4.1, 5.1, 6.1, 7.1) are serialized across separate waves to avoid file-edit conflicts. Tasks that write to `assets/css/history.css` (4.2, 6.2, 8.1) are likewise serialized. Test sub-tasks live in their own files under `tests/history/` so they can batch with the next writer.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1"] },
    { "id": 2, "tasks": ["3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "5.1"] },
    { "id": 4, "tasks": ["5.2", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 6, "tasks": ["8.1", "8.2", "9.1", "9.2", "9.3"] }
  ]
}
```
