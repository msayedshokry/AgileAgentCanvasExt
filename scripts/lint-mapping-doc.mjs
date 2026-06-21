#!/usr/bin/env node
/**
 * scripts/lint-mapping-doc.mjs
 *
 * Regression-guard for `docs/superpowers/plans/bmad-to-aac-mapping.md`.
 * Detects the class of internal-consistency failure that triggered the v3/v4
 * ship-blockers — a `str_replace` edit updates ONE cell of a table (or ONE
 * paragraph) but forgets to update a SECOND site that semantically depends on
 * it. Catches the failure at commit-time so it never reaches the reviewer.
 *
 * Rules enforced (default mode is strict — exit 1 on any violation; pass
 * `--soft` to force warn-only so the script can be introduced without
 * breaking CI):
 *
 *   1. `doc-ev-monotonic`     — Doc Evolution count column never decreases
 *                                between rows (forward direction only).
 *   2. `doc-ev-vs-closeout-2N` — Final Doc Evolution count equals the
 *                                leading-claim integer + parenthetical sum
 *                                in Phase 2 close-out rows 2.1 and 2.4.
 *                                (#1+#4 in the v3/v4-ship-blocker root cause.)
 *   3. `milestones-vs-rows`    — "N phase milestones" intro in Doc Evolution
 *                                matches the Doc Evolution row count.
 *   4. `cat-2c-resolved-claim` (WARN) — Cat 2c narrative references the
 *                                "fully resolved" / "no remaining keep-
 *                                as-stable-identifier" terminal state,
 *                                with negation-guard ("Unresolved" /
 *                                "NOT/Never/Cannot be fully resolved"
 *                                etc) excluded to avoid false positives.
 *   5. `cat-3-resolved-claim` (WARN) — Cat 3 heading + body carry a
 *                                "Resolved" / "fully resolved" /
 *                                "0 deferred duplicate dirs" sentinel,
 *                                with the same negation-guard. If the
 *                                v5 Doc Evolution row shipped (filesystem
 *                                cleanup), Cat 3 must say "resolved";
 *                                absence of both signals indicates the
 *                                section is out of sync with the roll-up
 *                                — the symmetric deletion-category
 *                                equivalent of rule 4's rename-category
 *                                check.
 *
 * ⚠️  CROSS-PARAGRAPH INVARIANT (PROMINENT CALLOUT) — rules 4 and 5
 *     are cross-paragraph-leak-safe via NEGATION_RE's `[^.!?\n]{0,40}`
 *     proximity limits (excludes `.`, `!`, `?`, `\n`) AND `\b` boundaries
 *     at every token junction. Future maintainers: prose that has a
 *     positive claim in para 1 + a parenthetical "not fully resolved"
 *     (or "not" + any other negation word) trailing in para 2 of the
 *     SAME cat-2c / cat-3 section is TREATED AS NON-CONTRADICTORY — the
 *     regex cannot span a `\n\n` paragraph break, so the negation guard
 *     stays silent and the positive sentinel wins. Same-paragraph
 *     negation IS still flagged correctly. See NEGATION_RE constant
 *     below for the regex shape and scripts/lint-mapping-doc.smoke.mjs's
 *     `cross-paragraph` fixture for the canonical regression test.
 *     If you intentionally want to surface cross-paragraph contradictions
 *     anyway, tighten NEGATION_RE further — but note that loose tolerance
 *     is the current design intent (historical parenthesization is common
 *     in long-lived docs and should not auto-fail lint).
 *
 * Usage:
 *   node scripts/lint-mapping-doc.mjs                              # default doc
 *   node scripts/lint-mapping-doc.mjs path/to/other-mapping.md      # alt file
 *   node scripts/lint-mapping-doc.mjs --soft                       # warn, do not fail
 */

