(function () {
  "use strict";

  var APP_VERSION = "20260520-9";

  var HISTORY_LOAD_ERROR_FALLBACK =
    "Konten sejarah belum dapat dimuat. Pastikan situs dijalankan lewat server lokal.";

  var HISTORY_DATA_PATH = "assets/data/history.json";

  var HISTORY_VALID_MOODS = ["dark", "positive", "negative", "sacred", "casual"];

  var HISTORY_STORAGE_KEY = "nippon_history_sel";

  function saveSelectionToStorage(yearRangeId, year, month) {
    try {
      var obj = {
        yearRangeId: yearRangeId,
        year: year,
        month: (month === null || typeof month === "undefined") ? null : month
      };
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
    }
  }

  function loadSelectionFromStorage() {
    try {
      var raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.yearRangeId !== "string") return null;
      return {
        yearRangeId: parsed.yearRangeId,
        year: (typeof parsed.year === "number") ? parsed.year : null,
        month: (typeof parsed.month === "number") ? parsed.month : null
      };
    } catch (e) {
      return null;
    }
  }

  var HISTORY_PAGE_STRING_KEYS = [
    "eyebrow", "title", "intro",
    "emptyStateTitle", "emptyStateBody",
    "loadErrorMessage", "loadingMessage",
    "placeholderBadge", "selectionAnnouncementTemplate"
  ];

  function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
  }

  function isInteger(v) {
    return typeof v === "number" && isFinite(v) && Math.floor(v) === v;
  }

  function isHistoryMood(v) {
    return typeof v === "string" && HISTORY_VALID_MOODS.indexOf(v) !== -1;
  }

  function validateHistoryPage(page) {
    if (!isPlainObject(page)) {
      throw new Error("history.json: page is required");
    }
    var i;
    for (i = 0; i < HISTORY_PAGE_STRING_KEYS.length; i++) {
      var key = HISTORY_PAGE_STRING_KEYS[i];
      if (!(key in page)) {
        throw new Error("history.json: page." + key + " is required");
      }
      if (!isNonEmptyString(page[key])) {
        throw new Error("history.json: page." + key + " must be a non-empty string");
      }
    }
    if (!Array.isArray(page.monthNames)) {
      throw new Error("history.json: page.monthNames is required");
    }
    if (page.monthNames.length !== 12) {
      throw new Error("history.json: page.monthNames must be a non-empty string");
    }
    var j;
    for (j = 0; j < 12; j++) {
      if (!isNonEmptyString(page.monthNames[j])) {
        throw new Error("history.json: page.monthNames must be a non-empty string");
      }
    }
  }

  function validateHistoryYearRange(yearRange, index) {
    var prefix = "history.json: yearRanges[" + index + "]";
    if (!isPlainObject(yearRange)) {
      throw new Error(prefix + " must be a plain object");
    }
    if (!isNonEmptyString(yearRange.id)) {
      throw new Error(prefix + ".id must be a non-empty string");
    }
    if (!isNonEmptyString(yearRange.label)) {
      throw new Error(prefix + ".label must be a non-empty string");
    }
    if (!isInteger(yearRange.from)) {
      throw new Error(prefix + ".from must be an integer");
    }
    if (!isInteger(yearRange.to)) {
      throw new Error(prefix + ".to must be an integer");
    }
    if (yearRange.to < yearRange.from) {
      throw new Error(prefix + ".to must be greater than or equal to " + prefix + ".from");
    }
    if (!isHistoryMood(yearRange.mood)) {
      throw new Error(prefix + ".mood must be one of dark, positive, negative, sacred, casual");
    }
  }

  function validateHistoryEventRequired(event, index) {
    var prefix = "history.json: events[" + index + "]";
    if (!isPlainObject(event)) {
      throw new Error(prefix + " must be a plain object");
    }
    if (!isNonEmptyString(event.id)) {
      throw new Error(prefix + ".id must be a non-empty string");
    }
    if (!isNonEmptyString(event.yearRangeId)) {
      throw new Error(prefix + ".yearRangeId must be a non-empty string");
    }
    if (!isInteger(event.year)) {
      throw new Error(prefix + ".year must be an integer");
    }
    if (!isNonEmptyString(event.title)) {
      throw new Error(prefix + ".title must be a non-empty string");
    }
    if (!isNonEmptyString(event.body)) {
      throw new Error(prefix + ".body must be a non-empty string");
    }
    if (!isHistoryMood(event.mood)) {
      throw new Error(prefix + ".mood must be one of dark, positive, negative, sacred, casual");
    }
  }

  function normalizeHistoryEvent(event, yearRangeIds) {
    var hasMonth = Object.prototype.hasOwnProperty.call(event, "month");
    var monthValid = false;
    if (hasMonth) {
      if (!isInteger(event.month) || event.month < 1 || event.month > 12) {
        if (typeof console !== "undefined" && console && typeof console.warn === "function") {
          console.warn(
            "history.json: event " + event.id + " dropped because month is not an integer in [1, 12]"
          );
        }
        return null;
      }
      monthValid = true;
    }

    if (yearRangeIds.indexOf(event.yearRangeId) === -1) {
      if (typeof console !== "undefined" && console && typeof console.warn === "function") {
        console.warn(
          "history.json: event " + event.id + " dropped because yearRangeId " +
            event.yearRangeId + " does not match any yearRange"
        );
      }
      return null;
    }

    var normalized = {
      id: event.id,
      yearRangeId: event.yearRangeId,
      year: event.year,
      title: event.title,
      body: event.body,
      mood: event.mood
    };

    if (monthValid) {
      normalized.month = event.month;
    }

    if (typeof event.image === "string") {
      normalized.image = event.image;
    }

    if (typeof event.alt === "string") {
      normalized.alt = event.alt;
    }

    if (event.placeholder === true) {
      normalized.placeholder = true;
    }

    return normalized;
  }

  function resolveDefaultYearRangeId(rawDefault, yearRanges) {
    var hasRawDefault = typeof rawDefault !== "undefined";
    if (typeof rawDefault === "string") {
      var i;
      for (i = 0; i < yearRanges.length; i++) {
        if (yearRanges[i].id === rawDefault) {
          return rawDefault;
        }
      }
    }
    if (hasRawDefault) {
      if (typeof console !== "undefined" && console && typeof console.warn === "function") {
        console.warn(
          "history.json: defaultYearRangeId " + String(rawDefault) +
            " does not match any yearRange; falling back to yearRanges[0].id"
        );
      }
    }
    return yearRanges[0].id;
  }

  function validateHistoryData(raw) {
    if (!isPlainObject(raw)) {
      throw new Error("history.json: top-level value must be a plain object");
    }

    validateHistoryPage(raw.page);

    if (!Array.isArray(raw.yearRanges) || raw.yearRanges.length === 0) {
      throw new Error("history.json: yearRanges must be a non-empty array");
    }

    var i;
    for (i = 0; i < raw.yearRanges.length; i++) {
      validateHistoryYearRange(raw.yearRanges[i], i);
    }

    var yearRangeIds = [];
    for (i = 0; i < raw.yearRanges.length; i++) {
      yearRangeIds.push(raw.yearRanges[i].id);
    }

    if (!Array.isArray(raw.events)) {
      throw new Error("history.json: events must be an array");
    }

    var normalizedEvents = [];
    for (i = 0; i < raw.events.length; i++) {
      validateHistoryEventRequired(raw.events[i], i);
      var normalized = normalizeHistoryEvent(raw.events[i], yearRangeIds);
      if (normalized !== null) {
        normalizedEvents.push(normalized);
      }
    }

    var defaultYearRangeId = resolveDefaultYearRangeId(raw.defaultYearRangeId, raw.yearRanges);

    return {
      page: raw.page,
      defaultYearRangeId: defaultYearRangeId,
      yearRanges: raw.yearRanges,
      events: normalizedEvents
    };
  }

  function loadHistoryJSON(path, onSuccess, onError) {
    var url = path + "?v=" + encodeURIComponent(APP_VERSION);
    var xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
    } catch (e) {
      onError(e);
      return;
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        var raw;
        try {
          raw = JSON.parse(xhr.responseText);
        } catch (parseErr) {
          onError(parseErr);
          return;
        }
        try {
          var normalized = validateHistoryData(raw);
          onSuccess(normalized);
        } catch (validateErr) {
          onError(validateErr);
        }
      } else {
        onError(new Error("HTTP " + xhr.status + " loading " + path));
      }
    };
    xhr.onerror = function () {
      onError(new Error("Network error loading " + path));
    };
    xhr.send();
  }

  var HistoryDataLoader = {
    load: function (onSuccess, onError) {
      loadHistoryJSON(HISTORY_DATA_PATH, onSuccess, onError);
    }
  };

  function markersFor(yearRangeId, data) {
    var result = [];
    var seen = {};
    var i;
    for (i = 0; i < data.events.length; i++) {
      var ev = data.events[i];
      if (ev.yearRangeId !== yearRangeId) continue;
      var month;
      if (Object.prototype.hasOwnProperty.call(ev, "month")) {
        month = ev.month;
      } else {
        month = null;
      }
      var key = ev.year + ":" + (month === null ? "null" : String(month));
      if (Object.prototype.hasOwnProperty.call(seen, key)) continue;
      seen[key] = true;
      result.push({ year: ev.year, month: month });
    }
    result.sort(function (a, b) {
      if (a.year !== b.year) return a.year - b.year;
      if (a.month === null && b.month === null) return 0;
      if (a.month === null) return -1;
      if (b.month === null) return 1;
      return a.month - b.month;
    });
    return result;
  }

  function eventsAt(yearRangeId, year, month, data) {
    var matches = [];
    var i;
    for (i = 0; i < data.events.length; i++) {
      var ev = data.events[i];
      if (ev.yearRangeId !== yearRangeId) continue;
      if (ev.year !== year) continue;
      var hasMonth = Object.prototype.hasOwnProperty.call(ev, "month");
      if (month === null) {
        if (hasMonth) continue;
      } else {
        if (!hasMonth) continue;
        if (ev.month !== month) continue;
      }
      matches.push(ev);
    }
    matches.sort(function (a, b) {
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    return matches;
  }

  function eventsForYearRange(yearRangeId, data) {
    var matches = [];
    var i;
    for (i = 0; i < data.events.length; i++) {
      var ev = data.events[i];
      if (ev.yearRangeId !== yearRangeId) continue;
      matches.push(ev);
    }
    matches.sort(function (a, b) {
      if (a.year !== b.year) return a.year - b.year;
      var aHas = Object.prototype.hasOwnProperty.call(a, "month");
      var bHas = Object.prototype.hasOwnProperty.call(b, "month");
      if (!aHas && bHas) return -1;
      if (aHas && !bHas) return 1;
      if (aHas && bHas && a.month !== b.month) return a.month - b.month;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    return matches;
  }

  function formatMarkerLabel(year, month, monthNames) {
    if (isInteger(month) && month >= 1 && month <= 12) {
      return monthNames[month - 1] + " " + String(year);
    }
    return String(year);
  }

  function resolveMood(events, yearRange) {
    if (events && events.length > 0) {
      return events[0].mood;
    }
    if (yearRange && typeof yearRange.mood === "string") {
      return yearRange.mood;
    }
    return null;
  }

  function defaultSelection(data) {
    var yearRangeId = data.defaultYearRangeId;
    var markers = markersFor(yearRangeId, data);
    if (markers.length > 0) {
      return {
        yearRangeId: yearRangeId,
        year: markers[0].year,
        month: markers[0].month,
        markerDrilled: false
      };
    }
    return {
      yearRangeId: yearRangeId,
      year: null,
      month: null,
      markerDrilled: false
    };
  }

  function snapToNearest(positions, p) {
    if (!positions || positions.length === 0) return 0;
    var bestIndex = 0;
    var bestDistance = Math.abs(positions[0] - p);
    var i;
    for (i = 1; i < positions.length; i++) {
      var distance = Math.abs(positions[i] - p);
      if (distance < bestDistance) {
        bestIndex = i;
        bestDistance = distance;
      }
    }
    return bestIndex;
  }

  function createHistoryState() {
    var state = {
      data: null,
      status: "idle",
      error: null,
      selection: {
        yearRangeId: null,
        year: null,
        month: null,
        markerDrilled: false
      },
      mood: null
    };
    var listeners = [];

    function getState() {
      return state;
    }

    function notify() {
      var i;
      var snapshot = getState();
      var snapshotListeners = listeners.slice();
      for (i = 0; i < snapshotListeners.length; i++) {
        try {
          snapshotListeners[i](snapshot);
        } catch (e) {
          if (typeof console !== "undefined" && console && typeof console.error === "function") {
            console.error(e);
          }
        }
      }
    }

    function findYearRange(id) {
      if (!state.data || !state.data.yearRanges) return null;
      var i;
      for (i = 0; i < state.data.yearRanges.length; i++) {
        if (state.data.yearRanges[i].id === id) return state.data.yearRanges[i];
      }
      return null;
    }

    function recomputeMood() {
      if (!state.data) {
        state.mood = null;
        return;
      }
      var yr = findYearRange(state.selection.yearRangeId);
      var matchingEvents = [];
      if (state.selection.yearRangeId !== null && state.selection.year !== null) {
        matchingEvents = eventsAt(
          state.selection.yearRangeId,
          state.selection.year,
          state.selection.month,
          state.data
        );
      }
      state.mood = resolveMood(matchingEvents, yr);
    }

    function loadStart() {
      state.status = "loading";
      state.error = null;
      notify();
    }

    function loadSuccess(data) {
      state.data = data;
      state.status = "ready";
      state.error = null;

      var saved = loadSelectionFromStorage();
      var restoredFromStorage = false;
      if (saved && saved.yearRangeId) {
        var savedYrExists = false;
        var si;
        for (si = 0; si < data.yearRanges.length; si++) {
          if (data.yearRanges[si].id === saved.yearRangeId) {
            savedYrExists = true;
            break;
          }
        }
        if (savedYrExists) {
          var savedMarkers = markersFor(saved.yearRangeId, data);
          var savedMarkerIdx = indexOfMarker(savedMarkers, saved.year, saved.month);
          if (savedMarkerIdx !== -1) {
            state.selection = {
              yearRangeId: saved.yearRangeId,
              year: saved.year,
              month: saved.month,
              markerDrilled: false
            };
            restoredFromStorage = true;
          } else if (savedMarkers.length > 0) {
            state.selection = {
              yearRangeId: saved.yearRangeId,
              year: savedMarkers[0].year,
              month: savedMarkers[0].month,
              markerDrilled: false
            };
            restoredFromStorage = true;
          }
        }
      }

      if (!restoredFromStorage) {
        state.selection = defaultSelection(data);
        state.selection.markerDrilled = false;
      }

      recomputeMood();
      notify();
    }

    function loadFailure(message) {
      state.status = "error";
      state.error = typeof message === "string" ? message : String(message);
      notify();
    }

    function setYearRange(id) {
      if (state.selection.yearRangeId === id) return;
      if (!state.data) return;
      var yr = findYearRange(id);
      if (!yr) return;
      state.selection.yearRangeId = id;
      var markers = markersFor(id, state.data);
      if (markers.length > 0) {
        state.selection.year = markers[0].year;
        state.selection.month = markers[0].month;
      } else {
        state.selection.year = null;
        state.selection.month = null;
      }
      state.selection.markerDrilled = false;
      recomputeMood();
      saveSelectionToStorage(
        state.selection.yearRangeId,
        state.selection.year,
        state.selection.month
      );
      notify();
    }

    function setTimeMarker(year, month, opts) {
      if (state.selection.year === year && state.selection.month === month) return;
      state.selection.year = year;
      state.selection.month = month;
      if (opts && opts.userInitiated === true) {
        state.selection.markerDrilled = true;
      }
      recomputeMood();
      saveSelectionToStorage(
        state.selection.yearRangeId,
        state.selection.year,
        state.selection.month
      );
      notify();
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function () {};
      listeners.push(listener);
      return function unsubscribe() {
        var idx = listeners.indexOf(listener);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    }

    return {
      getState: getState,
      loadStart: loadStart,
      loadSuccess: loadSuccess,
      loadFailure: loadFailure,
      setYearRange: setYearRange,
      setTimeMarker: setTimeMarker,
      subscribe: subscribe
    };
  }

  function clamp01(n) {
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function stopPositions(count) {
    if (count <= 0) return [];
    if (count === 1) return [0.5];
    var positions = [];
    var i;
    for (i = 0; i < count; i++) {
      positions.push(i / (count - 1));
    }
    return positions;
  }

  function previewThumb(thumb, p) {
    thumb.style.left = (p * 100) + "%";
    thumb.style.transform = "translate(-50%, -50%)";
  }

  function clampLabelPct(pct, labelEl, trackEl) {
    if (!labelEl || !trackEl) return pct;
    var trackW = trackEl.offsetWidth;
    if (trackW <= 0) return pct;
    var labelW = labelEl.offsetWidth;
    var halfLabelPct = (labelW / 2 / trackW) * 100;
    var min = halfLabelPct;
    var max = 100 - halfLabelPct;
    if (min > max) return 50;
    return Math.min(max, Math.max(min, pct));
  }

  function setThumbCenterPercent(thumb, percent) {
    thumb.style.left = percent + "%";
    thumb.style.transform = "translate(-50%, -50%)";
  }

  function clearChildren(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function normalizeKey(event) {
    var key = event.key;
    if (!key && typeof event.keyCode === "number") {
      if (event.keyCode === 37) key = "ArrowLeft";
      else if (event.keyCode === 39) key = "ArrowRight";
      else if (event.keyCode === 36) key = "Home";
      else if (event.keyCode === 35) key = "End";
      else if (event.keyCode === 38) key = "ArrowUp";
      else if (event.keyCode === 40) key = "ArrowDown";
    }
    if (key === "Left") key = "ArrowLeft";
    if (key === "Right") key = "ArrowRight";
    if (key === "Up") key = "ArrowUp";
    if (key === "Down") key = "ArrowDown";
    return key;
  }

  function attachMouseDrag(thumb, track, onCommit, onPreview) {
    var dragging = false;
    var trackLeft = 0;
    var trackWidth = 0;

    function onMove(event) {
      if (!dragging) return;
      if (trackWidth <= 0) return;
      var clientX = event.clientX;
      var p = clamp01((clientX - trackLeft) / trackWidth);
      previewThumb(thumb, p);
      if (typeof onPreview === "function") onPreview(p);
    }

    function onUp(event) {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      var p;
      if (trackWidth > 0) {
        p = clamp01((event.clientX - trackLeft) / trackWidth);
      } else {
        p = 0;
      }
      onCommit(p);
    }

    thumb.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      var rect = track.getBoundingClientRect();
      trackLeft = rect.left;
      trackWidth = rect.width;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function attachTouchDrag(thumb, track, onCommit, onPreview) {
    var dragging = false;
    var trackLeft = 0;
    var trackWidth = 0;

    function onMove(event) {
      if (!dragging) return;
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (!event.touches || event.touches.length === 0) return;
      if (trackWidth <= 0) return;
      var clientX = event.touches[0].clientX;
      var p = clamp01((clientX - trackLeft) / trackWidth);
      previewThumb(thumb, p);
      if (typeof onPreview === "function") onPreview(p);
    }

    function onEnd(event) {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      var clientX;
      if (event.changedTouches && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX;
      } else {
        clientX = trackLeft;
      }
      var p;
      if (trackWidth > 0) {
        p = clamp01((clientX - trackLeft) / trackWidth);
      } else {
        p = 0;
      }
      onCommit(p);
    }

    thumb.addEventListener("touchstart", function (event) {
      if (!event.touches || event.touches.length === 0) return;
      dragging = true;
      var rect = track.getBoundingClientRect();
      trackLeft = rect.left;
      trackWidth = rect.width;
      try {
        document.addEventListener("touchmove", onMove, { passive: false });
      } catch (e) {
        document.addEventListener("touchmove", onMove);
      }
      document.addEventListener("touchend", onEnd);
      document.addEventListener("touchcancel", onEnd);
    });
  }

  function attachKeyboard(thumb, getActiveIndex, getStopCount, onCommitIndex) {
    thumb.addEventListener("keydown", function (event) {
      var key = normalizeKey(event);
      var N = getStopCount();
      if (N <= 0) return;
      var activeIndex = getActiveIndex();
      if (activeIndex < 0) activeIndex = 0;
      var newIndex = activeIndex;
      if (key === "ArrowLeft" || key === "ArrowDown") {
        newIndex = Math.max(0, activeIndex - 1);
      } else if (key === "ArrowRight" || key === "ArrowUp") {
        newIndex = Math.min(N - 1, activeIndex + 1);
      } else if (key === "Home") {
        newIndex = 0;
      } else if (key === "End") {
        newIndex = N - 1;
      } else {
        return;
      }
      event.preventDefault();
      onCommitIndex(newIndex);
      if (typeof thumb.focus === "function") {
        thumb.focus();
      }
    });
  }

  function indexOfYearRange(yearRanges, id) {
    var i;
    for (i = 0; i < yearRanges.length; i++) {
      if (yearRanges[i].id === id) return i;
    }
    return -1;
  }

  function indexOfMarker(markers, year, month) {
    var normalizedMonth;
    if (month === null || typeof month === "undefined") {
      normalizedMonth = null;
    } else {
      normalizedMonth = month;
    }
    var i;
    for (i = 0; i < markers.length; i++) {
      var m = markers[i];
      if (m.year !== year) continue;
      var mMonth;
      if (m.month === null || typeof m.month === "undefined") {
        mMonth = null;
      } else {
        mMonth = m.month;
      }
      if (mMonth === normalizedMonth) return i;
    }
    return -1;
  }

  var TimelineBar = {
    mount: function (rootEl, state) {
      if (!rootEl) return;

      var eraSliderEl = rootEl.querySelector("[data-history-year-range-slider]");
      var eraTrack = eraSliderEl ? eraSliderEl.querySelector("[data-slider-track]") : null;
      var eraStops = eraSliderEl ? eraSliderEl.querySelector("[data-slider-stops]") : null;
      var eraThumb = eraSliderEl ? eraSliderEl.querySelector("[data-slider-thumb]") : null;
      var eraThumbLabel = eraSliderEl
        ? eraSliderEl.querySelector("[data-slider-thumb-label]")
        : null;
      var eraSelect = rootEl.querySelector("[data-history-era-select]");

      var markerSliderEl = rootEl.querySelector("[data-history-time-marker-slider]");
      var markerTrack = markerSliderEl
        ? markerSliderEl.querySelector("[data-slider-track]")
        : null;
      var markerStops = markerSliderEl
        ? markerSliderEl.querySelector("[data-slider-stops]")
        : null;
      var markerThumb = markerSliderEl
        ? markerSliderEl.querySelector("[data-slider-thumb]")
        : null;
      var markerLabelEl = markerSliderEl
        ? markerSliderEl.querySelector("[data-slider-marker-label]")
        : null;

      var spacer = document.querySelector("[data-history-timeline-spacer]");

      function getYearRanges() {
        var s = state.getState();
        if (!s.data || !s.data.yearRanges) return [];
        return s.data.yearRanges;
      }

      function getMarkers() {
        var s = state.getState();
        if (!s.data) return [];
        var yrId = s.selection.yearRangeId;
        if (!yrId) return [];
        return markersFor(yrId, s.data);
      }

      function getActiveEraIndex() {
        var s = state.getState();
        var yrs = getYearRanges();
        return indexOfYearRange(yrs, s.selection.yearRangeId);
      }

      function getActiveMarkerIndex() {
        var s = state.getState();
        var markers = getMarkers();
        return indexOfMarker(markers, s.selection.year, s.selection.month);
      }

      function commitEraIndex(i) {
        var yrs = getYearRanges();
        if (i < 0 || i >= yrs.length) return;
        state.setYearRange(yrs[i].id);
      }

      function commitMarkerIndex(i) {
        var markers = getMarkers();
        if (i < 0 || i >= markers.length) return;
        state.setTimeMarker(markers[i].year, markers[i].month, { userInitiated: true });
      }

      function previewEraLabel(p) {
        if (!eraThumbLabel || !eraTrack) return;
        var yrs = getYearRanges();
        var positions = stopPositions(yrs.length);
        if (positions.length === 0) return;
        var nearestIdx = snapToNearest(positions, p);
        var yr = yrs[nearestIdx];
        if (yr) {
          eraThumbLabel.textContent = yr.label + ", " + String(yr.from) + " - " + String(yr.to);
        }
        var pct = clampLabelPct(p * 100, eraThumbLabel, eraTrack);
        eraThumbLabel.style.left = pct + "%";
        eraThumbLabel.style.top = "auto";
        eraThumbLabel.style.transform = "translateX(-50%)";
      }

      if (eraThumb && eraTrack) {
        attachMouseDrag(eraThumb, eraTrack, function (p) {
          var positions = stopPositions(getYearRanges().length);
          if (positions.length === 0) return;
          commitEraIndex(snapToNearest(positions, p));
        }, previewEraLabel);
        attachTouchDrag(eraThumb, eraTrack, function (p) {
          var positions = stopPositions(getYearRanges().length);
          if (positions.length === 0) return;
          commitEraIndex(snapToNearest(positions, p));
        }, previewEraLabel);
        attachKeyboard(
          eraThumb,
          function () { return getActiveEraIndex(); },
          function () { return getYearRanges().length; },
          commitEraIndex
        );
      }

      function previewMarkerLabel(p) {
        if (!markerLabelEl || !markerTrack) return;
        var markers = getMarkers();
        var positions = stopPositions(markers.length);
        if (positions.length === 0) return;
        var nearestIdx = snapToNearest(positions, p);
        var marker = markers[nearestIdx];
        var s = state.getState();
        var monthNames = (s.data && s.data.page && s.data.page.monthNames) ? s.data.page.monthNames : [];
        if (marker) {
          markerLabelEl.textContent = formatMarkerLabel(marker.year, marker.month, monthNames);
        }
        markerLabelEl.style.display = "";
        var pct = clampLabelPct(p * 100, markerLabelEl, markerTrack);
        markerLabelEl.style.left = pct + "%";
      }

      if (markerThumb && markerTrack) {
        attachMouseDrag(markerThumb, markerTrack, function (p) {
          var positions = stopPositions(getMarkers().length);
          if (positions.length === 0) return;
          commitMarkerIndex(snapToNearest(positions, p));
        }, previewMarkerLabel);
        attachTouchDrag(markerThumb, markerTrack, function (p) {
          var positions = stopPositions(getMarkers().length);
          if (positions.length === 0) return;
          commitMarkerIndex(snapToNearest(positions, p));
        }, previewMarkerLabel);
        attachKeyboard(
          markerThumb,
          function () { return getActiveMarkerIndex(); },
          function () { return getMarkers().length; },
          commitMarkerIndex
        );
      }

      function trackClickHandler(track, getCount, commitFn) {
        return function (event) {
          var rect = track.getBoundingClientRect();
          if (rect.width <= 0) return;
          var p = clamp01((event.clientX - rect.left) / rect.width);
          var N = getCount();
          var positions = stopPositions(N);
          if (positions.length === 0) return;
          commitFn(snapToNearest(positions, p));
        };
      }

      if (eraTrack) {
        var eraClick = trackClickHandler(
          eraTrack,
          function () { return getYearRanges().length; },
          commitEraIndex
        );
        eraTrack.addEventListener("click", eraClick);
        if (eraStops) eraStops.addEventListener("click", eraClick);
      }

      if (markerTrack) {
        var markerClick = trackClickHandler(
          markerTrack,
          function () { return getMarkers().length; },
          commitMarkerIndex
        );
        markerTrack.addEventListener("click", markerClick);
        if (markerStops) markerStops.addEventListener("click", markerClick);
      }

      if (eraSelect) {
        eraSelect.addEventListener("change", function () {
          state.setYearRange(eraSelect.value);
        });
      }

      var eraPrevBtn = rootEl.querySelector("[data-slider-prev=\"year-range\"]");
      var eraNextBtn = rootEl.querySelector("[data-slider-next=\"year-range\"]");
      if (eraPrevBtn) {
        eraPrevBtn.addEventListener("click", function () {
          var N = getYearRanges().length;
          if (N === 0) return;
          var idx = getActiveEraIndex();
          commitEraIndex(((idx - 1) % N + N) % N);
        });
      }
      if (eraNextBtn) {
        eraNextBtn.addEventListener("click", function () {
          var N = getYearRanges().length;
          if (N === 0) return;
          var idx = getActiveEraIndex();
          commitEraIndex((idx + 1) % N);
        });
      }

      var markerPrevBtn = rootEl.querySelector("[data-slider-prev=\"time-marker\"]");
      var markerNextBtn = rootEl.querySelector("[data-slider-next=\"time-marker\"]");
      if (markerPrevBtn) {
        markerPrevBtn.addEventListener("click", function () {
          var M = getMarkers().length;
          if (M === 0) return;
          var idx = getActiveMarkerIndex();
          commitMarkerIndex(((idx - 1) % M + M) % M);
        });
      }
      if (markerNextBtn) {
        markerNextBtn.addEventListener("click", function () {
          var M = getMarkers().length;
          if (M === 0) return;
          var idx = getActiveMarkerIndex();
          commitMarkerIndex((idx + 1) % M);
        });
      }

      function updateSpacerHeight() {
        if (!spacer) return;
        var rect = rootEl.getBoundingClientRect();
        spacer.style.height = rect.height + "px";
      }

      function updateTimelineTop(timelineEl) {
        if (!timelineEl) return;
        var header = document.querySelector(".site-header");
        if (!header) return;
        var headerRect = header.getBoundingClientRect();
        var headerBottom = Math.max(0, Math.round(headerRect.bottom));
        timelineEl.style.top = (headerBottom + 2) + "px";
      }

      function renderEra(s) {
        if (!eraSliderEl) return;
        var yrs = (s.data && s.data.yearRanges) ? s.data.yearRanges : [];
        var N = yrs.length;
        var positions = stopPositions(N);
        var activeIdx = indexOfYearRange(yrs, s.selection.yearRangeId);
        if (activeIdx < 0) activeIdx = 0;

        if (eraSelect) {
          clearChildren(eraSelect);
          var i;
          for (i = 0; i < N; i++) {
            var opt = document.createElement("option");
            opt.value = yrs[i].id;
            opt.textContent = yrs[i].label;
            eraSelect.appendChild(opt);
          }
          if (N > 0) eraSelect.selectedIndex = activeIdx;
        }

        if (eraStops) {
          clearChildren(eraStops);
          var k;
          for (k = 0; k < N; k++) {
            var span = document.createElement("span");
            span.style.position = "absolute";
            span.style.left = (positions[k] * 100) + "%";
            if (k === activeIdx) {
              span.setAttribute("data-active", "true");
            }
            eraStops.appendChild(span);
          }
        }

        if (eraThumb) {
          if (N === 0) {
            eraThumb.style.display = "none";
            eraThumb.setAttribute("aria-valuemin", "0");
            eraThumb.setAttribute("aria-valuemax", "0");
            eraThumb.setAttribute("aria-valuenow", "0");
            eraThumb.setAttribute("aria-valuetext", "");
            if (eraThumbLabel) eraThumbLabel.textContent = "";
          } else {
            eraThumb.style.display = "";
            var pct = positions[activeIdx] * 100;
            setThumbCenterPercent(eraThumb, pct);
            var yr = yrs[activeIdx];
            var labelText =
              yr.label + ", " + String(yr.from) + " - " + String(yr.to);
            if (eraThumbLabel) {
              eraThumbLabel.textContent = labelText;
              var labelPct = clampLabelPct(pct, eraThumbLabel, eraTrack);
              eraThumbLabel.style.left = labelPct + "%";
              eraThumbLabel.style.top = "auto";
              eraThumbLabel.style.transform = "translateX(-50%)";
            }
            eraThumb.setAttribute("aria-valuemin", "0");
            eraThumb.setAttribute("aria-valuemax", String(N - 1));
            eraThumb.setAttribute("aria-valuenow", String(activeIdx));
            eraThumb.setAttribute("aria-valuetext", labelText);
          }
        }
      }

      function renderMarker(s) {
        if (!markerSliderEl) return;
        var monthNames =
          (s.data && s.data.page && s.data.page.monthNames)
            ? s.data.page.monthNames
            : [];
        var markers = [];
        if (s.data && s.selection.yearRangeId) {
          markers = markersFor(s.selection.yearRangeId, s.data);
        }
        var M = markers.length;
        var positions = stopPositions(M);
        var activeIdx = indexOfMarker(
          markers,
          s.selection.year,
          s.selection.month
        );
        if (activeIdx < 0) activeIdx = 0;

        if (markerStops) {
          clearChildren(markerStops);
          var k;
          for (k = 0; k < M; k++) {
            var span = document.createElement("span");
            span.style.position = "absolute";
            span.style.left = (positions[k] * 100) + "%";
            if (k === activeIdx) {
              span.setAttribute("data-active", "true");
            }
            markerStops.appendChild(span);
          }
        }

        if (markerThumb) {
          if (M === 0) {
            markerThumb.style.display = "none";
            markerThumb.setAttribute("aria-valuemin", "0");
            markerThumb.setAttribute("aria-valuemax", "0");
            markerThumb.setAttribute("aria-valuenow", "0");
            markerThumb.setAttribute("aria-valuetext", "");
            if (markerLabelEl) {
              markerLabelEl.style.display = "none";
            }
          } else {
            markerThumb.style.display = "";
            var pct = positions[activeIdx] * 100;
            setThumbCenterPercent(markerThumb, pct);
            var marker = markers[activeIdx];
            var aText = formatMarkerLabel(
              marker.year,
              marker.month,
              monthNames
            );
            markerThumb.setAttribute("aria-valuemin", "0");
            markerThumb.setAttribute(
              "aria-valuemax",
              String(Math.max(M - 1, 0))
            );
            markerThumb.setAttribute("aria-valuenow", String(activeIdx));
            markerThumb.setAttribute("aria-valuetext", aText);
            if (markerLabelEl) {
              markerLabelEl.style.display = "";
              var labelPct = clampLabelPct(pct, markerLabelEl, markerTrack);
              markerLabelEl.style.left = labelPct + "%";
              markerLabelEl.textContent = aText;
            }
          }
        }
      }

      function render() {
        var s = state.getState();
        renderEra(s);
        renderMarker(s);
      }

      state.subscribe(function () {
        render();
        updateSpacerHeight();
      });
      render();
      updateSpacerHeight();
      updateTimelineTop(rootEl);
      function onWindowResize() {
        updateSpacerHeight();
        updateTimelineTop(rootEl);
      }
      window.addEventListener("resize", onWindowResize);
    }
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function findYearRangeLabelById(yearRanges, id) {
    if (!yearRanges) return "";
    var i;
    for (i = 0; i < yearRanges.length; i++) {
      if (yearRanges[i].id === id) return yearRanges[i].label;
    }
    return "";
  }

  var ContentPanel = {
    mount: function (rootEl, state) {
      if (!rootEl) return;

      var eyebrowEl = rootEl.querySelector("[data-history-eyebrow]");
      var titleEl = rootEl.querySelector("[data-history-title]");
      var introEl = rootEl.querySelector("[data-history-intro]");
      var eventsEl = rootEl.querySelector("[data-history-events]");
      var liveEl = rootEl.querySelector("[data-history-live]");

      var lastSelectionKey = null;

      function renderHead(data) {
        if (!data || !data.page) return;
        if (eyebrowEl) eyebrowEl.textContent = data.page.eyebrow;
        if (titleEl) titleEl.textContent = data.page.title;
        if (introEl) introEl.textContent = data.page.intro;
      }

      function renderLoading(data) {
        if (!eventsEl) return;
        clearChildren(eventsEl);
        var msg = "";
        if (data && data.page && typeof data.page.loadingMessage === "string") {
          msg = data.page.loadingMessage;
        }
        eventsEl.appendChild(el("div", "history-loading", msg));
      }

      function renderError(data) {
        if (!eventsEl) return;
        clearChildren(eventsEl);
        var msg;
        if (data && data.page && typeof data.page.loadErrorMessage === "string") {
          msg = data.page.loadErrorMessage;
        } else {
          msg = HISTORY_LOAD_ERROR_FALLBACK;
        }
        eventsEl.appendChild(el("div", "error-state", msg));
      }

      function renderEmpty(data) {
        var emptyDiv = el("div", "history-empty");
        emptyDiv.appendChild(el("h2", null, data.page.emptyStateTitle));
        emptyDiv.appendChild(el("p", null, data.page.emptyStateBody));
        eventsEl.appendChild(emptyDiv);
      }

      function renderEventArticle(ev, data) {
        var monthNames = data.page.monthNames;

        var article = document.createElement("article");
        article.className = "history-event";
        article.setAttribute("data-mood", ev.mood);

        var head = el("header", "history-event-head");

        var monthVal;
        if (Object.prototype.hasOwnProperty.call(ev, "month")) {
          monthVal = ev.month;
        } else {
          monthVal = null;
        }
        var whenText = formatMarkerLabel(ev.year, monthVal, monthNames);
        head.appendChild(el("span", "history-event-when", whenText));

        var badge = el("span", "history-event-badge", data.page.placeholderBadge);
        if (ev.placeholder !== true) {
          badge.hidden = true;
        }
        head.appendChild(badge);

        head.appendChild(el("h2", "history-event-title", ev.title));
        article.appendChild(head);

        article.appendChild(el("p", "history-event-body", ev.body));

        if (typeof ev.image === "string" && ev.image.length > 0) {
          var fig = el("figure", "history-event-figure");
          var img = document.createElement("img");
          img.setAttribute("alt", typeof ev.alt === "string" ? ev.alt : "");
          img.setAttribute("src", ev.image);
          fig.appendChild(img);
          article.appendChild(fig);
        }

        eventsEl.appendChild(article);
      }

      function renderReady(snapshot) {
        if (!eventsEl) return;
        var data = snapshot.data;
        if (!data || !data.page) return;

        var sel = snapshot.selection;
        var matches = [];
        if (sel && sel.yearRangeId !== null && typeof sel.yearRangeId !== "undefined") {
          if (sel.markerDrilled === true) {
            matches = eventsAt(sel.yearRangeId, sel.year, sel.month, data);
          } else {
            matches = eventsForYearRange(sel.yearRangeId, data);
          }
        }

        clearChildren(eventsEl);

        if (matches.length === 0) {
          renderEmpty(data);
          return;
        }

        var i;
        for (i = 0; i < matches.length; i++) {
          renderEventArticle(matches[i], data);
        }
      }

      function maybeAnnounce(snapshot) {
        if (!liveEl) return;
        var data = snapshot.data;
        if (snapshot.status !== "ready") return;
        if (!data || !data.page) return;

        var sel = snapshot.selection;
        if (!sel) return;
        if (sel.yearRangeId === null || typeof sel.yearRangeId === "undefined") return;
        if (sel.year === null || typeof sel.year === "undefined") return;

        var month;
        if (sel.month === null || typeof sel.month === "undefined") {
          month = null;
        } else {
          month = sel.month;
        }

        var currentKey = String(sel.yearRangeId) + ":" + String(sel.year) + ":" + String(month);
        if (currentKey === lastSelectionKey) return;

        var template = data.page.selectionAnnouncementTemplate;
        var yrLabel = findYearRangeLabelById(data.yearRanges, sel.yearRangeId);
        var monthNames = data.page.monthNames;

        var text = template
          .replace(/\{yearRange\}/g, yrLabel)
          .replace(/\{year\}/g, String(sel.year));
        if (month !== null && typeof month === "number") {
          text = text.replace(/\{month\}/g, monthNames[month - 1]);
        } else {
          text = text.replace(/, \{month\}/g, "").replace(/\{month\}/g, "");
        }

        liveEl.textContent = text;
        lastSelectionKey = currentKey;
      }

      function render(snapshot) {
        if (!snapshot) snapshot = state.getState();

        renderHead(snapshot.data);

        if (snapshot.mood) {
          rootEl.setAttribute("data-mood", snapshot.mood);
        } else {
          rootEl.removeAttribute("data-mood");
        }

        if (snapshot.status === "loading") {
          renderLoading(snapshot.data);
        } else if (snapshot.status === "error") {
          renderError(snapshot.data);
        } else if (snapshot.status === "ready") {
          renderReady(snapshot);
        }

        maybeAnnounce(snapshot);
      }

      state.subscribe(function (snapshot) {
        render(snapshot);
      });
      render(state.getState());
    }
  };

  var TOTAL_DURATION = 1200;
  var PHASE1_DURATION = 480;
  var PHASE2_DURATION = 720;

  var BackgroundAnimator = {
    mount: function (rootEl, state) {
      if (!rootEl) return;

      var fromLayer = rootEl.querySelector(".history-bg-layer--from");
      var phase1Layer = rootEl.querySelector(".history-bg-layer--phase1");
      var phase2Layer = rootEl.querySelector(".history-bg-layer--phase2");

      var currentMood = null;
      var phase1Timer = null;
      var commitTimer = null;

      function prefersReducedMotion() {
        try {
          if (window.matchMedia) {
            var mql = window.matchMedia("(prefers-reduced-motion: reduce)");
            return !!(mql && mql.matches);
          }
        } catch (e) {}
        return false;
      }

      function cancelTimers() {
        if (phase1Timer !== null) {
          clearTimeout(phase1Timer);
          phase1Timer = null;
        }
        if (commitTimer !== null) {
          clearTimeout(commitTimer);
          commitTimer = null;
        }
      }

      function applyDirectly(mood) {
        if (fromLayer) fromLayer.setAttribute("data-mood", mood);
        if (phase1Layer) phase1Layer.removeAttribute("data-state");
        if (phase2Layer) {
          phase2Layer.removeAttribute("data-state");
          phase2Layer.removeAttribute("data-mood");
        }
        currentMood = mood;
      }

      function paint(mood) {
        if (mood === currentMood) return;
        if (HISTORY_VALID_MOODS.indexOf(mood) === -1) return;

        if (currentMood === null || prefersReducedMotion()) {
          cancelTimers();
          applyDirectly(mood);
          return;
        }

        cancelTimers();

        if (phase2Layer) {
          phase2Layer.setAttribute("data-mood", mood);
        }

        if (phase1Layer) {
          phase1Layer.setAttribute("data-state", "active");
        }

        phase1Timer = setTimeout(function () {
          phase1Timer = null;
          if (phase2Layer) {
            phase2Layer.setAttribute("data-state", "sweeping");
          }
        }, PHASE1_DURATION);

        commitTimer = setTimeout(function () {
          commitTimer = null;
          if (fromLayer) fromLayer.setAttribute("data-mood", mood);
          if (phase1Layer) phase1Layer.removeAttribute("data-state");
          if (phase2Layer) {
            phase2Layer.removeAttribute("data-state");
            phase2Layer.removeAttribute("data-mood");
          }
          currentMood = mood;
        }, TOTAL_DURATION);
      }

      BackgroundAnimator.paint = paint;

      state.subscribe(function (snapshot) {
        if (snapshot && snapshot.mood) {
          paint(snapshot.mood);
        }
      });

      var initial = state.getState();
      if (initial && initial.mood) {
        paint(initial.mood);
      }
    },
    paint: function (mood) {
    }
  };

  function initHistoryPage() {
    if (!document.body || document.body.dataset.page !== "history") return;

    var root = document.querySelector("[data-history-root]");
    if (!root) return;

    var state = createHistoryState();

    var timelineEl = root.querySelector("[data-history-timeline]");
    var contentEl = root.querySelector("[data-history-content]");
    var bgEl = root.querySelector("[data-history-bg]");

    if (timelineEl) TimelineBar.mount(timelineEl, state);
    if (contentEl) ContentPanel.mount(contentEl, state);
    if (bgEl) BackgroundAnimator.mount(bgEl, state);

    state.loadStart();
    HistoryDataLoader.load(
      function (data) {
        state.loadSuccess(data);
      },
      function (err) {
        var message;
        if (err && typeof err.message === "string" && err.message.length > 0) {
          message = err.message;
        } else {
          message = HISTORY_LOAD_ERROR_FALLBACK;
        }
        state.loadFailure(message);
        if (typeof console !== "undefined" && console && typeof console.error === "function") {
          console.error(err);
        }
      }
    );
  }

  if (!window.NIPPON_HISTORY) window.NIPPON_HISTORY = {};
  window.NIPPON_HISTORY.APP_VERSION = APP_VERSION;
  window.NIPPON_HISTORY.HISTORY_STORAGE_KEY = HISTORY_STORAGE_KEY;
  window.NIPPON_HISTORY.saveSelectionToStorage = saveSelectionToStorage;
  window.NIPPON_HISTORY.loadSelectionFromStorage = loadSelectionFromStorage;
  window.NIPPON_HISTORY.HISTORY_LOAD_ERROR_FALLBACK = HISTORY_LOAD_ERROR_FALLBACK;
  window.NIPPON_HISTORY.HISTORY_DATA_PATH = HISTORY_DATA_PATH;
  window.NIPPON_HISTORY.loadHistoryJSON = loadHistoryJSON;
  window.NIPPON_HISTORY.HistoryDataLoader = HistoryDataLoader;
  window.NIPPON_HISTORY.validateHistoryData = validateHistoryData;
  window.NIPPON_HISTORY.normalizeHistoryEvent = normalizeHistoryEvent;
  window.NIPPON_HISTORY.markersFor = markersFor;
  window.NIPPON_HISTORY.eventsAt = eventsAt;
  window.NIPPON_HISTORY.eventsForYearRange = eventsForYearRange;
  window.NIPPON_HISTORY.formatMarkerLabel = formatMarkerLabel;
  window.NIPPON_HISTORY.resolveMood = resolveMood;
  window.NIPPON_HISTORY.defaultSelection = defaultSelection;
  window.NIPPON_HISTORY.snapToNearest = snapToNearest;
  window.NIPPON_HISTORY.createHistoryState = createHistoryState;
  window.NIPPON_HISTORY.TimelineBar = TimelineBar;
  window.NIPPON_HISTORY.ContentPanel = ContentPanel;
  window.NIPPON_HISTORY.BackgroundAnimator = BackgroundAnimator;
  window.NIPPON_HISTORY.HISTORY_TOTAL_DURATION = TOTAL_DURATION;
  window.NIPPON_HISTORY.HISTORY_PHASE1_DURATION = PHASE1_DURATION;
  window.NIPPON_HISTORY.HISTORY_PHASE2_DURATION = PHASE2_DURATION;
  window.NIPPON_HISTORY.initHistoryPage = initHistoryPage;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHistoryPage);
  } else {
    initHistoryPage();
  }
}());
