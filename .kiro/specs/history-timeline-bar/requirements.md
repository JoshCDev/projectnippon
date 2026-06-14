# Requirements Document

## Introduction

The History Timeline Bar adds an interactive, content-driven exploration experience to `history.html` (the Japanese History page of Project: NIPPON). A horizontally laid out bar is anchored at the top of the page and exposes two stacked slider controls: an upper, page-wide slider whose discrete stops are the historical Year_Ranges, and a smaller slider beneath it whose discrete stops are the Time_Markers (year/month points that actually contain events) of the currently selected Year_Range. Selecting a Time_Marker renders the corresponding history content below the bar. The page background is repainted with a two-phase animation (desaturation toward white, then a left-to-right sweep of the new color) whose color tone follows the mood of the currently displayed history (dark, positive, negative, sacred, casual).

All page copy and history data are sourced from a new, dedicated JSON file under `assets/data/` (no hardcoded content strings in HTML or JS), consistent with the existing `assets/data/site.json` pattern used elsewhere in the project. The dataset ships with real Japanese history content sourced from `assets/data/Rangkuman Sejarah Jepang Berbasis Timeline.pdf`, covering the major historical periods from Zaman Kuno / Yamato through the contemporary era.

The History_Page feature is delivered as a self-contained module in dedicated external files (`assets/js/history.js`, `assets/css/history.css`) authored in Internet Explorer 11-compatible ECMAScript 5 syntax, so that the rest of the site's shared code (`assets/js/main.js`, `assets/css/style.css`, which maintain the home, quiz, seni, makanan/clothing-culinary, architecture, and art-music pages) can remain untouched and the project specification's cross-browser target (Google Chrome, Mozilla Firefox, Internet Explorer 11, Opera) is met.

## Glossary

- **History_Page**: The page rendered by `history.html`, including the timeline bar, the content panel, and the animated background layer.
- **Timeline_Bar**: A horizontal navigation element anchored to the top of the History_Page, below the existing site header. It hosts the Year_Range_Slider in its upper position and the Time_Marker_Slider directly beneath.
- **Year_Range_Slider**: A horizontal, page-wide slider control whose continuous track represents the chronological span of all Year_Ranges combined. A movable thumb (the slider handle) emits a vertical indicator line and a year label, and snaps to each Year_Range as a discrete stop.
- **Time_Marker_Slider**: A second, shorter and narrower horizontal slider directly beneath the Year_Range_Slider whose discrete stops are the Time_Markers of the currently active Year_Range. Its thumb is rendered as a vertical line (not a circle) to communicate that it represents a discrete point on a continuous range.
- **Year_Range**: A named time span (e.g., "Heian", 794 AD to 1185 AD) defined in the History_Data_File. Each Year_Range has a label, a numeric `from` year, a numeric `to` year, and a list of associated History_Events.
- **Time_Marker**: A discrete stop on the Time_Marker_Slider that represents a unique (year, month) combination for which at least one History_Event exists in the active Year_Range. A Year_Range with events that have no month value still produces a single year-only Time_Marker for that year.
- **History_Event**: A record in the History_Data_File containing an id, a numeric year, an optional 1-12 month, a title, a body text, a mood, and an optional image reference.
- **Mood**: An enum value attached to each History_Event with exactly one of these five values: `dark`, `positive`, `negative`, `sacred`, `casual`. Mood drives the Background_Animator color palette.
- **Content_Panel**: The region directly below the Timeline_Bar that renders the History_Events that match the current selection.
- **Background_Animator**: The DOM/CSS layer that paints a full-viewport color wash over the page background using a two-phase transition (desaturation toward white, then a left-to-right color sweep) whenever the active Mood changes.
- **History_Data_File**: A new JSON file at `assets/data/history.json`, separate from `assets/data/site.json`, containing all History_Page copy (eyebrow, intro, empty-state strings, etc.), the list of Year_Ranges, and the list of History_Events.
- **History_Data_Loader**: The JavaScript module that fetches and validates History_Data_File via the existing `NIPPON.loadJSON` helper.
- **Default_Year_Range**: The Year_Range that is selected automatically when the History_Page first loads. It is the earliest Japanese period in the History_Data_File (Yamato / Zaman Kuno) by default, taken as the first Year_Range in the file order, or an explicit `defaultYearRangeId` if specified in the file.
- **Medium_Pace**: A total animation duration of 1200 ms, plus or minus 100 ms, used by the Background_Animator across both phases of its mood transition.
- **Era_Dropdown**: A native HTML `<select>` element labeled "Periode" rendered next to the Year_Range_Slider. Its options mirror the Year_Range_Slider's discrete stops one-to-one and its selected option stays in sync with the active Year_Range. Provides the project specification's required "Dropdown" feature on the History_Page without using `<input type="range">` semantics.
- **History_Module_Files**: The two dedicated external files that contain the entire implementation of the History_Page feature: `assets/js/history.js` (JavaScript) and `assets/css/history.css` (CSS). All History_Page-specific behavior and styling live in these two files; they are loaded by `history.html` only and are not referenced by any other page.