import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const soft = argv.includes('--soft');
const file = argv.find((a, i) => !a.startsWith('--') && (i === argv.length - 1 || !argv[i + 1]?.startsWith('-')))
  || 'docs/superpowers/plans/bmad-to-aac-mapping.md';

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (err) {
  console.error(`error: cannot read ${file}: ${err.message}`);
  process.exit(2);
}

const lines = text.split(/\r?\n/);

let violations = 0;
let warnings = 0;
const fail = (rule, msg) => { violations++; console.error(`  [${rule}] ${msg}`); };
const warn = (rule, msg) => { warnings++; console.error(`  [${rule}] ${msg}`); };
const report = (rule, msg) => (soft ? warn : fail)(rule, msg);

console.log(`Linting ${file} (${soft ? 'soft' : 'strict'} mode)`);

// ── Helpers ─────────────────────────────────────────────────────────────

// Negation-phrase matcher shared across resolved-claim rules. Catches
// future-prose patterns like "NOT fully resolved" / "is unresolved" / "never
// completely resolved" / "won't be fully resolved" so positive substring
// matches don't false-positive against negation patterns.
//
// ─── DESIGN ────────────────────────────────────────────────────────
//
//   • Every inter-token gap uses `[^.!?\n]{0,40}` (or a `\b` boundary)
//     so the regex CANNOT span a `\n\n` paragraph break OR a sentence
//     terminator (`.`, `!`, `?`). This closes the historical-
//     parenthesetical false-positive class: positive claim in para 1 +
//     parenthetical "not fully resolved" trailing in para 2 — the regex
//     now correctly treats cross-paragraph prose as non-contradictory.
//
//   • Same-paragraph negation IS still detected correctly. The lint's
//     purpose is to surface intra-section contradictions; cross-paragraph
//     prose with historical context is intentionally tolerated.
//
//   • Contraction coverage: `\b\w+n[\u2019']t` catches `isn't`, `wasn't`,
//     `couldn't`, etc.; `\bwon[\u2019']t` catches `won't` (with both
//     straight and curly apostrophes). The uncontracted `will not` form
//     gets its own clause.
//
// Kept as ONE constant so cat-2c-resolved-claim and cat-3-resolved-claim
// stay a matched pair with consistent false-positive handling. If you
// tighten cross-paragraph tolerance further, also update the live-doc
// check + smoke fixtures in scripts/lint-mapping-doc.smoke.mjs.
// Single-line regex literal (NOT multi-line) — V8's regex lexer mis-parses
// multi-line regex literals when the source file uses CRLF line endings,
// interpreting the `\r` inside the literal body as part of the pattern. To
// stay portable across LF/CRLF checked-out files, keep this on ONE line.
const NEGATION_RE = /\bunresolved\b|\bnot\b[^.!?\n]{0,40}(?:yet\b[^.!?\n]{0,40}|ever\b[^.!?\n]{0,40}|going\b[^.!?\n]{0,40}to\b[^.!?\n]{0,40}be\b[^.!?\n]{0,40})?\b(?:fully|completely)\b[^.!?\n]{0,40}\bresolved|\bnever\b[^.!?\n]{0,40}\b(?:fully|completely)\b[^.!?\n]{0,40}\bresolved|\bcannot\b[^.!?\n]{0,40}be\b[^.!?\n]{0,40}\b(?:fully|completely)\b[^.!?\n]{0,40}\bresolved|\bwill\b[^.!?\n]{0,40}not\b[^.!?\n]{0,40}(?:be\b[^.!?\n]{0,40})?\b(?:fully|completely)\b[^.!?\n]{0,40}\bresolved|\b\w+n[\u2019']t\b[^.!?\n]{0,40}\b(?:fully|completely)\b[^.!?\n]{0,40}\bresolved|\bwon[\u2019']t\b[^.!?\n]{0,40}be\b[^.!?\n]{0,40}\b(?:fully|completely)\b[^.!?\n]{0,40}\bresolved/i;

