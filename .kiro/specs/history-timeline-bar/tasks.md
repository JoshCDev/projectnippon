# Implementation Plan: History Timeline Bar

## Overview

Convert the design into a series of incremental coding steps. The implementation language is **vanilla JavaScript** (matching the existing Project: NIPPON stack of plain HTML, CSS, and JS), but the History_Page feature is now delivered in two **dedicated** files - `assets/js/history.js` and `assets/css/history.css` - authored in **ECMAScript 5 / Internet Explorer 11-compatible** syntax (var only, no arrow functions, string concatenation with `+`, no template literals, no async/await, no Promise chains in user code, no destructuring, no spread/rest, no ES6 classes). The shared site files `assets/js/main.js` and `assets/css/style.css` (which maintain the home, quiz, seni, makanan/clothing-culinary, architecture, and art-music pages) stay byte-identical apart from removing History_Page-only code that was previously embedded in them; `NIPPON.loadJSON`, `initNavigation`, and the home-page render functions in `main.js` are not modified by this feature.

Tests use **Vitest** in a `jsdom` environment with **fast-check** for property-based tests, all under `tests/history/`. Test files load both `assets/js/main.js` (for the shared site shell) and `assets/js/history.js` (for the History_Page modules) into the jsdom document. Each implementation step builds on the previous one and wires into the orchestrator at the end. No build step is introduced beyond the existing static-file workflow.

