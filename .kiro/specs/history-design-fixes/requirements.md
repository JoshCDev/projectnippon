# Requirements Document

## Introduction

This spec captures a focused set of visual and content fixes for the History_Page (`history.html`) shipped by the parent `history-timeline-bar` spec. The shipped page meets every functional requirement of that parent spec, but the rendered result on real viewports diverges from the intended look and from the rest of the Project: NIPPON site:

1. The fixed Timeline_Bar visually overlaps the sticky `.site-header` instead of sitting cleanly below it.
2. The Year_Range_Slider thumb circle does not center on the active stop's tick mark on the track above it; the circle floats slightly off the line on either side.
3. The Time_Marker_Slider stops are rendered as bare ticks with no visible "circle" head on each stop, so the slider reads as a line with nothing on it until the user grabs the (line-shaped) thumb.
4. The Content_Panel renders only one event card at a time even on Year_Ranges with many documented events, so the page looks thin and the rich Japanese-history narrative from the source PDF is hidden.
5. The site-wide `.site-footer` is either visually cut off, hidden behind the fixed background layer, or appears not to render at all when the user scrolls to the bottom of the History_Page.

The constraints from the parent spec carry over verbatim:

- Only the History_Page is allowed to change. The shared `assets/js/main.js` and `assets/css/style.css` files (which maintain the home, quiz, seni, makanan/clothing-culinary, architecture, and art-music pages) are not modified by this fix.
- Any new or extended page content must be sourced from `assets/data/history.json` (and ultimately from `assets/data/Rangkuman Sejarah Jepang Berbasis Timeline.pdf`); inline HTML and inline JavaScript do not gain any new Indonesian-language string literals.
- The implementation stays inside the project's tech envelope (plain HTML, vanilla CSS, vanilla JavaScript, no build step, IE11-compatible) so the project specification's required minimum-features list (List, Image, Form, Text Effect, Dropdown, Transitions, Animations, Grid, Flex, Buttons, Media Queries, JS Functions, JS Events, JS Conditional, JS Looping) and four-browser target are preserved.

This spec deliberately scopes itself to **visual fixes plus content-density fixes plus one targeted requirement change** (Time_Marker_Slider stop appearance). It does not re-open the broader timeline behavior, the data-loader contract, the Background_Animator phases, or the keyboard-accessibility contract documented by the parent spec.

## Glossary

Terms not redefined here keep the meaning given in `.kiro/specs/history-timeline-bar/requirements.md`.

- **Header_Clearance**: The minimum vertical distance, in CSS pixels, between the bottom edge of the rendered `.site-header` and the top edge of the rendered `.history-timeline`. This spec sets the Header_Clearance to a value greater than or equal to 0 px and less than or equal to 8 px so the bar sits visibly below the header without leaving a noticeable gap.
- **Stop_Marker**: A small filled circle rendered at the position of each discrete stop on the Year_Range_Slider track and on the Time_Marker_Slider track. Stop_Markers are visually distinct from the existing tick lines in the parent spec (`.history-slider-stops > span`) and replace them on both sliders.
- **Active_Stop**: The Stop_Marker whose index matches `aria-valuenow` on the slider's thumb. The Active_Stop is rendered with a different fill or outline treatment than non-active Stop_Markers so the user can see at a glance which stop the thumb is currently snapped to.
- **Footer_Visibility**: The site-wide `.site-footer` element renders fully inside the document flow at the bottom of the History_Page, with no portion of its content (including `.footer-top`, `.footer-links`, and `.footer-bottom`) clipped, covered by the fixed background layer, or pushed out of the viewport by absolute / fixed positioning that belongs to the History_Page.
- **Card_List**: The set of History_Event cards rendered inside `.history-content-events` for the current selection. The Card_List replaces the previous one-card-per-marker view with a multi-card list that reflects the historical density of the active Year_Range.
- **Active_Year_Range_Cards**: The full sequence of Card_List items rendered when no Time_Marker is being drilled into; this sequence covers every History_Event whose `yearRangeId` equals the active Year_Range, sorted ascending by `year`, then by `month` (year-only events sort before any numeric month within the same year), then by `id`.
- **Drilled_Time_Marker_Cards**: The subset of Card_List items rendered when the user has explicitly selected a Time_Marker different from the Default_Time_Marker for the active Year_Range; this subset matches the existing parent-spec behavior of showing only events at the selected `(year, month)`.
- **Default_Time_Marker**: The first Time_Marker of the active Year_Range, as defined by Acceptance Criterion 3.8 of the parent spec.
- **Marker_Drill_State**: A boolean flag inside `HistoryState.selection` that records whether the user has interacted with the Time_Marker_Slider since the active Year_Range was last set. The flag starts `false` whenever a new Year_Range becomes active and flips to `true` on the first user-driven Time_Marker change inside that Year_Range.
- **Page_Content_Sourced_From_PDF**: Every History_Event entry shipped in `assets/data/history.json` whose `title` and `body` are derived from the narrative in `assets/data/Rangkuman Sejarah Jepang Berbasis Timeline.pdf`.

