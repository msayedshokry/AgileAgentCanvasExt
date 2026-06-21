#!/usr/bin/env node
/**
 * scripts/lint-mapping-doc.smoke.mjs
 *
 * Tiny pinned regression test for scripts/lint-mapping-doc.mjs.
 *
 * Runs the lint against 5 minimal-but-valid doc-state fixtures and asserts
 * the expected (exit_code, fired_rule_names[]) on each. Future maintainers
 * catch parser-regressions via this smoke test — if a refactor breaks the
 * parser's view of "what a Doc Evolution table looks like" or "what a
 * close-out row's leading-claim shape is", one of these 5 fixtures fails
 * FIRST (good) so you know to update the parser AND the fixture, rather
 * than slipping a silent regex drift into CI.
 *
 * Why inline fixtures (not checked-in .md files)? Each fixture encodes the
 * minimum markdown the parser needs to find its targets — a stripped-down
 * doc that targets exactly one rule. They are truly pinned: changes to the
 * real docs/superpowers/plans/bmad-to-aac-mapping.md do NOT shift these
 * fixtures. The smoke test fails only when the PARSER moves, not when the
 * doc moves.
 *
 * Usage:
 *   node scripts/lint-mapping-doc.smoke.mjs
 *   npm run lint:mapping-doc:smoke
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LINT_SCRIPT = 'scripts/lint-mapping-doc.mjs';

// ── Parser shape contract ──────────────────────────────────────────────
//
// Each fixture must satisfy scripts/lint-mapping-doc.mjs's locator
// expectations:
//
//   1. `## Doc Evolution` heading + intro paragraph containing the word
//      "<one|two|...|ten> phase milestones".
//   2. Doc Evolution markdown table whose header row starts with
//      `| Phase` and whose data rows contain `| **N**` (the count cell).
//   3. `## Phase 2 close-out status` heading + table with rows labeled
//      `| **2.1** ...` and `| **2.4** ...`, each containing the leading-
//      claim "<N> in-scope refs swept" (with or without a
//      "residual footprint = " prefix).
//   4. Optionally `### 2c. Deployed skill/workflow IDs` section with a
//      "fully resolved" sentinel — if present, `cat-2c-resolved-claim` is
//      satisfied and the warn stays silent.
//   5. Closeout table must keep the 3-data-column shape — 5 cells after
//      `split('|')` (empty bookends). The lint pins `cells[3]` as the
//      "Actual state" cell.
//
// Doc Ev roll-up for the pinned fixtures (forward direction):
//   v1: 19  (initial close)
//   v2: 21  (+ 2 add-back catalogue twins)
//   v3: 26  (+ 5 true no-twin catalogue twins)
//   v4: 27  (+ 1 legacy semantic-remap outlier)
//   v5: 27  (filesystem-only — count unchanged)
// Sum: 19 + 2 + 5 + 1 = 27. Matches final Doc Ev count exactly.

// ── Fixture 1: clean ───────────────────────────────────────────────────
// Final count = 27; closeout 2.1 + 2.4 leading claim = 27; intro says
// "five phase milestones"; Cat 2c section present + says "fully resolved".
// Expected: exit 0, no violations, no warnings.
const FIXTURE_CLEAN = `
# BMAD → AAC Residual Footprint Mapping (Phase 2 closing)

This doc evolves through five phase milestones — commit-by-commit diff is captured in **Doc Evolution** below.

## Doc Evolution

| Phase | Scope | In-scope swept count | Commits shipped |
|---|---|---|---|
| Phase 2 v1 | Initial close | **19** | 1 |
| Phase 2 v2 | Add-back catalogue twins | **21** | 1 |
| Phase 2 v3 | 5 true no-twin catalogue twins | **26** | 2 |
| Phase 2 v4 | Legacy semantic-remap outlier | **27** | 1 |
| Phase 2 v5 | Filesystem deletion of duplicate dirs | **27** | 1 |

## Phase 2 close-out status

| Plan task | Premise | Actual state |
|---|---|---|
| **2.1** Mapping table | 48 bmad-* | residual footprint = 27 in-scope refs swept (Category 1 table — 19 + 2 + 5 + 1). |
| **2.4** Sweep residual | 49 bmad-* | 27 in-scope refs swept (Category 1 table — 19 + 2 + 5 + 1). |
| **2.5** Resolve duplicates | 10 footprint | duplicate dirs resolved via filesystem deletion (v5). |

### 2c. Deployed skill/workflow IDs

Cat 2c is fully resolved — 0 keep-as-stable-identifier IDs remain.

## Category 3 — Resolved (deleted in Phase 2 v5)

Stub for fixture: the redundant bmad-tea / bmad-testarch directories under resources/_aac/tea/ were deleted in Phase 2 v5. **0 deferred duplicate dirs remain on disk**.
`;

// ── Fixture 2: count-mismatch ──────────────────────────────────────────
// Same shape as clean, but closeout 2.4 leading claim is 26 while Doc Ev
// final = 27. Classic v3/v4-ship-blocker shape.
//
// NOTE on the parenthetical sum: the parser's sum-extraction regex
// (\d+(?:\s*\+\s*\d+)+[^)]*) requires the parens content to START with a
// digit. Our parens start with the prose word "Category", so the regex
// never matches and `sum` extracts as null. Only the leading-claim
// mismatch (26 vs 27) fires; the sum-vs-claim branch stays silent.
// Cleaner assertion: exactly one `[doc-ev-vs-closeout]` rule fires.
// Expected: exit 1, fired rules include `doc-ev-vs-closeout`.
const FIXTURE_COUNT_MISMATCH = `
# BMAD → AAC Residual Footprint Mapping (Phase 2 closing)

This doc evolves through five phase milestones — commit-by-commit diff is captured in **Doc Evolution** below.

## Doc Evolution

| Phase | Scope | In-scope swept count | Commits shipped |
|---|---|---|---|
| Phase 2 v1 | Initial close | **19** | 1 |
| Phase 2 v2 | Add-back catalogue twins | **21** | 1 |
| Phase 2 v3 | 5 true no-twin catalogue twins | **26** | 2 |
| Phase 2 v4 | Legacy semantic-remap outlier | **27** | 1 |
| Phase 2 v5 | Filesystem deletion of duplicate dirs | **27** | 1 |

## Phase 2 close-out status

| Plan task | Premise | Actual state |
|---|---|---|
| **2.1** Mapping table | 48 bmad-* | residual footprint = 27 in-scope refs swept (Category 1 table — 19 + 2 + 5 + 1). |
| **2.4** Sweep residual | 49 bmad-* | 26 in-scope refs swept (Category 1 table — 19 + 2 + 5 + 1). |
| **2.5** Resolve duplicates | 10 footprint | duplicate dirs resolved via filesystem deletion (v5). |

### 2c. Deployed skill/workflow IDs

Cat 2c is fully resolved — 0 keep-as-stable-identifier IDs remain.

## Category 3 — Resolved (deleted in Phase 2 v5)

Stub for fixture: the redundant bmad-tea / bmad-testarch directories under resources/_aac/tea/ were deleted in Phase 2 v5. **0 deferred duplicate dirs remain on disk**.
`;

// ── Fixture 3: milestones-mismatch ─────────────────────────────────────
// Same shape as clean, but Doc Evolution intro says
// "four phase milestones" while the table has 5 data rows. The classic
// "forgot to roll the count cell up" shape.
//
// Expected: exit 1, fired rules include `milestones-vs-rows`.
const FIXTURE_MILESTONES_MISMATCH = `
# BMAD → AAC Residual Footprint Mapping (Phase 2 closing)

This doc evolves through four phase milestones — commit-by-commit diff is captured in **Doc Evolution** below.

## Doc Evolution

| Phase | Scope | In-scope swept count | Commits shipped |
|---|---|---|---|
| Phase 2 v1 | Initial close | **19** | 1 |
| Phase 2 v2 | Add-back catalogue twins | **21** | 1 |
| Phase 2 v3 | 5 true no-twin catalogue twins | **26** | 2 |
| Phase 2 v4 | Legacy semantic-remap outlier | **27** | 1 |
| Phase 2 v5 | Filesystem deletion of duplicate dirs | **27** | 1 |

## Phase 2 close-out status

| Plan task | Premise | Actual state |
|---|---|---|
| **2.1** Mapping table | 48 bmad-* | residual footprint = 27 in-scope refs swept (Category 1 table — 19 + 2 + 5 + 1). |
| **2.4** Sweep residual | 49 bmad-* | 27 in-scope refs swept (Category 1 table — 19 + 2 + 5 + 1). |
| **2.5** Resolve duplicates | 10 footprint | duplicate dirs resolved via filesystem deletion (v5). |

### 2c. Deployed skill/workflow IDs

Cat 2c is fully resolved — 0 keep-as-stable-identifier IDs remain.

## Category 3 — Resolved (deleted in Phase 2 v5)

Stub for fixture: the redundant bmad-tea / bmad-testarch directories under resources/_aac/tea/ were deleted in Phase 2 v5. **0 deferred duplicate dirs remain on disk**.
`;

// ── Fixture 4: monotonic-mismatch ─────────────────────────────────────
// Same shape as clean, but Doc Ev row 2 (19) DECREASES from row 1 (27).
// Classic accidental-sort desync shape — every other rule (closeout
// leading-claim == final, milestones count == row count, Cat 2c sentinel
// present) is satisfied, so only `doc-ev-monotonic` fires.
// Expected: exit 1, fired rules include `doc-ev-monotonic`.
const FIXTURE_MONOTONIC_MISMATCH = `
# BMAD → AAC Residual Footprint Mapping (Phase 2 closing)

This doc evolves through five phase milestones — commit-by-commit diff is captured in **Doc Evolution** below.

## Doc Evolution

| Phase | Scope | In-scope swept count | Commits shipped |
|---|---|---|---|
| Phase 2 v1 | Initial close | **27** | 1 |
| Phase 2 v2 | Accidental sort | **19** | 0 |
| Phase 2 v3 | 5 true no-twin catalogue twins | **26** | 2 |
| Phase 2 v4 | Legacy semantic-remap outlier | **27** | 1 |
| Phase 2 v5 | Filesystem deletion of duplicate dirs | **27** | 1 |

## Phase 2 close-out status

| Plan task | Premise | Actual state |
|---|---|---|
| **2.1** Mapping table | 48 bmad-* | residual footprint = 27 in-scope refs swept (Category 1 table — 19 + 2 + 5 + 1). |
| **2.4** Sweep residual | 49 bmad-* | 27 in-scope refs swept (Category 1 table — 19 + 2 + 5 + 1). |
| **2.5** Resolve duplicates | 10 footprint | duplicate dirs resolved via filesystem deletion (v5). |

### 2c. Deployed skill/workflow IDs

Cat 2c is fully resolved — 0 keep-as-stable-identifier IDs remain.

## Category 3 — Resolved (deleted in Phase 2 v5)

Stub for fixture: the redundant bmad-tea / bmad-testarch directories under resources/_aac/tea/ were deleted in Phase 2 v5. **0 deferred duplicate dirs remain on disk**.
`;

// ── Fixture 5: cross-paragraph-negation ────────────────────────────────
// Same structure as `clean`, but Cat 2c section is split across TWO
// paragraphs whose join is exactly the historical-parenthetical false-
// positive class the retrofitted NEGATION_RE is designed to close:
//
//   • Para 1 ends with "not" (no "fully resolved" trailing in para 1)
//   • Para 2 starts with a POSITIVE claim "fully resolved"
//
// Without the retrofit: the OLD NEGATION_RE's `\s+` greedily absorbs
// the `\n\n` paragraph break and matches "not ... fully resolved"
// across the boundary — a false positive that would fire
// cat-2c-resolved-claim (warn) even though the doc's INTENT is
// non-contradictory (historical context in para 1, current state in
// para 2).
//
// With the retrofit: every inter-token gap uses `[^.!?\n]{0,40}`, which
// excludes `\n`. The regex cannot span the paragraph break; the
// negative span in para 1 stays unmatched and the positive "fully
// resolved" in para 2 resolves correctly.
//
// Expected: exit 0; `cat-2c-resolved-claim` does NOT fire; no other
// rules fire. If the retrofit regresses, this fixture fails first.
const FIXTURE_CROSS_PARAGRAPH = `
# BMAD → AAC Residual Footprint Mapping (Phase 2 closing)

This doc evolves through five phase milestones — commit-by-commit diff is captured in **Doc Evolution** below.

## Doc Evolution

| Phase | Scope | In-scope swept count | Commits shipped |
|---|---|---|---|
| Phase 2 v1 | Initial close | **19** | 1 |
| Phase 2 v2 | Add-back catalogue twins | **21** | 1 |
| Phase 2 v3 | 5 true no-twin catalogue twins | **26** | 2 |
| Phase 2 v4 | Legacy semantic-remap outlier | **27** | 1 |
| Phase 2 v5 | Filesystem deletion of duplicate dirs | **27** | 1 |

## Phase 2 close-out status

| Plan task | Premise | Actual state |
|---|---|---|
| **2.1** Mapping table | 48 bmad-* | residual footprint = 27 in-scope refs swept (Category 1 table — 19 + 2 + 5 + 1). |
| **2.4** Sweep residual | 49 bmad-* | 27 in-scope refs swept (Category 1 table — 19 + 2 + 5 + 1). |
| **2.5** Resolve duplicates | 10 footprint | duplicate dirs resolved via filesystem deletion (v5). |

### 2c. Deployed skill/workflow IDs

Historical context: the v3 assessment note said Cat 2c was not

Cat 2c is fully resolved today — 0 keep-as-stable-identifier IDs remain.

## Category 3 — Resolved (deleted in Phase 2 v5)

Stub for fixture: the redundant bmad-tea / bmad-testarch directories under resources/_aac/tea/ were deleted in Phase 2 v5. **0 deferred duplicate dirs remain on disk**.
`;

// ── Test runner ────────────────────────────────────────────────────────

// Rules that MUST be exercised by at least one offline fixture (the
// coverage tripwire enforces this). Warn-only rules
// (`closeout-column-drift`, `cat-2c-resolved-claim`, `cat-3-resolved-claim`)
// are exercised by live-doc runs via the pre-commit hook + CI lint path —
// offline fixtures deliberately don't try to trigger them because each
// would require either a 6-cell row or a stripped "fully resolved" /
// "Resolved" sentinel, and BOTH of those would also fire
// `closeout-column-drift`, distracting from the rule under test.
const HARD_FAIL_RULES = ['doc-ev-monotonic', 'doc-ev-vs-closeout', 'milestones-vs-rows'];

const fixtures = [
  {
    id: 'clean',
    description: 'Doc Ev final=27 + closeout 2.1/2.4 leading claim=27 + intro "five phase milestones" + Cat 2c "fully resolved"',
    markdown: FIXTURE_CLEAN,
    expectedExit: 0,
    expectedRules: [],                            // no violations
    forbiddenRules: HARD_FAIL_RULES,              // must not fire any hard-fail rule
  },
  {
    id: 'count-mismatch',
    description: 'Closeout 2.4 leading claim 26 (vs Doc Ev final=27) — doc-ev-vs-closeout fires',
    markdown: FIXTURE_COUNT_MISMATCH,
    expectedExit: 1,
    expectedRules: ['doc-ev-vs-closeout'],
  },
  {
    id: 'milestones-mismatch',
    description: 'Intro "four phase milestones" but Doc Ev has 5 rows — milestones-vs-rows fires',
    markdown: FIXTURE_MILESTONES_MISMATCH,
    expectedExit: 1,
    expectedRules: ['milestones-vs-rows'],
  },
  {
    id: 'monotonic-mismatch',
    description: 'Doc Ev row 2 (19) decreases from row 1 (27) — doc-ev-monotonic fires',
    markdown: FIXTURE_MONOTONIC_MISMATCH,
    expectedExit: 1,
    expectedRules: ['doc-ev-monotonic'],
  },
  {
    id: 'cross-paragraph-negation',
    description: 'Cat 2c spans 2 paragraphs: para 1 ends with "not", para 2 starts with positive "fully resolved" — opens the historical-parenthetical false-positive class; retrofitted NEGATION_RE should treat as non-contradictory and stay silent',
    markdown: FIXTURE_CROSS_PARAGRAPH,
    expectedExit: 0,
    expectedRules: [],
    // The retrofit's whole point: `cat-2c-resolved-claim` must stay SILENT
    // for this fixture. Also block any hard-fail rule. If a future regression
    // breaks the proximity limit (e.g. someone re-inlines `\s+` somewhere),
    // this assertion catches it.
    forbiddenRules: [...HARD_FAIL_RULES, 'cat-2c-resolved-claim'],
  },
];

const tmpDir = mkdtempSync(join(tmpdir(), 'lint-mapping-doc-smoke-'));
let passed = 0;
let failed = 0;
const failures = [];

try {
  for (const fx of fixtures) {
    const fxPath = join(tmpDir, `${fx.id}.md`);
    writeFileSync(fxPath, fx.markdown, 'utf8');

    let exitCode = null;
    let stderr = '';
    let unexpectedThrow = null;
    try {
      const result = execFileSync(process.execPath, [LINT_SCRIPT, fxPath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      exitCode = 0;
      stderr = result.stderr || '';
    } catch (err) {
      // execFileSync throws on non-zero exit; err.status carries the exit code.
      // The else-branch below is a paranoia guard for unexpected throws
      // (e.g. ENOENT or future Node API changes) — in current Node, execFileSync
      // with `process.execPath` always populates err.status; this branch
      // triggers only if that contract ever breaks, in which case we'd
      // rather show the raw message than masquerade as exit 0.
      if (typeof err.status === 'number') {
        exitCode = err.status;
        stderr = err.stderr || '';
      } else {
        // Paranoia branch: trap unexpected throw without a numeric status
        // and surface the raw message rather than crashing the smoke run.
        unexpectedThrow = err;
      }
    }

    if (unexpectedThrow) {
      failed++;
      failures.push({ id: fx.id, reason: `subprocess threw unexpectedly: ${unexpectedThrow.message}` });
      console.error(`  ✗ ${fx.id}  (subprocess error)`);
      console.error(`      ${fx.description}`);
      continue;
    }

    // Extract `[rule-name]` tags from stderr (the lint writes
    //   `  [rule-name] message...` for both fail + warn).
    const firedRules = [...stderr.matchAll(/\[([a-z0-9-]+)\]/g)].map(m => m[1]);

    const errors = [];
    if (exitCode !== fx.expectedExit) {
      errors.push(`expected exit code ${fx.expectedExit}, got ${exitCode}`);
    }
    for (const expected of fx.expectedRules) {
      if (!firedRules.includes(expected)) {
        errors.push(`expected rule [${expected}] to fire but it did not; fired=[${firedRules.join(', ') || '<none>'}]`);
      }
    }
    if (Array.isArray(fx.forbiddenRules)) {
      const unexpected = firedRules.filter(r => fx.forbiddenRules.includes(r));
      if (unexpected.length > 0) {
        errors.push(`rule(s) fired that should not have [${unexpected.join(', ')}]`);
      }
    }

    if (errors.length === 0) {
      passed++;
      console.log(`  ✓ ${fx.id}  (exit ${exitCode}, fired=[${firedRules.join(', ') || '<none>'}])`);
    } else {
      failed++;
      failures.push({ id: fx.id, reason: errors.join('; ') });
      console.error(`  ✗ ${fx.id}`);
      console.error(`      ${fx.description}`);
      for (const e of errors) console.error(`      → ${e}`);
    }
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

// Coverage maintenance tripwire — runs on every smoke run. Silently silent
// when every hard-fail rule has at least one fixture exercising it. If a
// future maintainer adds a new hard-fail rule without adding a matching
// fixture, this warns so the gap is visible (and the maintainer knows to
// either add a fixture or remove the rule from HARD_FAIL_RULES).
const covered = new Set(fixtures.flatMap(f => f.expectedRules));
const uncovered = HARD_FAIL_RULES.filter(r => !covered.has(r));
if (uncovered.length > 0) {
  console.error(`  [maintenance] hard-fail rule(s) without fixture coverage: ${uncovered.join(', ')} — add a fixture to scripts/lint-mapping-doc.smoke.mjs`);
}

console.log('');
if (failed > 0) {
  console.error(`${passed}/${fixtures.length} passed, ${failed}/${fixtures.length} failed`);
  console.error('--- failure summary ---');
  for (const f of failures) console.error(`  [${f.id}] ${f.reason}`);
  process.exit(1);
}

console.log(`ok — ${passed}/${fixtures.length} fixtures passed`);