/**
 * Parse the Doc Evolution table and return its data-row count + per-row count values.
 * Returns null if the table can't be located.
 *
 * Table layout (markdown):
 *   ## Doc Evolution                  ← heading
 *   This doc evolves through ...      ← intro paragraph
 *   | Phase             | ... | In-scope swept count |   ← header
 *   |---|---|---|                       ← separator
 *   | Phase 2 v1 | ... | **19** |         ← data row (count in last cell)
 *   | Phase 2 v2 | ... | **21** (...) |
 *   | ...                                ← more data rows
 */
function parseDocEvolution() {
  const headingIdx = lines.findIndex(l => /^##\s+Doc Evolution\b/.test(l));
  if (headingIdx < 0) return null;

  let tableStart = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^\|\s*Phase\b/.test(lines[i])) { tableStart = i; break; }
  }
  if (tableStart < 0) return null;

  const counts = [];
  const countLines = [];
  for (let i = tableStart + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!/^\|/.test(ln)) break;
    // skip markdown separator (`|---|---|`) and column-header rows
    if (/^\|\s*[-:|\s]+\|\s*$/.test(ln)) continue;
    if (/In-scope swept count/.test(ln) && /Commits shipped/.test(ln)) continue;
    // extract last-cell count as `**N**`
    const m = ln.match(/\|\s*\*\*(\d+)\*\*/);
    if (m) {
      counts.push(parseInt(m[1], 10));
      countLines.push(i + 1); // 1-indexed for user-facing reports
    }
  }
  return { counts, countLines };
}

/**
 * Locate the "N phase milestones" phrase in the Doc Evolution intro paragraph.
 * Returns { word, count } or null. Word→count map covers 1..10.
 */
function parseMilestonesIntro() {
  const m = text.match(/(one|two|three|four|five|six|seven|eight|nine|ten)\s+phase milestones?\b/i);
  if (!m) return null;
  const map = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  return { word: m[1], count: map[m[1].toLowerCase()] };
}

/**
 * Parse Phase 2 close-out rows 2.1 and 2.4 — extract their leading claim integer
 * + parenthetical sum.
 *
 *   2.1 cell sample: "residual footprint = 27 in-scope refs swept (19 from initial Phase 2 + 2 catalogue twins in v2 + ...)"
 *   2.4 cell sample: "27 in-scope refs swept (Category 1 table — 19 from initial Phase 2 + 2 catalogue twins in v2 + ...). 166 template-var refs ..."
 *
 * Returns { 21: { leading, sum, line }, 24: { leading, sum, line } } — absolute
 * shape; nulls mean the row was not found.
 *
 * ### Assumed row-label shape
 * The row label is matched by an anchor-to-start + bold `2.X`-marker regex
 * (e.g. `| **2.4** Sweep residual ...` — see the actual regex literal in
 * `parseCloseoutClaims()` below; do not paste the literal slash-bracketed form
 * into this comment block because the trailing `*` + `/` characters look like
 * the comment terminator). If you re-shape the table to drop the bold marker,
 * wrap in parens like `**(2.1)**`, or rename to e.g. `Task 2.X` /
 * `Plan Task 2.X`, update the row-match regex AND the column-count check
 * (`cells.length === EXPECTED_CELL_COUNT`) below — the script will silently
 * select the wrong cell otherwise.
 */