## Requirements

### Requirement 1: Timeline_Bar clears the site header

**User Story:** As a reader landing on the History_Page, I want the timeline bar to sit cleanly below the site header instead of slipping behind it, so that I can see and use the bar without the navigation getting in the way.

#### Acceptance Criteria

1. WHILE the History_Page is rendered on a viewport at least 320 px wide and the user has not scrolled, THE Timeline_Bar SHALL render with its top edge below the bottom edge of the rendered `.site-header` such that the Header_Clearance is between 0 px and 8 px inclusive.
2. WHILE the user scrolls the Content_Panel and the `.site-header` remains sticky at the top of the viewport, THE Timeline_Bar SHALL keep the Header_Clearance between 0 px and 8 px inclusive without any portion of `.site-header` covering the Timeline_Bar and without any portion of the Timeline_Bar covering `.site-header`.
3. WHEN the rendered `.site-header` height changes because of a viewport resize that crosses a media-query breakpoint, THE Timeline_Bar SHALL update its top offset so the Header_Clearance still falls between 0 px and 8 px inclusive.
4. THE Timeline_Bar SHALL determine its top offset by reading the rendered height of `.site-header` at runtime (for example, via `document.querySelector('.site-header').getBoundingClientRect().height`) and applying that height (plus an optional fixed padding within the Header_Clearance budget) to the bar's `top` style, so that a future change to `--header-height` in the shared `assets/css/style.css` does not silently break the Header_Clearance.
5. THE Timeline_Bar SHALL NOT change its `position: fixed` strategy or its `z-index: 50` documented by the parent spec; only the `top` value and any related spacer height are adjusted by this requirement.

### Requirement 2: Year_Range_Slider thumb centers on the active stop

**User Story:** As a reader sliding through historical periods, I want the circular thumb of the year-range slider to land squarely on the tick mark of whichever period is active, so that the slider feels precise instead of "almost on the line".

#### Acceptance Criteria

1. WHEN the Year_Range_Slider's active index is `i` out of `N` Year_Ranges, THE Year_Range_Slider thumb SHALL be horizontally centered on the same x-coordinate as the Stop_Marker at index `i` along the track, with no more than 1 px of horizontal offset between the thumb's center and the Stop_Marker's center.
2. THE Year_Range_Slider thumb's centering SHALL hold for every value of `i` in `[0, N - 1]`, including the leftmost stop (`i = 0`) and the rightmost stop (`i = N - 1`), without the thumb extending visibly past the left or right ends of the track.
3. THE Year_Range_Slider thumb's centering SHALL hold across all three documented breakpoints of the parent spec (base styles up to 599 px, `@media (min-width: 600px)`, `@media (min-width: 960px)`).
4. WHEN the Year_Range_Slider thumb is being dragged with the mouse or touch, THE thumb's visual position SHALL follow the pointer's clamped x-coordinate along the track without showing the previously-observed half-thumb-width offset; on release, the thumb SHALL settle exactly on the centered position of the snapped Stop_Marker.
5. THE Year_Range_Slider thumb's vertical-line indicator and floating label, both attached to the thumb, SHALL also stay horizontally centered above the thumb's circle within the same 1 px tolerance.