## Requirements

### Requirement 1: Dedicated history JSON data source

**User Story:** As a content author, I want the history page to read all of its copy and timeline data from a single dedicated JSON file, so that I can update history content without editing HTML or JavaScript.

#### Acceptance Criteria

1. THE History_Data_Loader SHALL load history content from `assets/data/history.json` using an `XMLHttpRequest`-based helper `loadHistoryJSON(path, onSuccess, onError)` defined inside `assets/js/history.js` that applies the same `APP_VERSION` cache-busting query string convention as the shared `NIPPON.loadJSON` helper, so that the History_Module_Files do not depend on `fetch` or `async/await` and the shared `NIPPON.loadJSON` helper in `assets/js/main.js` remains unchanged for use by other pages. Implementation constraints for `loadHistoryJSON` are specified in Requirement 9.
2. THE History_Data_File SHALL contain a `page` object with at least the keys `eyebrow`, `title`, `intro`, `emptyStateTitle`, `emptyStateBody`, and `loadErrorMessage`, each holding a non-empty string used as visible page copy.
3. THE History_Data_File SHALL contain a `yearRanges` array where each element has `id`, `label`, `from`, `to`, and `mood` fields, with `from` and `to` as integers and `to` greater than or equal to `from`.
4. THE History_Data_File SHALL contain an `events` array where each element has `id`, `yearRangeId`, `year`, `title`, `body`, and `mood` fields, and MAY include an optional integer `month` between 1 and 12 inclusive and an optional string `image` path.
5. WHEN an History_Event has no `month` field present in the data, THE History_Data_Loader SHALL treat the event as month-less and SHALL NOT read or infer any month value for the event.
6. IF an History_Event has a `month` field whose value is not an integer between 1 and 12 inclusive, THEN THE History_Data_Loader SHALL reject the event by excluding the event from the loaded data and logging a console warning naming the event id.
7. THE History_Page SHALL render no user-visible Indonesian text strings (titles, labels, button text, empty-state messages, error messages) from inline HTML or inline JavaScript literals; all such strings SHALL come from the History_Data_File.
8. IF the History_Data_File cannot be fetched or parsed, THEN THE History_Page SHALL render the existing `.error-state` style block containing the `loadErrorMessage` from the History_Data_File when available, and a built-in fallback string when the file itself is unreadable.

### Requirement 2: Year_Range_Slider anchored at the top

**User Story:** As a reader, I want a fixed, page-wide slider at the top of the history page whose stops are the historical year ranges, so that I can sweep across eras without losing my place.

#### Acceptance Criteria