function parseCloseoutClaims() {
  // Schema declares the expected keys so the consumer can rely on shape.
  const out = { 21: null, 24: null };
  const headingIdx = lines.findIndex(l => /^##\s+Phase 2 close-out status\b/.test(l));
  if (headingIdx < 0) return out;

  // Walk into the markdown table that follows the heading.
  let i = headingIdx + 1;
  while (i < lines.length && !/^\|/.test(lines[i])) i++;
  if (!/^\|/.test(lines[i])) return out;

  // Expected column count for a 3-data-column markdown row: 5 cells after split (empty
  // before first `|`, 3 data columns, empty after last `|`). Anything else is a layout
  // drift — warn so future editors know to update this script if the shape changes.
  const EXPECTED_CELL_COUNT = 5;

  // Skip header + separator rows.
  let j = i + 1;
  while (j < lines.length && /^\|/.test(lines[j])) {
    const row = lines[j];
    if (/^\|\s*[-:|\s]+\|\s*$/.test(row)) { j++; continue; }
    const m = row.match(/^\|\s*\*\*2\.(\d+)\*\*/);
    if (!m) { j++; continue; }
    const rowNum = parseInt(m[1], 10);
    // Only rows 2.1 and 2.4 carry the in-scope-swept claim we lint. Other rows
    // (2.2, 2.3, 2.5) are out of scope for this rule.
    if (rowNum !== 1 && rowNum !== 4) { j++; continue; }
    const key = rowNum === 1 ? 21 : 24;
    // Split: `| **2.1** text | premise | actual |` produces
    //   ["", "**2.1** text", "premise", "actual", ""]
    // The third data column (cells[3]) is the semantic "Actual state" cell — pinned by
    // absolute index, not by `length - N`, so a future column insertion/wrap won't silently
    // select the wrong cell. The leading-claim/sum-bearers are ALWAYS column 3.
    const cells = row.split('|').map(c => c.trim());
    if (cells.length !== EXPECTED_CELL_COUNT) {
      warn('closeout-column-drift',
        `line ${j + 1}: expected ${EXPECTED_CELL_COUNT} cells after split (3 data columns + empty bookends) but got ${cells.length} — the script still pulls cells[3] but the table layout has drifted since the last audit; update parseCloseoutClaims + the EXPECTED_CELL_COUNT constant if this is intentional`);
    }
    const actual = cells[3] || '';

    // Leading claim: extract the integer immediately preceding "in-scope refs swept".
    // Also handle the form "residual footprint = N in-scope refs swept".
    const lead = actual.match(/(\d+)\s+in-scope refs swept\b/);
    const leadAlt = actual.match(/residual footprint\s*=\s*(\d+)\s+in-scope refs swept\b/);
    const leading = lead ? parseInt(lead[1], 10) : (leadAlt ? parseInt(leadAlt[1], 10) : null);

    // Sum: extract first parenthetical whose contents include both digits and a `+`.
    // The first paren-after-claim is always the sum-decomposition. Other parens
    // (e.g. "(Cat 2a ...)") follow, and we don't include those.
    let sum = null;
    const parenMatch = actual.match(/\((\d+(?:\s*\+\s*\d+)+[^)]*)\)/);
    if (parenMatch) {
      const terms = [...parenMatch[1].matchAll(/\b(\d+)\b/g)].map(n => parseInt(n[1], 10));
      if (terms.length >= 2) sum = terms.reduce((a, b) => a + b, 0);
    }

    out[key] = { leading, sum, line: j + 1 };
    j++;
  }
  return out;
}

/**
 * Locate the Cat 2c section and check whether it contains the "fully resolved"
 * sentinel phrase. Returns { resolved: boolean, sectionStart, sectionEnd, line: <int> }.
 */
function parseCat2cResolved() {
  const idx = lines.findIndex(l => /^### 2c\.\s+Deployed skill\/workflow IDs/.test(l));
  if (idx < 0) return { resolved: false, reason: 'Cat 2c section not found' };

  // Walk to find the next H3 or end-of-file.
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^###\s+/.test(lines[i]) || /^##\s+/.test(lines[i])) { end = i; break; }
  }
  const section = lines.slice(idx, end).join('\n');

  // Positive sentinel + negation guard. Substring match alone would
  // false-positive against "NOT yet fully resolved" / "is unresolved" / "5
  // keep-as-stable-identifier IDs remaining (investigating)". The negation
  // regex is shared with parseCat3Resolved (NEGATION_RE) so the two rules
  // stay a matched pair with consistent false-positive handling.
  const POSITIVE_RE = /fully resolved|completely resolved|no remaining keep-as-stable-identifier/i;
  const hasResolved = POSITIVE_RE.test(section) && !NEGATION_RE.test(section);
  return { resolved: hasResolved, sectionStart: idx + 1, sectionEnd: end };
}