### Requirement 3: Time_Marker_Slider exposes a circular Stop_Marker on every stop

**User Story:** As a reader looking at the months slider beneath the year-range slider, I want every stop to be visible as a small circle on the track instead of just a tick line, so that I can see at a glance how many time markers an era has and which one is currently active.

#### Acceptance Criteria

1. THE Time_Marker_Slider SHALL render exactly one Stop_Marker per Time_Marker stop along the track, where each Stop_Marker is a small filled circle (not a vertical line) horizontally centered on the stop's x-coordinate.
2. WHEN the Time_Marker_Slider's active index is `i` out of `M` Time_Markers, THE Stop_Marker at index `i` SHALL be rendered as the Active_Stop with a visually distinct treatment (different fill, different border, or larger size) from the non-active Stop_Markers.
3. THE Time_Marker_Slider thumb SHALL retain the documented vertical-line shape from the parent spec (Requirement 3.2), so that the thumb continues to communicate a discrete point on a continuous range while the Stop_Markers communicate the underlying discrete grid; this requirement amends only the appearance of the stops, not the thumb.
4. THE Year_Range_Slider SHALL likewise render a Stop_Marker per Year_Range stop, so the two sliders share the same visual language of "circles on the track + active highlight + thumb".
5. WHEN the Time_Marker_Slider receives a new set of stops because the user activated a different Year_Range, THE Time_Marker_Slider SHALL re-render the full list of Stop_Markers to match the new stop count and SHALL re-apply the Active_Stop treatment to whichever Stop_Marker corresponds to the newly active Time_Marker.
6. IF the active Year_Range has zero Time_Markers, THEN THE Time_Marker_Slider SHALL render zero Stop_Markers and SHALL NOT mark any stop as the Active_Stop, consistent with Acceptance Criterion 3.9 of the parent spec.
7. THE existing keyboard, click, and drag-to-snap interactions documented by the parent spec SHALL continue to work unchanged; the Stop_Markers MAY or MAY NOT also be clickable (clickability of the Stop_Markers themselves is not required by this spec).

### Requirement 4: Content_Panel renders the full set of events for the active Year_Range by default

**User Story:** As a reader exploring an era, I want to see all of the documented events for that era in a single multi-card list when I first land on it, so that I can read the era's narrative in depth before drilling into any specific month.

#### Acceptance Criteria

1. WHEN the active Year_Range changes (either on first page load or via a user-initiated Year_Range_Slider, Era_Dropdown, or keyboard interaction), THE Content_Panel SHALL set Marker_Drill_State to `false` for the new active Year_Range and SHALL render the Active_Year_Range_Cards.
2. WHILE Marker_Drill_State is `false` for the active Year_Range, THE Content_Panel SHALL render the Active_Year_Range_Cards as a Card_List of one History_Event card per matching event, sorted ascending by `year`, then by `month` (year-only events first), then by `id`, and SHALL NOT collapse the list down to a single card.
3. WHEN the user explicitly activates a Time_Marker different from the Default_Time_Marker via a user-initiated Time_Marker_Slider drag, click, keyboard arrow, Home, or End interaction, THE Content_Panel SHALL set Marker_Drill_State to `true` and SHALL render the Drilled_Time_Marker_Cards (the events whose `(year, month)` matches the active Time_Marker), consistent with Acceptance Criteria 4.1 and 4.2 of the parent spec.
4. WHEN the user's Time_Marker selection programmatically returns to the Default_Time_Marker because the active Year_Range was just changed, Marker_Drill_State SHALL be reset to `false` per Acceptance Criterion 4.1 above; the Content_Panel SHALL NOT treat the auto-set Default_Time_Marker as a "drill" action.
5. WHILE the Content_Panel renders the Active_Year_Range_Cards, each card SHALL display the History_Event's localized "month year" or "year" label (formatted by the existing `formatMarkerLabel` helper) above the title so the reader can place the event on the timeline without re-reading the slider.
6. WHILE the Content_Panel renders any Card_List, the cards SHALL lay out using the existing CSS Grid in `.history-content-events`, with one column on viewports up to 599 px wide, two columns at `@media (min-width: 600px)`, and the same two-column layout (or wider) at `@media (min-width: 960px)`, consistent with the parent spec.
7. IF the active Year_Range has zero matching History_Events, THEN THE Content_Panel SHALL fall back to the empty state defined by Acceptance Criterion 4.4 of the parent spec.