1. THE Timeline_Bar SHALL remain visible at the top of the History_Page viewport while the user scrolls the Content_Panel by using a sticky position directly below the existing `.site-header` with a top offset equal to `--header-height`. The implementation MAY use `position: fixed` plus a sibling `.history-timeline-spacer` element instead of `position: sticky` for Internet Explorer 11 compatibility per Requirement 9; the user-visible behavior (the bar staying anchored at the top of the viewport while the user scrolls the Content_Panel) is unchanged.
2. WHEN the History_Page finishes loading the History_Data_File, THE Year_Range_Slider SHALL render a single horizontal track that spans the full width of the History_Page container from its left edge to its right edge, with one discrete snap stop per Year_Range in the order provided by the file.
3. THE Year_Range_Slider SHALL render a movable thumb (slider handle) whose horizontal position along the track maps one-to-one to the index of the currently active Year_Range, where the leftmost stop corresponds to the first Year_Range in the file and the rightmost stop corresponds to the last.
4. THE Year_Range_Slider SHALL render, attached to the thumb, a vertical indicator line that pokes out from the track and a label beside or above the line that displays the active Year_Range's `label` and the formatted span `from`-`to` (for example, "Heian, 794 - 1185").
5. WHEN the History_Page first finishes loading, THE Year_Range_Slider SHALL set its thumb to the Default_Year_Range stop without requiring user interaction.
6. WHEN a user drags the Year_Range_Slider thumb between stops, THE Year_Range_Slider SHALL snap the thumb to the nearest Year_Range stop on release, and THE active Year_Range SHALL be updated to the Year_Range corresponding to that stop.
7. THE Year_Range_Slider SHALL provide a visible focus style on the thumb consistent with the existing `.nav-link` focus pattern when the thumb has keyboard focus.

### Requirement 3: Time_Marker_Slider for the active Year_Range

**User Story:** As a reader, I want a smaller slider beneath the year-range slider whose stops are the specific months that actually have events, so that I can drill into the parts of an era that have content.

#### Acceptance Criteria

1. WHEN a Year_Range becomes active, THE Time_Marker_Slider SHALL render directly beneath the Year_Range_Slider as a horizontal track shorter in width than the Year_Range_Slider track and narrower in height, with the same overall visual style.
2. THE Time_Marker_Slider SHALL render its thumb as a vertical line shape (not a circle) so that the thumb visually communicates a discrete point on a continuous range.
3. THE Time_Marker_Slider SHALL compute its discrete stops as the set of distinct `(year, month)` pairs found in the History_Events whose `yearRangeId` matches the active Year_Range, sorted ascending by year and then by month, with events lacking a `month` value contributing one year-only Time_Marker per `year`.
4. IF a calendar month between 1 and 12 has no History_Event for the active Year_Range, THEN THE Time_Marker_Slider SHALL omit a stop for that month.
5. THE Time_Marker_Slider SHALL label each stop with the localized Indonesian month name and four-digit year (for example, "Maret 1185") when a `month` is present, and with the four-digit year only (for example, "1185") when no `month` is present.
6. WHEN a user activates a different Year_Range, THE Time_Marker_Slider SHALL replace its current stops with the Time_Markers of the newly active Year_Range.
7. WHEN a user activates the already-active Year_Range a second time, THE Time_Marker_Slider SHALL keep its current stops and SHALL leave the active Time_Marker selection unchanged.
8. WHEN the Time_Marker_Slider successfully receives a new set of stops for a Year_Range and at least one Time_Marker exists for that Year_Range, THE Time_Marker_Slider SHALL automatically set its thumb to the first Time_Marker as the active Time_Marker, both functionally (updating the active selection state that drives the Content_Panel and Background_Animator) and visually (positioning the thumb at the leftmost stop and applying the active state).
9. IF the active Year_Range has zero Time_Markers, THEN THE Time_Marker_Slider SHALL render an empty track with no active thumb position and SHALL NOT mark any stop as active.
10. WHEN a user drags the Time_Marker_Slider thumb between stops, THE Time_Marker_Slider SHALL snap the thumb to the nearest Time_Marker stop on release, and THE active Time_Marker SHALL be updated to the Time_Marker corresponding to that stop.

### Requirement 4: Content panel updates with selection

**User Story:** As a reader, I want the page content to update to match the year range and month I selected, so that I always see only the history events that match my current focus.

#### Acceptance Criteria