/**
 * Locate the Cat 3 section and check whether it carries a resolution marker.
 *
 * Cat 3 has TWO ground-truth shapes that count as resolved, mirroring the
 * symmetric inversion of cat-2c-resolved-claim:
 *   1. Heading itself contains "Resolved" (e.g.
 *      `## Category 3 — Resolved (deleted in Phase 2 v5)`)
 *   2. Body contains a body-sentinel: "fully resolved" / "completely
 *      resolved" / "0 deferred duplicate dirs" / "no remaining deferred
 *      directories".
 * Either is acceptable standalone — they're two independent signals the
 * maintainer can use to mark Cat 3 as resolved, and either is sufficient
 * ground-truth evidence that the filesystem cleanup has shipped.
 *
 * Symmetric complement of parseCat2cResolved: that one catches the "Cat 2c
 * empty-but-doc-thinks-not" desync (renames category); this one catches the
 * "Cat 3 has-dirs-but-doc-thinks-resolved" desync (deletion category).
 */
function parseCat3Resolved() {
  const idx = lines.findIndex(l => /^##\s+Category 3\b/i.test(l));
  if (idx < 0) return { resolved: false, reason: 'Cat 3 section not found' };

  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^###\s+/.test(lines[i]) || /^##\s+/.test(lines[i])) { end = i; break; }
  }
  const section = lines.slice(idx, end).join('\n');

  // Heading guard: `Resolved` is required AND `Unresolved` is excluded.
  // Catches the future-maintainer case `## Category 3 — Unresolved (kept as
  // follow-up)` which would otherwise trivially match the bare `Resolved`
  // substring.
  const headingHasResolved = /Resolved/i.test(lines[idx]) && !/Unresolved/i.test(lines[idx]);

  // Body guard: same positive + negation pattern as parseCat2cResolved
  // (POSITIVE_RE defined inline per helper for readability; NEGATION_RE
  // shared so the two rules stay a matched pair). "NOT yet fully resolved",
  // "never completely resolved", explicit "Unresolved" all override the
  // positive.
  const POSITIVE_RE = /fully resolved|completely resolved|0 deferred duplicate dirs|no remaining deferred directories/i;
  const bodyHasResolved = POSITIVE_RE.test(section) && !NEGATION_RE.test(section);

  return { resolved: headingHasResolved || bodyHasResolved, sectionStart: idx + 1, sectionEnd: end };
}

// ── Rules ───────────────────────────────────────────────────────────────

// (1) Doc Evolution monotonic count column.
const docEv = parseDocEvolution();
if (!docEv) {
  report('doc-ev-monotonic', 'Could not find Doc Evolution table');
} else if (docEv.counts.length === 0) {
  report('doc-ev-monotonic', 'Doc Evolution table has 0 data rows');
} else {
  for (let i = 1; i < docEv.counts.length; i++) {
    if (docEv.counts[i] < docEv.counts[i - 1]) {
      report('doc-ev-monotonic',
        `line ${docEv.countLines[i]}: Doc Evolution count decreased from ${docEv.counts[i - 1]} (line ${docEv.countLines[i - 1]}) to ${docEv.counts[i]}`);
    }
  }
}