### Requirement 5: `assets/data/history.json` ships full PDF-sourced narrative coverage for every Year_Range

**User Story:** As a reader and as a content author, I want each historical era to ship with multiple Page_Content_Sourced_From_PDF entries that reflect the depth of the source PDF, so that the multi-card view from Requirement 4 actually has content to render.

#### Acceptance Criteria

1. THE History_Data_File SHALL contain at least three History_Event entries per Year_Range for every Year_Range listed in Requirement 6.1 of the parent spec, except for Year_Ranges whose source PDF coverage is genuinely shorter than three entries; in that case the History_Data_File SHALL contain at least every dated event called out in the source PDF's narrative for that Year_Range.
2. THE History_Data_File SHALL retain every dated event explicitly named in Acceptance Criterion 6.2 of the parent spec (Juli 645, Maret 794, Agustus 1543, Juni 1582, Oktober 1600, Maret 1854, Januari 1868, September 1923, Agustus 1945, Mei 1989) and SHALL extend each Year_Range with the additional Page_Content_Sourced_From_PDF entries documented in the source PDF's per-era tables (for example, Yamato's Jōmon, Yayoi, mythological Jimmu founding, and Kofun consolidation entries; Heian's 794 capital move, 804/806 Tendai/Shingon, 858 Fujiwara dominance, 895 end of Tiongkok embassies, and 9th-10th century kana revolution entries; Edo's 1603 shogunate, 1614/1615 Osaka sieges, 1635 Sakoku, and 1854 Kanagawa entries; and so on for each period).
3. WHERE a History_Event is added by this spec, its `title` SHALL be a non-empty Indonesian phrase summarizing the event (for example, "Pendirian dinasti kekaisaran legendaris" or "Reformasi Taika dimulai") and its `body` SHALL be a non-empty Indonesian paragraph derived from the source PDF's narrative for that event.
4. WHERE a History_Event is added by this spec, the event SHALL carry a valid `yearRangeId` referencing one of the eleven shipped Year_Ranges, an integer `year` consistent with the source PDF, and an optional integer `month` between 1 and 12 inclusive when the source PDF gives a specific month for that event.
5. WHERE a History_Event is added by this spec, the event SHALL carry exactly one `mood` value from the enum `dark`, `positive`, `negative`, `sacred`, `casual`, chosen consistently with the per-mood guidance documented in Acceptance Criterion 6.3 of the parent spec.
6. THE History_Data_File SHALL continue to satisfy every existing acceptance criterion of the parent spec's Requirement 1 (schema) and Requirement 6 (real Japanese history content); this requirement only extends the entry count, it does not relax any existing validation rule.
7. THE Page_Content_Sourced_From_PDF entries SHALL NOT introduce any user-visible Indonesian string literal into inline HTML or inline JavaScript; all of the new strings live inside `assets/data/history.json`, consistent with Acceptance Criterion 1.7 of the parent spec.

### Requirement 6: Site footer is fully visible at the bottom of the History_Page