1. WHEN the active Year_Range changes, THE Content_Panel SHALL re-render to show the History_Events whose `yearRangeId` matches the new active Year_Range and whose `(year, month)` matches the newly active Time_Marker, sorted by ascending `year` then `month`.
2. WHEN the active Time_Marker changes, THE Content_Panel SHALL re-render to show only the History_Events whose `(year, month)` matches the new active Time_Marker, sorted by ascending event id.
3. WHERE at least one History_Event matches the current selection, THE Content_Panel SHALL render each matching History_Event using its `title` as a heading, its `body` as paragraph text, and its `image` as an inline image with `alt` text taken from the event when provided.
4. IF the active Year_Range and Time_Marker combination matches zero History_Events, THEN THE Content_Panel SHALL render the `emptyStateTitle` and `emptyStateBody` strings from the History_Data_File inside a placeholder block and SHALL NOT render any History_Event markup.
5. WHILE the History_Data_File has not finished loading on first paint, THE Content_Panel SHALL display a loading placeholder block whose copy is sourced from a `loadingMessage` field in the History_Data_File or from a built-in fallback when the file is unreadable.

### Requirement 5: Mood-driven two-phase background transition

**User Story:** As a reader, I want the page background to shift its mood with the history I am reading, so that the visual atmosphere reinforces the tone of each event without feeling jarring.

#### Acceptance Criteria

1. THE Background_Animator SHALL accept exactly one of the five Mood values `dark`, `positive`, `negative`, `sacred`, and `casual` and SHALL map each value to a documented background color or gradient defined in `assets/css/style.css`.
2. WHEN the active Mood changes, THE Background_Animator SHALL run Phase 1 first by gradually desaturating the currently displayed Mood background until the full viewport reaches white or near-white, without rendering any portion of the new Mood color during this phase.
3. WHEN Phase 1 has reached white or near-white, THE Background_Animator SHALL run Phase 2 by sweeping the new Mood color across the full viewport from the left edge to the right edge until the new Mood color fully covers the white background. The implementation MAY animate the `width` of the `--phase2` overlay layer from `0` to `100%` with a CSS `width` transition instead of animating `clip-path: inset(...)` for Internet Explorer 11 compatibility per Requirement 9; the user-visible behavior (the new Mood color sweeping from the left edge to the right edge until it fully covers the white background) is unchanged.
4. THE Background_Animator SHALL complete the combined Phase 1 and Phase 2 transition in a total duration within the Medium_Pace range of 1100 ms to 1300 ms.
5. THE Background_Animator SHALL allocate Phase 1 a share between 35 percent and 45 percent of the total transition duration so that Phase 2 occupies the remaining 55 percent to 65 percent and the desaturation-to-sweep handoff reads as a clean two-step transition.
6. WHEN multiple Mood changes occur within the Medium_Pace window, THE Background_Animator SHALL queue or replace the in-progress transition so that the final rendered background matches the most recently requested Mood.
7. THE Background_Animator SHALL determine the active Mood as the Mood of the topmost History_Event currently rendered in the Content_Panel in document order, falling back to the active Year_Range Mood when the Content_Panel renders no History_Events.
8. WHERE the user has set the operating system preference `prefers-reduced-motion: reduce`, THE Background_Animator SHALL apply the new Mood background instantly without running Phase 1 or Phase 2.

### Requirement 6: Real Japanese history content from the source PDF

**User Story:** As a reader, I want the page to ship with real Japanese history content drawn from the project's reference PDF, so that I can explore actual historical events end to end.

#### Acceptance Criteria