// Composition: only run rules 2/3/4 if Doc Evolution was parseable with ≥1 row.
if (docEv && docEv.counts.length > 0) {
  const finalCount = docEv.counts[docEv.counts.length - 1];
  const finalCountLine = docEv.countLines[docEv.countLines.length - 1];

  // (3) Doc Evolution intro "N phase milestones" == row count.
  const milestones = parseMilestonesIntro();
  if (milestones === null) {
    report('milestones-vs-rows', 'No "<word> phase milestones" phrase found in Doc Evolution intro');
  } else if (milestones.count !== docEv.counts.length) {
    report('milestones-vs-rows',
      `Doc Evolution intro says "${milestones.word} phase milestones" (=${milestones.count}) but Doc Evolution has ${docEv.counts.length} data rows (final count ${finalCount} on line ${finalCountLine})`);
  }

  // (2) Final Doc Evolution count == close-out 2.1 / 2.4 leading-claim + sum.
  const closeout = parseCloseoutClaims();
  [21, 24].forEach(rowNum => {
    const row = closeout[rowNum];
    if (!row) {
      report('doc-ev-vs-closeout',
        `Phase 2 close-out row 2.${rowNum - 20} not found in the close-out table — cannot reconcile with Doc Evolution final count ${finalCount}`);
      return;
    }
    if (row.leading === null) {
      report('doc-ev-vs-closeout',
        `Phase 2 close-out row 2.${rowNum - 20} (line ${row.line}): no "<N> in-scope refs swept" leading claim found`);
      return;
    }
    if (row.leading !== finalCount) {
      report('doc-ev-vs-closeout',
        `Phase 2 close-out row 2.${rowNum - 20} (line ${row.line}) leading claim is ${row.leading}, expected ${finalCount} (Doc Evolution final count, line ${finalCountLine})`);
    }
    if (row.sum !== null && row.sum !== finalCount) {
      report('doc-ev-vs-closeout',
        `Phase 2 close-out row 2.${rowNum - 20} (line ${row.line}) parenthetical sums to ${row.sum}, expected ${finalCount}`);
    }
  });
}

// (4) Cat 2c "fully resolved" sentinel (WARN only — informational).
const cat2c = parseCat2cResolved();
if (cat2c.reason) {
  warn('cat-2c-resolved-claim', cat2c.reason);
} else if (!cat2c.resolved) {
  warn('cat-2c-resolved-claim',
    `Cat 2c section (lines ${cat2c.sectionStart}–${cat2c.sectionEnd}): no positive sentinel (and/or a negation phrase like "Unresolved" / "NOT fully resolved" / "never resolved" / "cannot be fully resolved" was detected) — if Cat 2c still has IDs, this is fine; if it doesn't, the doc expresses an unresolved state, and you probably meant Cat 3 (deletes) — verify which one resolved`);
}

// (5) Cat 3 "Resolved" sentinel — symmetric inversion of rule 4 (WARN only).
//
// Transitive guarantee: if the v5 Doc Evolution row shipped (filesystem
// cleanup), Cat 3 should say "resolved". If Cat 3 lacks BOTH the
// heading-Resolved signal AND the body-sentinel, the section is out of
// sync with the roll-up — the same failure class as cat-2c-resolved-claim
// but for the "deletion" category rather than the "rename" category.
//
// This mirrors rule 4's structural shape on purpose: heading-detection →
// sentinel-fallback → symmetric-warn. Maintained as WARN because Cat 3
// resolution is informationally-dense (filesystem state, history, audit
// pointers all live in one section) — the lint shouldn't auto-fix, only
// surface the desync for the maintainer to make the call.
const cat3 = parseCat3Resolved();
if (cat3.reason) {
  warn('cat-3-resolved-claim', cat3.reason);
} else if (!cat3.resolved) {
  warn('cat-3-resolved-claim',
    `Cat 3 section (lines ${cat3.sectionStart}–${cat3.sectionEnd}): heading doesn't contain "Resolved" (or contains "Unresolved") AND no positive body sentinel (or a negation phrase like "NOT fully resolved" / "never completely resolved" / "cannot be fully resolved" / "unresolved" was detected) — if the v5 Doc Evolution row shipped (filesystem cleanup), Cat 3 should say "resolved"; if Cat 3 truly has unresolved dirs, this is fine; verify which one resolved`);
}

console.log('');
if (violations > 0) {
  console.error(`${violations} violation(s), ${warnings} warning(s)`);
  process.exit(soft ? 0 : 1);
}
console.log(warnings === 0
  ? 'ok — no violations'
  : `ok — no violations, ${warnings} warning(s)`);
