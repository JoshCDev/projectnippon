// tests/history/no-indonesian-literals.test.js
//
// Static lint test for Requirement 1.7:
//   "THE History_Page SHALL render no user-visible Indonesian text strings
//    (titles, labels, button text, empty-state messages, error messages)
//    from inline HTML or inline JavaScript literals; all such strings
//    SHALL come from the History_Data_File."
//
// This test scans the source of `assets/js/main.js` and `history.html` for
// Indonesian-language string literals or text nodes that would slip through
// the data-driven copy pipeline. The single documented exception is
// `HISTORY_LOAD_ERROR_FALLBACK`, used when `history.json` itself cannot be
// read so `data.page.loadErrorMessage` is unavailable.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

const MAIN_JS_PATH = path.join(REPO_ROOT, "assets", "js", "main.js");
const HISTORY_HTML_PATH = path.join(REPO_ROOT, "history.html");

// The single Indonesian string allowed inside JS, declared once at the top of
// the History module in main.js. Mirrored verbatim here so the test fails
// fast if the constant ever drifts.
const HISTORY_LOAD_ERROR_FALLBACK =
  "Konten sejarah belum dapat dimuat. Pastikan situs dijalankan lewat server lokal.";

// Indonesian words that should never appear inside history-module string
// literals (or visible text in the History_Page <main>). The list focuses on
// roots and placeholder copy used by the History page; English-language
// identifiers, mood enum values, CSS class names, ARIA roles, and selectors
// are ASCII and never collide with these words.
const INDONESIAN_WORDS = [
  "sejarah",
  "konten",
  "memuat",
  "dimuat",
  "linimasa",
  "bulan",
  "tahun",
  "halaman",
  "pastikan",
  "dijalankan",
  "situs",
  "lokal",
  "lewat",
  "belum",
  "kuis",
  "panduan",
  "budaya",
  "kebiasaan",
  "jepang",
  "dibuat",
  "januari",
  "februari",
  "maret",
  "april",
  "mei",
  "juni",
  "juli",
  "agustus",
  "september",
  "oktober",
  "november",
  "desember",
  "gagal",
  "contoh",
];

const INDONESIAN_WORD_RE = new RegExp(
  "\\b(?:" + INDONESIAN_WORDS.join("|") + ")\\b",
  "i"
);

/**
 * Return the first Indonesian word found in `text`, or `null`.
 */
function findIndonesianWord(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  const m = text.match(INDONESIAN_WORD_RE);
  return m ? m[0].toLowerCase() : null;
}

/**
 * Tokenize a JavaScript source string and return every string-literal body
 * encountered (single-quoted, double-quoted, or template-literal strings,
 * with template-literal `${...}` interpolations correctly excluded from the
 * outer body and recursively inspected as their own code).
 *
 * Comments (line and block) are ignored. Escape sequences are kept verbatim
 * because we only check for Indonesian word boundaries, which are unaffected
 * by `\n` / `\\` style escapes used in this codebase.
 *
 * The returned objects describe each literal:
 *   { kind: "string" | "template", body: string, line: number }
 * The line number is 1-based and identifies where the literal starts within
 * the input string.
 */
function extractStringLiterals(src) {
  const out = [];
  // Frames stack: each frame is either a code frame or a template frame.
  //   code frame:     { type: "code", braceDepth: number, fromInterp: boolean }
  //   template frame: { type: "template", body: string, startLine: number }
  // The bottom frame is the outer code frame with braceDepth tracking only
  // braces that belong to a `${ ... }` interpolation; non-interpolation `{}`
  // pairs are not tracked and never pop the frame.
  const frames = [{ type: "code", braceDepth: 0, fromInterp: false }];

  let i = 0;
  let line = 1;
  const n = src.length;

  while (i < n) {
    const top = frames[frames.length - 1];

    if (top.type === "code") {
      const ch = src[i];
      const nx = src[i + 1];

      // Line comment
      if (ch === "/" && nx === "/") {
        while (i < n && src[i] !== "\n") i++;
        continue;
      }
      // Block comment
      if (ch === "/" && nx === "*") {
        i += 2;
        while (i < n - 1 && !(src[i] === "*" && src[i + 1] === "/")) {
          if (src[i] === "\n") line++;
          i++;
        }
        i += 2;
        continue;
      }

      // Single- or double-quoted string
      if (ch === '"' || ch === "'") {
        const quote = ch;
        const startLine = line;
        i++;
        let body = "";
        while (i < n && src[i] !== quote) {
          if (src[i] === "\\") {
            // Preserve escaped char raw; \n keeps as \\n in body, which is
            // fine for our word-boundary check.
            body += src[i];
            if (src[i + 1] !== undefined) {
              if (src[i + 1] === "\n") line++;
              body += src[i + 1];
            }
            i += 2;
            continue;
          }
          if (src[i] === "\n") {
            // Real newlines are not legal inside ' or " literals, but if one
            // ever sneaks in we stop accumulating to avoid running away.
            break;
          }
          body += src[i];
          i++;
        }
        i++; // consume closing quote
        out.push({ kind: "string", body, line: startLine });
        continue;
      }

      // Template literal start
      if (ch === "`") {
        const startLine = line;
        i++;
        frames.push({ type: "template", body: "", startLine });
        continue;
      }

      // Newline tracking
      if (ch === "\n") {
        line++;
        i++;
        continue;
      }

      // Brace tracking only matters inside an interpolation code frame.
      if (top.fromInterp) {
        if (ch === "{") {
          top.braceDepth++;
          i++;
          continue;
        }
        if (ch === "}") {
          if (top.braceDepth === 0) {
            // closes the `${ ... }`
            frames.pop();
            i++;
            continue;
          }
          top.braceDepth--;
          i++;
          continue;
        }
      }

      i++;
      continue;
    }

    // Template-literal body
    const ch = src[i];
    if (ch === "`") {
      out.push({
        kind: "template",
        body: top.body,
        line: top.startLine
      });
      frames.pop();
      i++;
      continue;
    }
    if (ch === "\\") {
      top.body += ch;
      if (src[i + 1] !== undefined) {
        if (src[i + 1] === "\n") line++;
        top.body += src[i + 1];
      }
      i += 2;
      continue;
    }
    if (ch === "$" && src[i + 1] === "{") {
      i += 2;
      frames.push({ type: "code", braceDepth: 0, fromInterp: true });
      continue;
    }
    if (ch === "\n") line++;
    top.body += ch;
    i++;
  }

  return out;
}