1. THE History_Data_File SHALL contain Year_Ranges covering each of the following major Japanese historical periods sourced from `assets/data/Rangkuman Sejarah Jepang Berbasis Timeline.pdf`: Zaman Kuno / Yamato (10,000 SM – 538 M), Periode Asuka (538–710 M), Periode Nara (710–794 M), Periode Heian (794–1185 M), Periode Kamakura (1185–1333 M), Periode Muromachi / Sengoku / Azuchi-Momoyama (1336–1603 M), Periode Edo (1603–1868 M), Era Meiji (1868–1912 M), Era Taisho dan Showa Awal (1912–1945 M), Era Pendudukan Sekutu (1945–1952 M), and Era Kontemporer (1989–sekarang).
2. THE History_Data_File SHALL contain History_Events drawn from the events documented in the source PDF, where each event SHALL carry the year reported in the PDF, the month reported in the PDF when one is given (for example, "Juli 645 M", "Agustus 1543", "Oktober 1600", "Maret 1854", "Januari 1868", "September 1923", "Mei 1989"), a non-empty title, a non-empty body text derived from the PDF's narrative for that event, and a `yearRangeId` that references the Year_Range covering the event's year.
3. THE History_Data_File SHALL assign exactly one Mood value from the enum `dark`, `positive`, `negative`, `sacred`, `casual` to every History_Event, and the chosen Mood SHALL be consistent with the historical tone described in the source PDF's narrative for that event using the following guidance: `dark` for wars, massacres, samurai purges, Mongol invasions, atomic bombings, gempa Kanto, and karoshi crisis; `negative` for economic collapse (Lost Decades, Bubble burst), forced isolation, defeats, and betrayals (Insiden Honnō-ji); `positive` for cultural flourishings (Heian literature, Tale of Genji, kana invention), Meiji modernization triumphs, and post-war recovery; `sacred` for religious introductions and foundations (Buddhism arrival 538, Shōtoku's Constitution, Shingon and Tendai sects, Kamikaze) and shrine and temple events; `casual` for ordinary administrative or structural changes, calendar reforms, and reign starts without dramatic context.
4. THE History_Data_File SHALL retain a `placeholder` boolean field on the History_Event schema whose value defaults to `false` and which authors MAY explicitly set to `true` on individual in-progress entries.
5. WHERE a History_Event has `placeholder` explicitly set to `true`, THE Content_Panel SHALL render a small badge next to the event title using the `placeholderBadge` string from the History_Data_File; otherwise THE Content_Panel SHALL NOT render the badge.
6. THE History_Data_File SHALL set the Default_Year_Range to the earliest Japanese period (Zaman Kuno / Yamato) so that the History_Page opens at that period on first load.

### Requirement 7: Page structure and existing-site integration

**User Story:** As a reader of the rest of the site, I want the history page to keep the same header, footer, navigation, and visual rhythm as the other pages, so that the experience stays cohesive.

#### Acceptance Criteria

1. THE History_Page SHALL retain the existing `.site-header` and `.site-footer` markup currently in `history.html`, including the navigation links and the brand mark.
2. THE History_Page SHALL replace the current `.page-placeholder` section with a new `<main>` layout containing the Timeline_Bar, the Content_Panel, and the Background_Animator layer.
3. THE History_Page SHALL set `data-page="history"` on the `<body>` element so that the existing navigation active-state logic in `assets/js/main.js` continues to highlight the History link.
4. THE History_Page SHALL bump the cache-busting query string on its `style.css` and `main.js` references to a new `APP_VERSION` value when this feature ships, consistent with the existing pattern.
5. WHILE the History_Page is rendered on viewports narrower than 600 px, THE Year_Range_Slider and THE Time_Marker_Slider SHALL each continue to span the full width of the History_Page container so that all discrete stops remain reachable on mobile without horizontal page scrolling.
6. THE Background_Animator layer SHALL sit behind the Timeline_Bar and Content_Panel using a stacking context that does not interfere with the existing `.site-header` sticky positioning or with focus outlines.

### Requirement 8: Accessibility and keyboard interaction

**User Story:** As a reader who navigates with a keyboard or assistive technology, I want both timeline sliders to be operable without a mouse, so that I can explore the page like any other.

#### Acceptance Criteria