**User Story:** As a reader who has scrolled to the bottom of the History_Page, I want to see the same site footer that appears on every other page of Project: NIPPON, so that I get the same closing context, the same secondary navigation, and the same copyright line as the rest of the site.

#### Acceptance Criteria

1. THE History_Page SHALL render the existing `.site-footer` markup currently in `history.html` immediately after the `<main class="history-page">` element, consistent with Acceptance Criterion 7.1 of the parent spec.
2. WHEN the user scrolls to the bottom of the History_Page on any of the four supported browsers and on any viewport at least 320 px wide, THE entire `.site-footer` element (including `.footer-top`, `.footer-links`, and `.footer-bottom`) SHALL be visible inside the viewport without being clipped, hidden behind the History_Page background layers, or covered by the fixed Timeline_Bar.
3. THE History_Page background layers (`.history-bg`, `.history-bg-layer--from`, `.history-bg-layer--phase1`, `.history-bg-layer--phase2`) SHALL NOT extend visually over `.site-footer`; either the background layers are constrained to the height of the History_Page main area, or `.site-footer` carries a stacking context that places it above the background layers.
4. WHEN the user scrolls past the end of the Content_Panel, THE Background_Animator SHALL keep its mood color confined to the area above the footer so that the footer's existing palette (`.site-footer` paper background) renders unchanged.
5. THE History_Page footer SHALL link to at least the same destinations the existing footer links to today (`history.html`, `art-music.html`, `architecture.html`, `quiz.html`) and SHALL retain the dynamic `<span data-current-year>` so the existing `assets/js/main.js` year-injection logic keeps working unchanged.
6. THE History_Page SHALL NOT introduce any new fixed-position element near the bottom of the viewport that would visually overlap `.site-footer`.

### Requirement 7: Module isolation, browser support, and feature contributions are preserved

**User Story:** As the project maintainer, I want every fix in this spec to stay inside the dedicated History_Page module files and inside the History_Data_File, so that the rest of the site remains untouched and the project specification's required minimum-features list and four-browser target are still met.

#### Acceptance Criteria

1. THE fixes SHALL be implemented exclusively in `assets/js/history.js`, `assets/css/history.css`, `assets/data/history.json`, and (where structural markup updates are unavoidable) `history.html`.
2. THE shared files `assets/js/main.js` and `assets/css/style.css` SHALL NOT be modified by this spec.
3. THE other pages of the site (`index.html`, `quiz.html`, `clothing-culinary.html`, `architecture.html`, `art-music.html`) SHALL render byte-identically before and after this spec's changes are applied; no page outside the History_Page is in scope.
4. THE History_Page JavaScript added or changed by this spec SHALL be authored in ECMAScript 5 syntax compatible with Internet Explorer 11, consistent with Acceptance Criteria 9.6 and 9.7 of the parent spec; no `let`, no `const`, no arrow functions, no template literals, no destructuring, no spread/rest, no default parameters, no async/await, no Promise chains, no ES6 classes.
5. THE History_Page CSS added or changed by this spec SHALL not introduce `clip-path`, `backdrop-filter`, `isolation: isolate`, or `var(--mood-*)` references, consistent with Acceptance Criteria 9.10 and 9.13 of the parent spec.
6. THE History_Page CSS added or changed by this spec SHALL stay mobile-first, with base styles targeting viewports up to 599 px wide and `@media (min-width: 600px)` and wider breakpoints layering on top, consistent with Acceptance Criterion 9.14 of the parent spec.
7. THE Timeline_Bar SHALL continue to satisfy the project specification's required minimum-features list contributions documented by Acceptance Criterion 9.15 of the parent spec; in particular, the existing Era_Dropdown, the existing Buttons (slider thumbs), the existing Transitions/Animations on the Background_Animator, and the existing Grid/Flex layouts SHALL remain unchanged.
8. THE four browsers named by the project specification (Google Chrome, Mozilla Firefox, Internet Explorer 11, Opera) SHALL render the History_Page with the fixes applied without regressing any acceptance criterion of the parent spec or of this spec.