/**
 * Read main.js and slice out the history-module portion: from the
 * "// History timeline bar module" divider down to (but not including) the
 * `async function initHomePage()` definition that follows the orchestrator.
 * Returns { source, startLine } where startLine is the 1-based line number
 * of the first line of the slice within the original file (used to map
 * literal line numbers back to the original file for diagnostics).
 */
function loadHistoryModuleSource() {
  const full = fs.readFileSync(MAIN_JS_PATH, "utf8");
  const startMarker = "// History timeline bar module";
  const endMarker = "async function initHomePage()";

  const startIdx = full.indexOf(startMarker);
  const endIdx = full.indexOf(endMarker);
  if (startIdx === -1) {
    throw new Error(
      `Could not locate '${startMarker}' marker in main.js; ` +
        "either the comment was renamed or the history module was removed."
    );
  }
  if (endIdx === -1 || endIdx <= startIdx) {
    throw new Error(
      `Could not locate '${endMarker}' marker after the history module in ` +
        "main.js; the test needs an unambiguous slice boundary."
    );
  }

  const source = full.slice(startIdx, endIdx);
  // Compute startLine within the full file.
  const before = full.slice(0, startIdx);
  const startLine = before.split("\n").length;
  return { source, startLine };
}

describe("static lint: no Indonesian string literals in history-module JS", () => {
  it("can locate the history module slice in main.js", () => {
    const { source } = loadHistoryModuleSource();
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain("HistoryDataLoader");
    expect(source).toContain("initHistoryPage");
  });

  it("declares HISTORY_LOAD_ERROR_FALLBACK exactly once with the documented value", () => {
    const { source } = loadHistoryModuleSource();
    const literals = extractStringLiterals(source);
    const matches = literals.filter(
      (l) => l.body === HISTORY_LOAD_ERROR_FALLBACK
    );
    expect(matches.length).toBe(1);
    expect(matches[0].kind).toBe("string");
  });

  it("contains no other Indonesian-language string or template literal", () => {
    const { source, startLine } = loadHistoryModuleSource();
    const literals = extractStringLiterals(source);

    const offenders = [];
    for (const lit of literals) {
      if (lit.body === HISTORY_LOAD_ERROR_FALLBACK) continue;
      const hit = findIndonesianWord(lit.body);
      if (hit) {
        offenders.push({
          word: hit,
          body: lit.body.length > 80 ? lit.body.slice(0, 80) + "..." : lit.body,
          kind: lit.kind,
          line: startLine + lit.line - 1
        });
      }
    }

    if (offenders.length > 0) {
      const detail = offenders
        .map(
          (o) =>
            `  - line ~${o.line} [${o.kind}] matched "${o.word}": ${JSON.stringify(o.body)}`
        )
        .join("\n");
      throw new Error(
        "Found Indonesian-language string literal(s) in history module of main.js. " +
          "All Indonesian copy must come from assets/data/history.json; the only " +
          "exception is HISTORY_LOAD_ERROR_FALLBACK.\n" +
          detail
      );
    }

    expect(offenders).toEqual([]);
  });
});

describe("static lint: no Indonesian text content inside <main> of history.html", () => {
  it("parses history.html and finds the <main> root", () => {
    const html = fs.readFileSync(HISTORY_HTML_PATH, "utf8");
    const dom = new window.DOMParser().parseFromString(html, "text/html");
    const main = dom.querySelector("main");
    expect(main).not.toBeNull();
    expect(main.getAttribute("data-history-root")).not.toBeNull();
  });

  it("contains no Indonesian-language text nodes inside <main>", () => {
    const html = fs.readFileSync(HISTORY_HTML_PATH, "utf8");
    const dom = new window.DOMParser().parseFromString(html, "text/html");
    const main = dom.querySelector("main");
    expect(main).not.toBeNull();

    const offenders = [];
    const walker = dom.createTreeWalker(main, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    while (node) {
      const raw = node.nodeValue ?? "";
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        const hit = findIndonesianWord(trimmed);
        if (hit) {
          offenders.push({
            word: hit,
            text: trimmed.length > 80 ? trimmed.slice(0, 80) + "..." : trimmed
          });
        }
      }
      node = walker.nextNode();
    }

    if (offenders.length > 0) {
      const detail = offenders
        .map((o) => `  - matched "${o.word}": ${JSON.stringify(o.text)}`)
        .join("\n");
      throw new Error(
        "Found Indonesian-language text node(s) inside <main> of history.html. " +
          "User-visible copy on the History page must come from assets/data/history.json.\n" +
          detail
      );
    }

    expect(offenders).toEqual([]);
  });
});