1. THE Year_Range_Slider thumb SHALL be exposed as an element with `role="slider"` carrying `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext` attributes, where `aria-valuemin` is `0`, `aria-valuemax` is the index of the last Year_Range, `aria-valuenow` is the index of the active Year_Range, and `aria-valuetext` is the active Year_Range's label and span (for example, "Heian, 794 - 1185").
2. THE Time_Marker_Slider thumb SHALL be exposed as an element with `role="slider"` carrying `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext` attributes, where `aria-valuemin` is `0`, `aria-valuemax` is the index of the last Time_Marker stop for the active Year_Range, `aria-valuenow` is the index of the active Time_Marker, and `aria-valuetext` is the formatted Time_Marker label (for example, "Maret 1185" or "1185").
3. WHEN the active Year_Range or active Time_Marker changes to a value different from the previously active one, THE Content_Panel SHALL emit an `aria-live="polite"` announcement summarizing the new active selection using copy sourced from the History_Data_File `page.selectionAnnouncementTemplate` field.
4. IF the active Year_Range and active Time_Marker have not changed since the last announcement, THEN THE Content_Panel SHALL NOT emit a new `aria-live` announcement.
5. WHEN the user presses ArrowLeft or ArrowRight while the Year_Range_Slider thumb has focus, THE Year_Range_Slider SHALL move the thumb and the active Year_Range to the previous or next discrete stop respectively, without wrapping past the first or last stop.
6. WHEN the user presses ArrowLeft or ArrowRight while the Time_Marker_Slider thumb has focus, THE Time_Marker_Slider SHALL move the thumb and the active Time_Marker to the previous or next discrete stop respectively, without wrapping past the first or last stop.
7. WHEN the user presses Home or End while the Year_Range_Slider thumb has focus, THE Year_Range_Slider SHALL move the thumb and the active Year_Range to the first or last discrete stop respectively.
8. WHEN the user presses Home or End while the Time_Marker_Slider thumb has focus, THE Time_Marker_Slider SHALL move the thumb and the active Time_Marker to the first or last discrete stop respectively.
9. THE Year_Range_Slider thumb and THE Time_Marker_Slider thumb SHALL each be the only focusable element within their respective slider tracks so that Tab navigation visits at most one stop per slider.

### Requirement 9: IE11 compatibility, module isolation, and traditional implementation

**User Story:** As a project maintainer evaluating the History_Page against the school project specification, I want the History_Page feature to be implemented in dedicated, IE11-compatible files that do not touch the JavaScript or CSS that maintain the other pages, so that the four required browsers (Google Chrome, Mozilla Firefox, Internet Explorer 11, Opera) all render the page correctly and the home, quiz, seni, makanan/clothing-culinary, architecture, and art-music pages keep working unchanged.

#### Acceptance Criteria