The Timeline_Bar is a pair of stacked sliders (a page-wide Year_Range_Slider on top with a thumb that carries a floating "label, from - to" tag and a vertical indicator line, and a shorter, narrower Time_Marker_Slider beneath it whose thumb is rendered as a vertical line rather than a circle) plus a paired Era_Dropdown (a native `<select data-history-era-select>` labeled "Periode" that mirrors the Year_Range_Slider's stops one-to-one). Both sliders snap to the nearest discrete stop on drag release using mouse + touch events (no Pointer Events), support ArrowLeft/ArrowRight/Home/End from the keyboard, and expose `role="slider"` with the full set of `aria-value*` attributes. The bar is positioned with `position: fixed; top: 76px; left: 0; right: 0;` plus a sibling `.history-timeline-spacer` element (instead of `position: sticky`) so that Internet Explorer 11 keeps it anchored at the top of the viewport.

The Background_Animator runs a two-phase mood transition: Phase 1 fades a white overlay over the previous mood color over 35-45 % of the total Medium_Pace duration, then Phase 2 sweeps the new mood color from the left edge to the right edge of the viewport over the remaining 55-65 % by transitioning the `--phase2` overlay layer's CSS `width` from `0` to `100%` (instead of animating `clip-path`, which IE11 does not support). Total duration stays in `[1100, 1300]` ms. Mood colors are **hardcoded hex values** on each `.history-bg-layer[data-mood="..."]` rule (the `--mood-*` names appear only in a leading comment) because IE11 does not implement CSS Custom Properties. `clip-path`, `backdrop-filter`, and `isolation: isolate` are banned from `assets/css/history.css`; layer stacking is managed by `z-index` only. The CSS is authored mobile-first (base rules target ≤599 px, `@media (min-width: 600px)` and `@media (min-width: 960px)` progressively enhance for tablet and desktop).

The shipped `assets/data/history.json` covers the eleven major Japanese historical periods (Zaman Kuno / Yamato through Era Kontemporer) sourced from `assets/data/Rangkuman Sejarah Jepang Berbasis Timeline.pdf`, with `defaultYearRangeId` set to Yamato.

## Tasks

- [x] 1. Set up test tooling and the dedicated history data file
  <!-- 1.1 and 1.2 are complete; sub-task 1.3 (optional schema sanity test) was skipped per user choice. The parent is closed because every non-optional child is done. -->
  - [x] 1.1 Add Vitest, fast-check, and jsdom as dev dependencies and create `vitest.config.js`
    - Initialize `package.json` if not present, add the three dev dependencies, configure Vitest to use the `jsdom` environment, and create the `tests/history/` directory with a shared `setup.js` that loads both `assets/js/main.js` and `assets/js/history.js` into the jsdom document
    - _Requirements: 1.1 (test harness for loader behavior), 8.x (jsdom needed for DOM property tests)_

  - [x] 1.2 Create `assets/data/history.json` with real Japanese history content from the source PDF
    - Add `page` keys (`eyebrow`, `title`, `intro`, `emptyStateTitle`, `emptyStateBody`, `loadErrorMessage`, `loadingMessage`, `placeholderBadge`, `selectionAnnouncementTemplate`, `monthNames[12]`) in Indonesian
    - Set `defaultYearRangeId: "yamato"` so the page opens at the earliest period on first load
    - Add the eleven Year_Ranges in chronological order with the documented ids and `from`/`to` years: `yamato` (-10000..538), `asuka` (538..710), `nara` (710..794), `heian` (794..1185), `kamakura` (1185..1333), `muromachi-azuchi-momoyama` (1336..1603), `edo` (1603..1868), `meiji` (1868..1912), `taisho-showa-awal` (1912..1945), `pendudukan-sekutu` (1945..1952), `kontemporer` (1989..current ship year), each carrying a Mood
    - Add a top-level `_source` field citing `assets/data/Rangkuman Sejarah Jepang Berbasis Timeline.pdf` (Req 9.19); the loader ignores this field
    - Add History_Events drawn from the source PDF, including at minimum the dated entries called out in Req 6.2 (Juli 645 Reformasi Taika, Maret 794 Heian-kyo, ~1010 Genji Monogatari, 538 Buddhisme dari Baekje, Juni 1582 Insiden Honnō-ji, Agustus 1543 Tanegashima, Oktober 1600 Sekigahara, Maret 1854 Perjanjian Kanagawa, Januari 1868 Restorasi Meiji, September 1923 Gempa Kanto, Agustus 1945 bom atom, Mei 1989 awal Heisei, Lost Decades) with non-empty `title`, non-empty `body`, valid `yearRangeId`, year and optional 1..12 `month` per the PDF, and a Mood per the Req 6.3 guidance
    - Ensure the dataset exercises every code path: at least one Year_Range with multiple distinct months (multiple Time_Markers), one Year_Range with multiple events on the same `(year, month)` (one Time_Marker, multiple events), and at least one event with no `month` field (year-only Time_Marker); every Mood value appears at least once
    - Use `placeholder: true` only on genuinely in-progress entries; shipped real-history events default to `false` or omit the field
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.6, 9.19_

  - [ ]* 1.3 Write a schema sanity example test for the shipped `history.json`
    - Place the test file at `tests/history/data-schema.test.js` and load `history.json` directly from disk (no `loadHistoryJSON` call, no `assets/js/history.js` execution required)
    - Assert all required `page` keys exist and are non-empty (including `loadingMessage`, `placeholderBadge`, `selectionAnnouncementTemplate`, and a 12-element `monthNames` array)
    - Assert the eleven shipped Year_Ranges are present with the documented ids and in chronological order (Yamato first, Era Kontemporer last)
    - Assert `defaultYearRangeId === "yamato"` and that it references an existing Year_Range
    - Assert the documented dated events from Req 6.2 (Juli 645, Maret 794, Agustus 1543, Juni 1582, Oktober 1600, Maret 1854, Januari 1868, September 1923, Agustus 1945, Mei 1989) are present with the expected `(year, month)` values
    - Assert every event references an existing `yearRangeId`, every `to >= from`, and at least one event of each Mood value exists across the dataset
    - _Requirements: 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.6_

- [x] 2. Create the dedicated `history.js` and `history.css` files and wire them into `history.html`
  - [x] 2.1 Create the empty `assets/js/history.js` and `assets/css/history.css` files, declare `APP_VERSION`, and reference both from `history.html`
    - Create `assets/js/history.js` with a single IIFE wrapper and a leading citation comment block naming `assets/data/Rangkuman Sejarah Jepang Berbasis Timeline.pdf` as the source of the Japanese-history narrative content surfaced through the History_Page (Req 9.19); declare `var APP_VERSION = '<value>';` at the top of the IIFE so the loader and tests can read it; the value MUST match the `APP_VERSION` declared in `assets/js/main.js` (Req 7.4)
    - Create `assets/css/history.css` with a leading citation comment block naming the same PDF (Req 9.19) and a documentation-only comment block listing the `--mood-*` palette names (Req 9.10); the file is otherwise empty until task 2.3 fills it in
    - In `history.html`, add `<link rel="stylesheet" href="assets/css/history.css?v=APP_VERSION">` after the existing `<link rel="stylesheet" href="assets/css/style.css?v=APP_VERSION">` in `<head>`, and add `<script src="assets/js/history.js?v=APP_VERSION"></script>` after the existing `<script src="assets/js/main.js?v=APP_VERSION"></script>` near the end of `<body>` (Reqs 9.2, 9.3); both new references use the same bumped `APP_VERSION` query string as the existing two (Req 7.4)
    - Confirm none of the other site pages (`index.html`, `quiz.html`, `clothing-culinary.html`, `architecture.html`, `art-music.html`) reference `assets/js/history.js` or `assets/css/history.css` (Req 9.4)
    - _Requirements: 7.4, 9.1, 9.2, 9.3, 9.4, 9.19_

  - [x] 2.2 Move History_Page-only code out of the shared `assets/js/main.js` and `assets/css/style.css` files
    - In `assets/js/main.js`, remove every History_Page-only declaration that was previously embedded: any `HISTORY_*` constants (e.g., `HISTORY_LOAD_ERROR_FALLBACK`, `HISTORY_DATA_PATH`), any `validateHistory*` / `normalizeHistory*` helpers, the `HistoryDataLoader` module, the `markersFor` / `eventsAt` / `formatMarkerLabel` / `resolveMood` / `defaultSelection` / `snapToNearest` helpers, the `createHistoryState` factory, the `TimelineBar` / `ContentPanel` / `BackgroundAnimator` modules, and the `initHistoryPage` orchestrator together with any `document.body.dataset.page === 'history'` guard branch in the file's `DOMContentLoaded` handler
    - In `assets/css/style.css`, remove every `.history-*` rule (`.history-page`, `.history-bg`, `.history-bg-layer*`, `.history-timeline*`, `.history-slider*`, `.history-content*`, `.history-event*`, `.history-empty`, `.history-loading`, `.history-live`, `.history-era-dropdown*`) and any `--mood-*` custom property declarations on `:root`; keep `--header-height`, `--paper`, `--ink`, and the rest of the shared site palette so the other pages keep rendering identically
    - The rest of `main.js` (the `NIPPON.loadJSON` helper, `initNavigation`, the home-page renderers, and any other shared code) MUST be byte-identical apart from these removals; the rest of `style.css` MUST be byte-identical apart from these removals (Req 9.5)
    - This task is the only edit allowed on the two shared files for this feature
    - _Requirements: 9.5_

  - [x] 2.3 Rework `history.html` to host the two-slider Timeline_Bar, the Era_Dropdown, the spacer, the Content_Panel, and the three-layer Background_Animator
    - Replace the `.page-placeholder` block with the `<main class="history-page" data-history-root>` markup defined in the design: `.history-bg` containing **three** layers (`.history-bg-layer--from`, `.history-bg-layer--phase1` with `data-phase="desaturate"`, `.history-bg-layer--phase2` with `data-phase="sweep"`); `.history-timeline[data-history-timeline]` containing a `.container` with two `.history-slider` blocks (`--years` on top, `--markers` underneath) and the documented inner DOM (`-track`, `-stops`, `-thumb` carrying `role="slider"` and `tabindex="0"`); a sibling `<div class="history-timeline-spacer" data-history-timeline-spacer aria-hidden="true"></div>` element rendered immediately after `.history-timeline` so the Content_Panel does not jump under the bar when the bar leaves normal flow (Req 9.11); `.history-content[data-history-content]` with eyebrow/title/intro/events/live region
    - Inside the Year_Range_Slider, render the Era_Dropdown as `<label class="history-era-dropdown" data-history-era-dropdown><span class="history-era-dropdown-label">Periode</span><select data-history-era-select></select></label>`; the `<option>` list is generated by `TimelineBar` at runtime so the markup ships with an empty `<select>` (Reqs 9.15, 9.16)
    - The Year_Range_Slider thumb owns a vertical indicator line (`.history-slider-thumb-line`) and a single floating label (`.history-slider-thumb-label`) attached to the thumb; the Time_Marker_Slider thumb carries the `.history-slider-thumb--line` modifier class and renders as a thin vertical line with no floating label
    - Add `data-page="history"` to `<body>`, keep the existing `.site-header` and `.site-footer` markup intact, and ensure the `<head>` / `<body>` reference both stylesheets and both scripts in the order documented in task 2.1
    - Remove the older `role="tablist"` markup; both controls are sliders now
    - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.2, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.9, 9.11, 9.15, 9.16_

  - [x] 2.4 Author the dedicated `assets/css/history.css` for the sliders, the fixed timeline, the spacer, and the two-phase animator (mobile-first, IE11-safe)
    - Author the file mobile-first per Req 9.14: base styles (outside any `@media` block) target viewports up to 599 px wide; `@media (min-width: 600px)` adds tablet enhancements; `@media (min-width: 960px)` adds desktop enhancements
    - Style the timeline with `position: fixed; top: 76px; left: 0; right: 0; z-index: 50;` (the `76px` is hardcoded; add a comment noting it MUST equal `--header-height` declared in shared `assets/css/style.css`) instead of `position: sticky` so IE11 keeps the bar anchored (Reqs 2.1, 9.11)
    - Style the `.history-timeline-spacer` element so it participates in normal flow only; no positioning rules required (its `height` is set in JS on mount and on `window.resize`)
    - Style the page-wide Year_Range_Slider track (full container width) and the Time_Marker_Slider track (about 70 % of the container width, centered, narrower height)
    - Render the era thumb as a circular handle with a vertical indicator line and an attached floating label; render the marker thumb via `.history-slider-thumb--line` as a thin vertical line (small or zero `border-radius`, `height > width` so the aspect ratio reads as a line)
    - Provide visible `:focus-visible` styles on both slider thumbs consistent with `.nav-link`; ensure each slider exposes exactly one focusable element (the thumb)
    - Style the `.history-era-dropdown` `<label>` and `<select>`: on mobile (base styles) the dropdown sits inline with the slider's floating thumb label so it stays reachable without horizontal page scroll; at `@media (min-width: 600px)` the dropdown moves out from under the floating label and becomes a separate control to the right of the slider track
    - Set `.history-bg-layer[data-mood="dark"]` to `background: #11243f;`, `[data-mood="positive"]` to `#e8c98a`, `[data-mood="negative"]` to `#7a2b22`, `[data-mood="sacred"]` to `#f6ecc9`, `[data-mood="casual"]` to `#d8c8a4` as **hardcoded hex** values (no `var(--mood-*)` references); the `--mood-*` names live only in a leading comment block (Req 9.10); do **not** declare these custom properties on `:root` in `assets/css/history.css`
    - Replace any older single-wipe layer with the three-layer choreography: `.history-bg-layer--from` always full-height as the visible base; `.history-bg-layer--phase1` with `background: #ffffff`, `opacity: 0` at rest, and `transition: opacity 480ms ease-out` to opacity `1` when `[data-state="active"]` is set; `.history-bg-layer--phase2` with `position: absolute; top: 0; left: 0; bottom: 0; width: 0; overflow: hidden; transition: width 720ms cubic-bezier(0.4, 0, 0.2, 1);` and `[data-state="sweeping"] { width: 100%; }` instead of `clip-path` (Req 9.12)
    - Do **not** use `clip-path`, `backdrop-filter`, or `isolation: isolate` anywhere in the file; layer stacking is managed using `z-index` only (Req 9.13). Document the stacking order in a leading comment: `.history-bg < --from(1) < --phase1(2) < --phase2(3) < .history-content(10) < .history-timeline(50) < .site-header(90)`
    - Add `@media (prefers-reduced-motion: reduce)` rules that disable the two-phase transitions
    - On viewports narrower than 600 px, both sliders still span the container width so all stops remain reachable without horizontal page scroll (Req 7.5)
    - _Requirements: 2.1, 2.2, 2.7, 3.1, 3.2, 5.1, 5.2, 5.3, 5.5, 5.8, 7.5, 7.6, 9.10, 9.11, 9.12, 9.13, 9.14_

- [x] 3. Implement `HistoryDataLoader` (XHR-based) inside `assets/js/history.js`
  - [x] 3.1 Implement the `loadHistoryJSON(path, onSuccess, onError)` XHR helper and `HistoryDataLoader.load()` inside `assets/js/history.js`
    - Author in ES5: `var` only, function declarations and function expressions (no arrow functions), string concatenation with `+`, no template literals, no async/await, no Promise chains in user code (Reqs 9.6, 9.7)
    - Build the URL as `path + '?v=' + APP_VERSION` so the cache-buster matches the shared `NIPPON.loadJSON` convention; do **not** call `NIPPON.loadJSON` from this file (Req 9.8)
    - Use `XMLHttpRequest`: `var xhr = new XMLHttpRequest(); xhr.open('GET', urlWithVersion, true); xhr.onreadystatechange = function () { ... }; xhr.onerror = function () { ... }; xhr.send();` (Req 9.8)
    - In the readystatechange branch, when `xhr.status` is in `[200, 300)`, parse `xhr.responseText` with `JSON.parse`, run `validateAndNormalize(raw)` on the result, and invoke `onSuccess(normalized)`; on parse or validation throw, invoke `onError(e)`; on non-2xx, invoke `onError(new Error('HTTP ' + xhr.status + ' loading ' + path))`
    - Validate required fields and types; throw on missing structurally required fields so the orchestrator can render the error state
    - Drop events whose `month` is present but not an integer in `[1, 12]` and emit `console.warn` naming the event id; preserve absent `month` as absent (do not synthesize a default)
    - Drop events whose `yearRangeId` does not match any Year_Range with a console warning, and resolve `defaultYearRangeId` (falling back to `yearRanges[0].id` with a warning when the id does not exist)
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.8, 9.6, 9.7, 9.8_

  - [ ]* 3.2 Write property test for the loader's schema acceptance and rejection
    - Test fixtures drive `loadHistoryJSON` (the XHR-based helper exported from `assets/js/history.js`) by stubbing `XMLHttpRequest` to return arbitrary `responseText`, **not** by stubbing `fetch`
    - **Property 1: Loader rejects malformed records and accepts well-formed ones**
    - **Validates: Requirements 1.2, 1.3, 1.4, 6.4**

  - [ ]* 3.3 Write property test for month-field handling
    - Test fixtures drive `loadHistoryJSON` (XHR-based) instead of `fetch`
    - **Property 2: Loader preserves missing month as missing and drops invalid months with a warning**
    - **Validates: Requirements 1.5, 1.6**

  - [ ]* 3.4 Write example test that the loader uses `XMLHttpRequest` and includes the `APP_VERSION` cache-buster
    - Spy on `XMLHttpRequest.prototype.open` (do **not** spy on `fetch`); assert the URL passed to `open` ends with `assets/data/history.json?v=<APP_VERSION>` where `<APP_VERSION>` matches the constant declared at the top of `assets/js/history.js`
    - _Requirements: 1.1, 9.8_

- [x] 4. Implement pure derivation helpers (ES5) inside `assets/js/history.js`
  - [x] 4.1 Add `markersFor`, `eventsAt`, `formatMarkerLabel`, `resolveMood`, and `defaultSelection` helpers in `assets/js/history.js`
    - Author in ES5 syntax: `var` only, function declarations / function expressions, string concatenation with `+` (no template literals), explicit `for (var i = 0; i < n; i++)` loops (no `for...of`), no destructuring, no spread/rest, no default parameters (Reqs 9.6, 9.7)
    - `markersFor(yearRangeId, data)` returns the deduplicated, sorted list of `{ year: integer, month: integer | null }` (year-only sorts before any numeric month within a year)
    - `eventsAt(yearRangeId, year, month, data)` filters events to the matching marker, returning them sorted by ascending `id`; when `month` is `null`, only events with no `month` field match
    - `formatMarkerLabel(year, month, monthNames)` returns `monthNames[month - 1] + ' ' + String(year)` when `month` is an integer in `[1, 12]`, else `String(year)`
    - `resolveMood(events, yearRange)` returns `events[0].mood` when at least one event is rendered, else `yearRange.mood`
    - `defaultSelection(data)` returns the initial selection (active Year_Range and first marker)
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 5.1, 5.7, 9.6, 9.7_

  - [x] 4.2 Add the shared `snapToNearest(positions, p)` helper in `assets/js/history.js`
    - Author in ES5 syntax (var, function declaration, `for` loop)
    - Takes a sorted `positions: number[]` (each in `[0, 1]`) and a release position `p: number` (in `[0, 1]`), returns the index `i` minimizing `|positions[i] - p|` with ties broken toward the lower index
    - Used by both the Year_Range_Slider and the Time_Marker_Slider to settle a drag on the nearest discrete stop on release
    - For evenly spaced stops the result is `Math.round((N - 1) * p)`, but the helper accepts any `positions` array so future non-uniform layouts plug in without changing the call sites
    - _Requirements: 2.6, 3.10, 9.6, 9.7_

  - [x]* 4.3 Write property test for `markersFor`
    - **Property 3: Marker derivation matches a reference implementation**
    - **Validates: Requirements 3.3, 3.4, 3.6**

  - [x]* 4.4 Write property test for `formatMarkerLabel`
    - **Property 4: Time_Marker label formatting**
    - **Validates: Requirements 3.5**

  - [x]* 4.5 Write property test for `resolveMood`
    - **Property 10: Mood resolution**
    - **Validates: Requirements 5.1, 5.7**

  - [ ]* 4.6 Write property test for `snapToNearest`
    - **Property 5: Snap-to-nearest converges to the closest stop**
    - **Validates: Requirements 2.6, 3.10**

- [x] 5. Checkpoint - data layer and pure helpers
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement `HistoryState`
  - [x] 6.1 Add `createHistoryState()` to `assets/js/history.js`
    - Author in ES5 syntax: `var` only, function declarations / function expressions, no arrow functions, no destructuring (Reqs 9.6, 9.7); the previous `main.js` implementation must be ported, not copy-pasted
    - Hold `{ data, status, error, selection: { yearRangeId, year, month }, mood }`
    - Implement `loadStart()`, `loadSuccess(data)`, `loadFailure(message)`, `setYearRange(id)`, `setTimeMarker(year, month)`, and `subscribe(listener)`
    - On `setYearRange`, when the new range has at least one Time_Marker auto-select the first one and recompute mood; otherwise clear `(year, month)` and fall back to the Year_Range mood
    - Treat redundant `setYearRange(currentId)` and `setTimeMarker(currentYear, currentMonth)` calls as no-ops
    - _Requirements: 2.5, 3.6, 3.7, 3.8, 3.9, 4.1, 4.2, 5.7, 9.6, 9.7_

  - [ ]* 6.2 Write unit tests for `HistoryState` transitions
    - Re-import `createHistoryState` from `assets/js/history.js` (the previous test imported it from `assets/js/main.js`, which no longer exposes it)
    - Cover: initial selection equals `defaultYearRangeId` when present and matching, otherwise first Year_Range; redundant transitions are no-ops; `setYearRange` on a range with zero events clears `(year, month)`; mood updates correctly after each transition
    - _Requirements: 2.5, 3.7, 3.8, 3.9_

- [x] 7. Implement `TimelineBar` as two stacked sliders plus the Era_Dropdown
  - [x] 7.1 Implement the `TimelineBar` module inside `assets/js/history.js` (mouse + touch, no Pointer Events)
    - Mount the module from `assets/js/history.js`; author in ES5 (var, function expressions, no arrow functions, string concatenation with `+`, explicit `for` loops)
    - Mount the Year_Range_Slider on top: track spans the full `.container` width with one stop per Year_Range positioned at `i / (N - 1)` (or `0.5` when `N === 1`); a single thumb element carries `role="slider"`, `tabindex="0"`, the vertical indicator line, and the floating label whose text is `"<label>, <from> - <to>"` for the active Year_Range
    - Mount the Time_Marker_Slider beneath it: track is shorter in width than the era track and narrower in height (about 70 % of the container width, centered); thumb carries `.history-slider-thumb--line` and `role="slider"`/`tabindex="0"`; stops come from `markersFor(activeYearRangeId, data)` with labels via `formatMarkerLabel`; the active marker label is rendered inside the marker's nearest stop tick rather than attached to the thumb
    - Render the Era_Dropdown by populating `<select data-history-era-select>` with one `<option value="<id>">{label}</option>` per Year_Range in `data.yearRanges` order; on the `change` event call `state.setYearRange(event.target.value)`; on every state update, set `select.selectedIndex` to the index of the active Year_Range so dragging the slider, pressing arrow keys, and choosing a dropdown option all stay in sync (Reqs 9.15, 9.16)
    - On initial mount and on every `window.resize`, measure `.history-timeline.getBoundingClientRect().height` and write that value (in pixels) onto `.history-timeline-spacer.style.height` so the Content_Panel does not jump under the fixed-positioned bar (Req 9.11)
    - Update each thumb's ARIA on every render: `aria-valuemin="0"`, `aria-valuemax = String(stopsCount - 1)` (or `"0"` when `stopsCount === 0`), `aria-valuenow = String(activeIndex)`, `aria-valuetext = "<label>, <from> - <to>"` for the era slider and `formatMarkerLabel(year, month, monthNames)` for the marker slider
    - Wire click on a track or stop tick to snap to that stop and dispatch `state.setYearRange` / `state.setTimeMarker`
    - Mouse drag on the thumb (Req 9.9 - mouse + touch only, no Pointer Events): on `mousedown` call `event.preventDefault()`, set `dragging = true`, capture `trackLeft` and `trackWidth` from `track.getBoundingClientRect()`, attach `mousemove` and `mouseup` listeners on `document` so the drag continues even if the cursor leaves the thumb; on `mousemove`, clamp `event.clientX - trackLeft` to `[0, trackWidth]` and update the thumb's `transform: translateX(...px)` to follow the cursor (visual-only preview, no state mutation); on `mouseup`, detach the document listeners, compute `p = pointerX / trackWidth`, and dispatch `state.setYearRange(stops[snapToNearest(positions, p)].id)` (or `setTimeMarker` for the marker slider)
    - Touch drag on the thumb (parallel to the mouse drag): on `touchstart` read `event.touches[0].clientX`, capture track geometry, mark `dragging = true`, attach `touchmove`/`touchend` listeners on `document`; do **not** call `event.preventDefault()` here so the browser can still synthesize a click on a tap; on `touchmove` read `event.touches[0].clientX`, update the thumb's `transform`, and call `event.preventDefault()` so the page does not scroll under the drag; on `touchend` / `touchcancel` read `event.changedTouches[0].clientX`, detach the document listeners, and dispatch the snap-to-nearest selection
    - The Pointer Events API (`pointerdown` / `pointermove` / `pointerup`) is intentionally **not** used (Req 9.9)
    - Wire keyboard on each thumb: ArrowLeft -> previous stop clamped at 0 (no wrap), ArrowRight -> next stop clamped at `N - 1` (no wrap), Home -> stop 0, End -> stop `N - 1`; focus and activation move together so after every key press the thumb is the focused element and `aria-valuenow` reflects the new index
    - Ensure each slider has exactly one element with a non-negative `tabindex` (the thumb); track, stops, line, and label are decorative (`aria-hidden="true"`)
    - When the active Year_Range has zero markers, render an empty marker track with no thumb position, set `aria-valuemax = "0"` and `aria-valuetext = ""`, and visually hide the marker thumb
    - Subscribe to `state` so re-renders happen on every transition
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 8.1, 8.2, 8.5, 8.6, 8.7, 8.8, 8.9, 9.6, 9.7, 9.9, 9.11, 9.15, 9.16_

  - [ ]* 7.2 Write property test for Year_Range_Slider render fidelity
    - **Property 6: Year_Range_Slider rendering is faithful to the data**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5**

  - [ ]* 7.3 Write property test for slider ARIA semantics
    - **Property 7: Slider ARIA semantics**
    - **Validates: Requirements 8.1, 8.2, 8.9**

  - [ ]* 7.4 Write property test for the single-active-thumb invariant
    - **Property 8: Single-active-thumb invariant under any interaction sequence**
    - Sequence generator mixes mouse and touch drag releases (random `p` in `[0, 1]` on either slider, dispatched as `mousedown`/`mousemove`/`mouseup` and `touchstart`/`touchmove`/`touchend` event pairs - no `pointerdown`/`pointermove`/`pointerup`), click-on-stop events, Era_Dropdown `change` events, and key presses (ArrowLeft / ArrowRight / Home / End) on either thumb
    - **Validates: Requirements 3.7, 3.8, 3.9**

  - [ ]* 7.5 Write property test for modular slider keyboard navigation
    - **Property 15: Modular keyboard navigation in slider thumbs**
    - Generic over both sliders; clamping (no wrap) and Home/End are part of the reference reducer
    - **Validates: Requirements 8.5, 8.6, 8.7, 8.8**

  - [ ]* 7.6 Write example tests for fixed positioning, slider widths, vertical-line thumb, mobile reachability, and spacer height
    - Assert the timeline's computed `position` is `fixed` (not `sticky`) with `top: 76px`, `left: 0`, and `right: 0` (Reqs 2.1, 9.11)
    - Assert the `.history-timeline-spacer` element exists immediately after `.history-timeline` in document order, has `aria-hidden="true"`, and its `getBoundingClientRect().height` is non-zero and equals the bar's rendered height after mount (and re-equals the new height after a `window.resize`)
    - Assert via `getBoundingClientRect()` that the Time_Marker_Slider track is strictly shorter in width and narrower in height than the Year_Range_Slider track
    - Assert the marker thumb's computed `border-radius` is small or zero and `height > width` so it reads as a line
    - At viewport width 599 px assert both slider tracks still fill the container and all stops remain reachable without horizontal page scroll
    - Assert each slider has exactly one element with a non-negative `tabindex` (the thumb)
    - _Requirements: 2.1, 2.7, 3.1, 3.2, 7.5, 8.9, 9.11_

  - [ ]* 7.7 Write example test for Era_Dropdown sync with the Year_Range_Slider
    - Mount the timeline with a multi-period dataset; assert the `<select data-history-era-select>` is populated with one `<option>` per Year_Range in `data.yearRanges` order and the option labels match each Year_Range's `label`
    - Drive the era thumb with `ArrowRight` and `ArrowLeft` and assert that after each key press `select.selectedIndex` re-syncs to the active Year_Range index
    - Simulate a mouse drag on the era thumb that releases at a fractional `p` and assert `select.selectedIndex` re-syncs to the snapped Year_Range index
    - Dispatch a `change` event on the `<select>` with a chosen option's `value` and assert `state.setYearRange` is called exactly once with that option's `value` (and the slider thumb / floating label / marker stops update in lock-step)
    - _Requirements: 9.15, 9.16_

- [x] 8. Implement `ContentPanel`
  - [x] 8.1 Add `ContentPanel.mount(rootEl, state)` and `ContentPanel.render()` to `assets/js/history.js`
    - Author in ES5 (var, function declarations, no template literals, explicit `for` loops); the previous `main.js` implementation must be ported, not copy-pasted (Reqs 9.6, 9.7)
    - Populate the static head (`eyebrow`, `title`, `intro`) once from `data.page`
    - Re-render the events list on every state change using `eventsAt`, emitting one `<article class="history-event" data-mood="<mood>">` per event with title heading, body paragraph, optional `<img>`, and the `Konten contoh` badge from `page.placeholderBadge` when `event.placeholder === true`
    - Render the loading placeholder when `status === 'loading'`, the empty-state block (`page.emptyStateTitle` + `page.emptyStateBody`) when zero events match, and the `.error-state` block (using `page.loadErrorMessage` or the documented fallback `"Konten sejarah belum dapat dimuat. Pastikan situs dijalankan lewat server lokal."`) when `status === 'error'`
    - Update the `aria-live="polite"` region with `page.selectionAnnouncementTemplate` only when the active `(yearRangeId, year, month)` triple actually changes; substitute `{yearRange}` with the active YearRange's `label`, `{year}` with the active year, and `{month}` with `monthNames[month - 1]`, dropping the leading `, {month}` segment from the template when the marker is year-only
    - _Requirements: 1.7, 1.8, 4.1, 4.2, 4.3, 4.4, 4.5, 6.5, 8.3, 8.4, 9.6, 9.7_

  - [ ]* 8.2 Write property test for `ContentPanel` render against `eventsAt`
    - Re-import the `ContentPanel` module from `assets/js/history.js`
    - **Property 9: Content_Panel render matches the active selection**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 6.5**

  - [ ]* 8.3 Write property test for the live-region announcement
    - Re-import the `ContentPanel` module from `assets/js/history.js`
    - **Property 14: Live-region announcement fires only on real selection changes**
    - **Validates: Requirements 8.3, 8.4**

  - [ ]* 8.4 Write example tests for loading and error states
    - Re-import the `ContentPanel` module from `assets/js/history.js`
    - Assert the loading placeholder renders before the load resolves; assert the error block uses `page.loadErrorMessage` when available and the documented fallback string when the file itself is unreadable
    - _Requirements: 4.5, 1.8_

- [x] 9. Implement the two-phase `BackgroundAnimator`
  - [x] 9.1 Implement the `BackgroundAnimator` module inside `assets/js/history.js` with the IE11-safe `width`-based Phase 2
    - Author in ES5 (var, function declarations / function expressions, no arrow functions, string concatenation with `+`, no template literals, explicit `for` loops); the previous `main.js` implementation must be ported, not copy-pasted (Reqs 9.6, 9.7)
    - Maintain three layers inside `.history-bg`: `--from` (visible base, holds the previously applied mood), `--phase1` (white overlay, fades in during Phase 1), and `--phase2` (holds the new mood color in a layer that is anchored to the left edge of the viewport with `width: 0` at rest and grows to `width: 100%` during Phase 2)
    - Constants: `total = 1200` ms, `phase1 = 480` ms (40 % of total, satisfies the 35-45 % share), `phase2 = 720` ms (60 %); document the [1100, 1300] ms total window so future tuning stays within the property bounds
    - On `paint(mood)` from a different `currentMood` (and not under reduced motion): set `--phase1` to `[data-state="active"]` so the white overlay fades in over `phase1` ms; after `setTimeout(..., phase1)` set `--phase2.dataset.mood = mood` and toggle `[data-state="sweeping"]` so the layer's CSS `width` transitions from `0` to `100%` over `phase2` ms (Req 9.12); on `transitionend` (or after `setTimeout(..., total)`) copy the new mood onto `--from`, reset `--phase1` to opacity `0`, reset `--phase2` to `width: 0` (by removing the `[data-state="sweeping"]` attribute), and update `currentMood`
    - Concurrency: every `paint(mood)` call cancels any in-flight Phase 2 start timer, completion timer, and `transitionend` listener, then re-targets `--phase2.dataset.mood` to the latest mood; if Phase 1 is still running it continues unchanged (the white overlay is mood-agnostic), if Phase 2 has already started its `width` animation continues toward the new mood color; the completion timer is restarted so the final commit happens at the original total deadline (no compounding)
    - When `window.matchMedia` exists and `('(prefers-reduced-motion: reduce)').matches` is `true`, skip both phases and write the new mood directly to `--from` synchronously; also handle `matchMedia` being missing entirely
    - When `currentMood === null` (very first paint), apply the new mood directly to `--from` without running either phase
    - Subscribe to `state` so the animator re-paints when mood changes; resolve the active mood from the orchestrator using `resolveMood(events, yearRange)`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 9.6, 9.7, 9.12_

  - [ ]* 9.2 Write property test for Phase 1 desaturation timing
    - **Property 11: Phase 1 desaturates to white before Phase 2 begins**
    - For any pair `(oldMood, newMood)` with `oldMood !== newMood` and reduced motion off, sample the `--phase2` overlay's CSS `width` (read via `getComputedStyle`) at `t < phase1` and assert it is `"0px"` (no portion of the new mood color is visible); sample the `--phase1` overlay's `opacity` (via `getComputedStyle`) at `t === phase1` and assert it is `> 0.95` (visible color is white / near-white); assert `total ∈ [1100, 1300]` ms and `phase1 / total ∈ [0.35, 0.45]`
    - **Validates: Requirements 5.2, 5.4, 5.5**

  - [ ]* 9.3 Write property test for Phase 2 left-to-right sweep
    - **Property 12: Phase 2 sweeps the new mood color from left to right**
    - For any new mood with reduced motion off, sample the `--phase2` layer's CSS `width` (via `getComputedStyle`) at multiple times in `[phase1, total]` and assert the revealed coverage `parseFloat(width) / viewportWidth` is monotonically non-decreasing from `0` at `t === phase1` to `1` at `t === total`
    - **Validates: Requirements 5.3**

  - [ ]* 9.4 Write property test for animator convergence under rapid mood changes
    - **Property 13: Background_Animator converges to the most recent Mood**
    - For any sequence of `paint(mood)` calls with arbitrary delays (including delays smaller than Medium_Pace), after the last call has had time to settle the visible background equals the last requested mood (verified by reading the `--from` layer's `data-mood` and computed `background-color`), and each completed transition's measured total duration is in `[1100, 1300]` ms
    - **Validates: Requirements 5.4, 5.6**

  - [ ]* 9.5 Write example tests for reduced motion, mood-color mapping, and stacking context
    - With `prefers-reduced-motion: reduce` mocked, assert `paint` writes the mood color synchronously to `--from` and neither `--phase1` nor `--phase2` is activated
    - Assert each `.history-bg-layer[data-mood="..."]` rule resolves to its **hardcoded hex value** (`#11243f`, `#e8c98a`, `#7a2b22`, `#f6ecc9`, `#d8c8a4`) for the five Mood values; assert `assets/css/history.css` does **not** declare `--mood-dark` / `--mood-positive` / `--mood-negative` / `--mood-sacred` / `--mood-casual` on `:root` (Req 9.10)
    - Assert the background sits behind the timeline and content (z-index: `--from < --phase1 < --phase2 < .history-content < .history-timeline`) and that `assets/css/history.css` does **not** declare `isolation: isolate` on any selector (Req 9.13); the existing `.site-header` sticky positioning is unaffected
    - _Requirements: 5.1, 5.8, 7.6, 9.10, 9.13_

- [x] 10. Wire orchestrator and integrate
  - [x] 10.1 Add `initHistoryPage()` inside `assets/js/history.js` and hook it into a `DOMContentLoaded` handler in the same file
    - Author in ES5 (var, function expressions, no arrow functions, no async/await); the function lives in `assets/js/history.js`, **not** in `assets/js/main.js`, and is **not** invoked from `main.js`'s `DOMContentLoaded` handler so the shared file stays untouched (Req 9.5)
    - Inside `assets/js/history.js`, register either `document.addEventListener('DOMContentLoaded', initHistoryPage)` (when `document.readyState === 'loading'`) or call `initHistoryPage()` immediately (otherwise)
    - Guard on `document.body.dataset.page === 'history'`; create state, mount the three modules (TimelineBar, ContentPanel, BackgroundAnimator), call `state.loadStart()`, then call `loadHistoryJSON('assets/data/history.json', onSuccess, onError)` where `onSuccess(data) { state.loadSuccess(data); }` and `onError(err) { state.loadFailure((err && err.message) ? err.message : HISTORY_LOAD_ERROR_FALLBACK); if (typeof console !== 'undefined' && console.error) { console.error(err); } }` (Req 9.8)
    - _Requirements: 1.8, 4.5, 7.3, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 10.2 Write integration smoke test that loads the real `history.json` in jsdom
    - Load both `assets/js/main.js` and `assets/js/history.js` into a fresh jsdom document with `document.body.dataset.page = 'history'` so both files run side-by-side as they do in the browser
    - Assert no `console.error` calls fire during initial load and module mount
    - Assert the default Year_Range is Yamato (the earliest period) and is reflected in the era slider's `aria-valuenow`, the floating label, and the Era_Dropdown's `selectedIndex`
    - Drive the era thumb with ArrowRight a few times and assert the marker slider's stops, the content articles, the live-region announcement, the active mood, and the Era_Dropdown's `selectedIndex` all update (the dropdown re-syncs after slider arrow-key navigation)
    - Drive the marker thumb with Home / End and assert the content re-renders to match
    - Dispatch a `change` event on the Era_Dropdown and assert `state.setYearRange` is triggered exactly once with the chosen `<option>`'s `value`
    - Simulate a mouse drag on the era thumb (`mousedown` -> `mousemove` -> `mouseup` at a fractional position; **not** `pointerdown`/`pointermove`/`pointerup`) and assert the slider settles on the nearest Year_Range stop and dispatches a single `setYearRange` call
    - _Requirements: 2.5, 2.6, 3.1, 3.10, 4.1, 4.2, 6.6, 8.3, 9.5, 9.9, 9.16_

- [x] 11. Final cross-cutting checks
  - [ ]* 11.1 Add a static-lint test that no Indonesian-language string literals exist in history-related code
    - Scan `history.html` and `assets/js/history.js` only (do **not** scan `assets/js/main.js` since the History_Page-only code has been moved out and `main.js` belongs to the shared site shell)
    - Whitelist the documented fallback constant declared once at the top of `assets/js/history.js` (`HISTORY_LOAD_ERROR_FALLBACK = "Konten sejarah belum dapat dimuat. Pastikan situs dijalankan lewat server lokal."`) and English-language identifiers
    - _Requirements: 1.7_

  - [ ]* 11.2 Add an example test for `APP_VERSION` consistency across all four cache-busting references and both source files
    - Assert the four cache-busting query strings in `history.html` (`assets/css/style.css?v=...`, `assets/css/history.css?v=...`, `assets/js/main.js?v=...`, `assets/js/history.js?v=...`) all use the same `APP_VERSION` value
    - Assert that this value equals the `APP_VERSION` constant declared in `assets/js/main.js` and the `APP_VERSION` constant declared at the top of `assets/js/history.js`
    - _Requirements: 7.4, 9.2, 9.3_

  - [x]* 11.3 Add example tests confirming the existing site shell is preserved
    - Assert `.site-header` and `.site-footer` markup still exist in `history.html`; assert `data-page="history"` triggers the existing nav active-state highlight via the existing `initNavigation()` logic in `assets/js/main.js`
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 11.4 Add a static check that the shared files no longer carry History_Page-only code
    - Scan `assets/js/main.js` and assert it contains no `HISTORY_*` constant declarations, no `validateHistory*` / `normalizeHistory*` helpers, no `HistoryDataLoader`, no `markersFor` / `eventsAt` / `formatMarkerLabel` / `resolveMood` / `defaultSelection` / `snapToNearest` helper declarations, no `createHistoryState` factory, no `TimelineBar` / `ContentPanel` / `BackgroundAnimator` modules, and no `initHistoryPage` orchestrator (Req 9.5)
    - Scan `assets/css/style.css` and assert it contains no selector matching `\.history-` and no `--mood-*` custom property declaration on `:root`
    - _Requirements: 9.5_

  - [ ]* 11.5 Add a CSS lint check on `assets/css/history.css` for IE11-incompatible constructs
    - Scan `assets/css/history.css` for any of the banned constructs and fail if found: `clip-path` (Reqs 9.12, 9.13), `backdrop-filter` (Req 9.13), `isolation: isolate` (Req 9.13), `var(--mood-` (Req 9.10 - mood values must be hardcoded hex; the `--mood-*` names are allowed only inside CSS comments), `position: sticky` (Req 9.11)
    - This is the static guard for Reqs 9.10, 9.11, 9.12, and 9.13
    - _Requirements: 9.10, 9.11, 9.12, 9.13_

- [x] 12. Final checkpoint - all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Sub-tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation sub-tasks are never optional.
- Each sub-task references the granular acceptance criteria it covers so traceability is preserved.
- Property test sub-tasks are placed close to the implementation they validate so regressions surface early.
- Property numbering matches the design document (1..15); each annotated property tag is the design's source of truth.
- Checkpoints sit at natural integration boundaries (after the data layer / pure helpers, and at the very end).
- All Indonesian-language copy lives in `assets/data/history.json`; the only allowed string literal in JS is the documented load-error fallback, declared once at the top of `assets/js/history.js`.
- The History_Page implementation lives entirely in `assets/js/history.js` and `assets/css/history.css`; the shared `assets/js/main.js` and `assets/css/style.css` files are byte-identical to their pre-history state apart from the removals applied in task 2.2 (Req 9.5).
- All JavaScript in `assets/js/history.js` is authored in ECMAScript 5 / IE11-compatible syntax (Reqs 9.6, 9.7); `assets/css/history.css` uses only IE11-supported CSS (no `clip-path`, no `backdrop-filter`, no `isolation: isolate`, no `var(--mood-*)`, no `position: sticky`) and is authored mobile-first (Reqs 9.10, 9.11, 9.12, 9.13, 9.14).
- Slider drag uses `mousedown`/`mousemove`/`mouseup` and `touchstart`/`touchmove`/`touchend` events (Req 9.9); the Pointer Events API is **not** used.
- Phase 2 of the Background_Animator transitions the `--phase2` overlay's CSS `width` from `0` to `100%` (Req 9.12), not `clip-path`.
- The Era_Dropdown (`<select data-history-era-select>`) is the project specification's required Dropdown contribution and stays in sync with the Year_Range_Slider on every state update (Reqs 9.15, 9.16).

## Task Dependency Graph

Tasks that write to `assets/js/history.js` (3.1, 4.1, 4.2, 6.1, 7.1, 8.1, 9.1, 10.1) are serialized across separate waves to avoid file-edit conflicts. Test sub-tasks that write only their own file under `tests/history/` are batched alongside the next history.js writer.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.2", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.3", "2.3", "2.4", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "8.4", "9.1"] },
    { "id": 8, "tasks": ["9.2", "9.3", "9.4", "9.5", "10.1"] },
    { "id": 9, "tasks": ["10.2", "11.1", "11.2", "11.3", "11.4", "11.5"] }
  ]
}
```