1. THE History_Module_Files SHALL consist of exactly two dedicated external files: `assets/js/history.js` for History_Page JavaScript and `assets/css/history.css` for History_Page CSS; THE History_Page-specific code SHALL NOT be embedded in `assets/js/main.js` or `assets/css/style.css`.
2. THE History_Page (`history.html`) SHALL load `assets/js/main.js` for shared header and navigation logic and SHALL load `assets/js/history.js` for the timeline feature as two separate external `<script>` tags.
3. THE History_Page (`history.html`) SHALL load `assets/css/style.css` for shared site styling and SHALL load `assets/css/history.css` for History_Page styling as two separate external `<link rel="stylesheet">` tags.
4. THE other pages of the site (`index.html`, `quiz.html`, `clothing-culinary.html`, `architecture.html`, `art-music.html`, and any additional non-History_Page pages) SHALL NOT load `assets/js/history.js` or `assets/css/history.css`.
5. THE shared files `assets/js/main.js` and `assets/css/style.css` SHALL NOT be modified by the History_Page feature, except to remove History_Page-only code that is currently embedded in those shared files.
6. THE History_Module_Files JavaScript SHALL be written in ECMAScript 5 syntax compatible with Internet Explorer 11, including using `var` instead of `let` or `const`, function declarations and function expressions instead of arrow functions, string concatenation with `+` instead of template literals, and explicit `for (var i = 0; i < n; i++)` loops instead of `for...of` loops.
7. THE History_Module_Files JavaScript SHALL NOT use destructuring, spread or rest syntax, default parameters, async/await, ES6 classes, or `Promise` chains in user code.
8. THE History_Data_Loader SHALL load `assets/data/history.json` using `XMLHttpRequest` through a callback-based helper named `loadHistoryJSON(path, onSuccess, onError)` defined inside `assets/js/history.js`, and SHALL NOT use `fetch` or `async/await`.
9. THE History_Module_Files JavaScript SHALL handle Year_Range_Slider and Time_Marker_Slider drag interaction using `mousedown`, `mousemove`, and `mouseup` events together with `touchstart`, `touchmove`, and `touchend` events, and SHALL NOT use the Pointer Events API (`pointerdown`, `pointermove`, `pointerup`).
10. THE History_Module_Files CSS SHALL set the background color of `.history-bg-layer[data-mood="dark"]`, `.history-bg-layer[data-mood="positive"]`, `.history-bg-layer[data-mood="negative"]`, `.history-bg-layer[data-mood="sacred"]`, and `.history-bg-layer[data-mood="casual"]` to hardcoded color values rather than `var(--mood-*)` references, so that Internet Explorer 11 renders the correct Mood color even though Internet Explorer 11 does not implement CSS Custom Properties; the `--mood-*` variable definitions MAY remain at the top of `assets/css/history.css` for documentation only.
11. THE Timeline_Bar SHALL be positioned with `position: fixed`, `top: 76px`, `left: 0`, and `right: 0` together with a sibling `.history-timeline-spacer` element whose height matches the rendered Timeline_Bar height, instead of using `position: sticky`, so that Internet Explorer 11 keeps the Timeline_Bar visible while the user scrolls the History_Page.
12. THE Background_Animator's Phase 2 left-to-right sweep SHALL be implemented by transitioning the CSS `width` of the `--phase2` overlay layer from `0` to `100%` over the documented Phase 2 duration using a CSS `transition: width <duration> <easing>` declaration, instead of animating `clip-path: inset(...)`, so that Internet Explorer 11 renders the sweep correctly.
13. THE History_Module_Files CSS SHALL NOT use `clip-path`, `backdrop-filter`, or `isolation: isolate`; layer stacking SHALL be managed using `z-index` only.
14. THE History_Module_Files CSS SHALL be authored mobile-first: base styles (outside any `@media` block) SHALL target viewports up to 599 px wide, and `@media (min-width: 600px)` and wider breakpoints SHALL progressively enhance the layout for larger viewports.
15. THE History_Page feature SHALL contribute the following items to the project specification's minimum-features list, with each contribution implemented within the History_Module_Files: List (the Content_Panel events list and the Time_Marker_Slider stops list), Image (History_Event images rendered inside the Content_Panel), Text Effect (the eyebrow or page-placeholder-title styling already used in the History_Page head), Dropdown (the Era_Dropdown defined in Acceptance Criterion 16), Transitions (the Year_Range_Slider thumb position transition and both phases of the Background_Animator), Animations (the Phase 1 desaturation and Phase 2 sweep keyframes or transitions), Grid (the Content_Panel events grid layout), Flex (the Timeline_Bar's two stacked slider rows), Buttons (the slider thumbs in the accessibility tree and the Era_Dropdown affordance), Media Queries (the mobile-first breakpoints in `assets/css/history.css`), JS Functions (the helpers, modules, and orchestrator in `assets/js/history.js`), JS Events (the slider keyboard, touch, and mouse event handlers), JS Conditional (the loader, state, and render branches), and JS Looping (every render uses `for` loops).
16. THE History_Page SHALL render an Era_Dropdown as a native `<select>` element labeled "Periode" placed next to the Year_Range_Slider, where each `<option>` corresponds one-to-one to a Year_Range stop in the same order as the Year_Range_Slider; WHEN the user chooses an option from the Era_Dropdown, THE Era_Dropdown SHALL invoke the same `setYearRange(id)` state transition used by the Year_Range_Slider; WHEN the active Year_Range changes through Year_Range_Slider drag, click, or keyboard interaction, THE Era_Dropdown SHALL update its selected option to the option corresponding to the new active Year_Range.
17. THE History_Page feature SHALL NOT introduce a CSS or JavaScript framework dependency; WHERE Bootstrap or Tailwind is used elsewhere on the project, IT SHALL only be referenced via individual components and SHALL NOT be referenced from `assets/js/history.js` or `assets/css/history.css`.
18. THE History_Page feature SHALL NOT introduce a bundler or build step; the History_Module_Files SHALL be served as-is by a static file server.
19. THE History_Module_Files SHALL cite the source of any third-party code or content via a comment placed in the same file as the code or content, including a citation of `assets/data/Rangkuman Sejarah Jepang Berbasis Timeline.pdf` as the source of the Japanese-history narrative content shipped in `assets/data/history.json`.
20. THE History_Page feature SHALL be cross-browser-tested in design at least for Google Chrome, Mozilla Firefox, Internet Explorer 11, and Opera, matching the four browsers named in the project specification.
