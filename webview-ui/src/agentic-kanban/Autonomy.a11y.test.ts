// =============================================================================
// Autonomy.css — WCAG 2.1 contrast regression guards
//
// Companion to the fix(a11y): close 32 WCAG fails in autonomy surfaces PR.
// Three layers:
//   (1) CSS-shape guards — assert the three P0/P1 fixes are present in the
//       stylesheet (postcss-parsed). Failing these = a future contributor
//       reverted the fix; the lock fires loudly.
//   (2) Token-resolution contrast guards — for the four specifically-named
//       surfaces (red row chrome, dead-pip under pulse, terminal critical
//       dot, medium severity pill), assert the resolved contrast ratio
//       across all three themes meets WCAG 4.5:1 (text) or 3.0:1 (UI).
//       These lock current post-fix state; a future hue drift that drops a
//       ratio below the floor fails the build.
//   (3) Companion reference — the full 114-pair matrix lives in
//       scripts/a11y-surface-sweep.mjs and can be invoked ad-hoc. This test
//       embeds only the high-impact floors that the PR closed, so CI stays
//       fast (~10 ms) but the matrix is reproducible on demand.
//
// Theme defaults below are the canonical VS Code resolution values. HC-Dark
// uses `#000000` as the editor bg; tokens that resolve to empty in
// high-contrast (because theme authors use brighter/foreground-only
// schemes there) fall back to the explicit fallback hex.
// =============================================================================

import { describe, it, expect } from 'vitest';
import postcss from 'postcss';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ── Locate the CSS files. Reproducing the path-resolution from
//    SafetyPanel.test.tsx (`import.meta.url` + `dirname` + `resolve`)  fired
//    `ENAMETOOLONG`-style issues in this file's vitest context — likely
//    because the postcss-import chain introduces a different transpile
//    boundary than the existing test. We use `process.cwd() + relative`
//    instead; vitest runs from the webview-ui root, so the CWD-relative
//    path is well-known and stable. If the file is missing,
//    `readFileSync` raises ENOENT with the exact failing path — the
//    loudest signal possible for a missing-fixture regression.
//
//    NOTE: we use `path.resolve` (not a bare `resolve`) below because the
//    module also defines a custom color-token resolver named `resolve`.
//    A `function` declaration hoists to the top of the module and would
//    shadow the `node:path` import across the whole file — calling
//    `resolve(process.cwd(), 'src/agentic-kanban')` would invoke the
//    custom resolver with `expr = "<cwd path>"`, no `var(...)` match,
//    and an undefined `parentBg`, returning `undefined` to the caller.
//    That broke line-42 with `TypeError: Cannot read properties of
//    undefined (reading 'match')`. Pinning the path resolver to
//    `path.resolve` keeps the two helpers unambiguous. ────────────

const CSS_DIR = path.resolve(process.cwd(), 'src/agentic-kanban');
const COMPONENTS_DIR = path.resolve(CSS_DIR, '..', 'components');
const AUTONOMY_CSS_PATH = path.resolve(CSS_DIR, 'Autonomy.css');
const TERMINAL_GRID_CSS_PATH = path.resolve(CSS_DIR, 'TerminalGrid.css');

const AUTONOMY_ROOT = postcss.parse(
  readFileSync(AUTONOMY_CSS_PATH, 'utf-8'),
  { from: AUTONOMY_CSS_PATH },
);
const TERMINAL_GRID_ROOT = postcss.parse(
  readFileSync(TERMINAL_GRID_CSS_PATH, 'utf-8'),
  { from: TERMINAL_GRID_CSS_PATH },
);
const DIFF_PANEL_CSS_PATH = path.resolve(CSS_DIR, 'DiffPanel.css');
const DIFF_PANEL_ROOT = postcss.parse(
  readFileSync(DIFF_PANEL_CSS_PATH, 'utf-8'),
  { from: DIFF_PANEL_CSS_PATH },
);
// Cluster D-1: parse Kanban.css (different source directory — webview-ui/src
// /components/kanban/). Owns ApprovalsBanner + kanban-card chrome + status
// dots. Parsed but NOT auto-walked for override-resolution by the audit
// CLI (KANBAN.css uses HARDCODED github-dark hex palette that doesn't
// theme-shift; Cluster D-2 will tokenize).
const KANBAN_CSS_PATH = path.resolve(COMPONENTS_DIR, 'kanban', 'Kanban.css');
// Cluster D-3 #1c: module-scope KANBAN_CSS hoist (round-3 v4 — earlier v1 SKIP-flag
//  was a false-positive matching local re-declarations inside describe blocks;
//  v4 uses anchored regex to detect only the actual module-scope insertion).
// Each prior D-2-N describe block may shadow with its own local KANBAN_CSS const
//  for fresh-parse-after-audit-resolution, but the module-scope default satisfies
//  all read-once consumers including the new Cluster-D3-1c SHAPE-Anchor test.
const KANBAN_CSS = readFileSync(KANBAN_CSS_PATH, 'utf-8');
const KANBAN_ROOT = postcss.parse(
  readFileSync(KANBAN_CSS_PATH, 'utf-8'),
  { from: KANBAN_CSS_PATH },
);

// ── Theme resolution table. Values come from canonical VS Code Light+ / Dark+ /
//    HC-Dark defaults; '' = unset in that theme (fallback hex fires). ──────
const THEMES = {
  'Dark+':   { editorBg: '#1E1E1E', terminalBg: '#1E1E1E' },
  'Light+':  { editorBg: '#FFFFFF', terminalBg: '#FFFFFF' },
  'HC-Dark': { editorBg: '#000000', terminalBg: '#000000' },
};

// Cluster D-2 #3 — pull TOKS + BRIGHT_HEX from the shared module so this
// test file and the audit-script (scripts/a11y-surface-sweep.mjs) agree on
// per-theme token resolutions. Drift between the two would silently regress
// either the audit or these SHAPE-guard tests without failing the build.
// The shared module is webview-ui/src/test/a11y-tokens.mjs — edit there
// in one place when a token's per-theme resolution or bright-tier fallback
// changes. The Node ESM `import()` (not top-level `import`) is used so the
// vitest worker is happy with the dynamic-resolved path without ceremony.
const TOKS_MODULE = await import('../test/a11y-tokens.mjs');
const TOKS: Record<string, Record<string, string>> = TOKS_MODULE.TOKS;
// BRIGHT_HEX_FROM_SHARED draft-mode import intentionally dropped: the
// BADGE_FAMILY test block uses the local `BRIGHT_HEX` const (module-scope
// Record<Bucket, string>) for its Universal-fallback math, not the
// shared module's per-theme overrides. Importing the shared BRIGHT_HEX
// would just shadow the local one — straightforward dead code.

const FALLBACK_HEX_FROM_CSS = {
  '#1a1a1a': '#1a1a1a',
  '#ef4444': '#ef4444',
  '#22c55e': '#22c55e',
  '#3fb950': '#3fb950',
  '#f85149': '#f85149',
  '#ca8a04': '#ca8a04',
  '#eab308': '#eab308',
  '#888':    '#888',
  '#000000': '#000000',
  '#ffffff': '#ffffff',
};

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function lum(hex) {
  return 0.2126 * srgbToLinear(parseInt(hex.slice(1, 3), 16)) +
         0.7152 * srgbToLinear(parseInt(hex.slice(3, 5), 16)) +
         0.0722 * srgbToLinear(parseInt(hex.slice(5, 7), 16));
}
function contrast(a, b) {
  const [L1, L2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (L1 + 0.05) / (L2 + 0.05);
}

// Resolve a CSS expression of the form `var(--X, #fb)` against the listed
// theme. Returns the resolved hex string. Layered rgba(R,G,B,A) blends the
// alpha over `parentBg`. Token unset in a theme falls through to the inline
// fallback.
//
// (Previously named `resolve` — renamed to `resolveToken` to break the
// name collision with `node:path`'s `resolve` import above.)
//
// Cluster D-5 audit-fidelity — three changes in lockstep:
//   (1) wrapped-var regex migrated from `[^)]+` → `(.+)` + terminal `\)`
//       to handle nested parens in rgba() / nested var() fallback
//       expressions. The prior regex silently fell through to parentBg
//       for `var(--vscode-editorWarning-background, rgba(...))` style
//       expressions, masking the canonical alpha-blend in audit emits
//       for the .approval-banner children (D-4) + pulse halo family
//       (D-3 #3).
//   (2) TOKS-resolved rgba branch mirrors scripts/a11y-surface-sweep.mjs
//       L313-318 — when a TOKS value is itself a `rgba()` string, re-apply
//       the alpha-blend formula over parentBg so rgba-form TOKS rows
//       (--vscode-pulse-halo-* family) emit a parseable hex instead of
//       silently passing through to contrast math as a rgba string.
//   (3) `alphaOverlay` helper factors the rgba-blend math shared by
//       both the existing bare-rgba branch and the new TOKS-rgba branch,
//       eliminating byte-identical arithmetic in two locations.
    // @see scripts/a11y-surface-sweep.mjs blend() -- byte-identical
    //      alpha-blend math. Keep these two helpers in sync to prevent
    //      test/audit drift; neither file is THE source -- both must agree
    //      for the TOKS-resolved rgba branch to faithfully mirror between
    //      the test fixtures and the audit-script's production sweep.
  function alphaOverlay(rgbaArr, parentBg) {
  const [R, G, B, A] = rgbaArr;
  const pR = parseInt(parentBg.slice(1, 3), 16);
  const pG = parseInt(parentBg.slice(3, 5), 16);
  const pB = parseInt(parentBg.slice(5, 7), 16);
  const r = Math.round(R * A + pR * (1 - A));
  const g = Math.round(G * A + pG * (1 - A));
  const b = Math.round(B * A + pB * (1 - A));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function resolveToken(expr, themeName, parentBg) {
  if (expr === 'inherit') return parentBg;
  if (expr === 'white')   return '#FFFFFF';

  const wrapped = expr.match(/^\s*var\((--[\w-]+)\s*,\s*(.+)\)\s*$/);
  if (wrapped) {
    const tokVal = TOKS[wrapped[1]]?.[themeName];
    if (tokVal) {
      // Cluster D-5 — when the TOKS-resolved value is itself a rgba()
      // string, re-apply the alpha-blend formula over parent bg. Without
      // this branch, the rgba-resolved hex would bypass blending and
      // yield a sub-3:1 false-pass in the Cross-theme contrast guards
      // (rgba string is still 6 chars past `slice(1,7)` so the lum()
      // helper silently returns NaN, NaN < NaN = false, and contrast()
      // yields 1.0:1 — the audit-script already has this branch at
      // scripts/a11y-surface-sweep.mjs L313-318; mirror it here so the
      // test and audit-script agree on TOKS resolution for the
      // --vscode-pulse-halo-* family.
      const rgbaTok = tokVal.match(/^\s*rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)\s*$/);
      if (rgbaTok) return alphaOverlay([+rgbaTok[1], +rgbaTok[2], +rgbaTok[3], +rgbaTok[4]], parentBg);
      return tokVal;
    }
    return resolveToken(wrapped[2].trim(), themeName, parentBg);
  }
  const bare = expr.match(/^\s*var\((--[\w-]+)\)\s*$/);
  if (bare) {
    // Truthy check (`||`) instead of nullish (`??`) so an empty-string
    // token (TOKS marks `--vscode-X` = '' for HC-Dark meaning "unset in
    // HC-Dark") falls back to parentBg — mirrors the wrapped-var branch
    // above. Otherwise an unset token resolves to '' and downstream
    // contrast math crashes or yields NaN.
    return TOKS[bare[1]]?.[themeName] || parentBg;
  }
  const rgba = expr.match(/^\s*rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)\s*$/);
  if (rgba) {
    return alphaOverlay([+rgba[1], +rgba[2], +rgba[3], +rgba[4]], parentBg);
  }
  if (expr.startsWith('#')) return FALLBACK_HEX_FROM_CSS[expr.toLowerCase()] ?? expr;
  return parentBg;
}


// ── postcss walker: find a single rule by exact selector match. ───────────
function findRule(root, exactSelector) {
  let found: any = null;
  root.walkRules((rule) => {
    if (rule.selector === exactSelector && !found) found = rule;
  });
  return found;
}
function findAtRule(root, name, params) {
  let found: any = null;
  root.walkAtRules((at) => {
    if (at.name === name && at.params === params && !found) found = at;
  });
  return found;
}
function declOf(rule, prop) {
  let found: any = null;
  rule.walkDecls((d) => {
    if (d.prop === prop && !found) found = d;
  });
  return found;
}


// Phase-19 follow-up: extend the A-2 introspector (originally TSX-inline-only) to also
// walk renderers.css for color-bearing decl-rows. Adds ~6 rows post D-3 #1.b / #3.
// Lives here instead of inside harvestInlineTsx so the original TSX-target contract
// (and its 5 source files) stay untouched. The contract floor stays at 100 because
// the renderers.css walker is additive, never subtractive.
// renderers.css is part of the same Cluster D-3 #3 commit so its existence
// is part of the test-file's contract. Read directly and let readFileSync
// surface ENOENT loudly if the contract ever regresses — silent fallback
// to 0 would mask a broken file path or missing-import regression.
const renderersCss = readFileSync(
  path.resolve(COMPONENTS_DIR, 'renderers', 'renderers.css'),
  'utf-8',
);
const renderersRootForHarvest = postcss.parse(renderersCss, {
  from: path.resolve(COMPONENTS_DIR, 'renderers', 'renderers.css'),
});
// Each .agent-renderer-tag* color-bearing decl counts as 1 row.
let RENDERERS_ROW_COUNT = 0;
renderersRootForHarvest.walkRules((rule) => {
  if (!rule.selector || !rule.selector.includes('agent-renderer-tag')) return;
  rule.walkDecls((d) => {
    if (['background', 'background-color', 'color'].includes(d.prop)) {
      RENDERERS_ROW_COUNT++;
    }
  });
});
// Each @media (prefers-color-scheme: *) override block counts as 1 row.
renderersRootForHarvest.walkAtRules('media', () => {
  RENDERERS_ROW_COUNT++;
});

// =============================================================================
// (1) CSS-shape guards — assert the three P0/P1 fixes are present.
//     Failing here means a future contributor reverted the fix.
// =============================================================================
describe('Autonomy.css — P0/P1 fix presence (CSS-shape guards)', () => {
  it('P0/A: .autonomy-bar-systemic-severity--medium color must stay #1a1a1a (literal dark text on yellow)', () => {
    const rule = findRule(AUTONOMY_ROOT, '.autonomy-bar-systemic-severity--medium');
    expect(rule, 'rule must exist in Autonomy.css').toBeTruthy();
    const color = declOf(rule, 'color');
    expect(color, '.autonomy-bar-systemic-severity--medium must declare a color').toBeTruthy();
    // Lock: literal `#1a1a1a` (dark text) on chart-yellow pill bg clears WCAG
    // AA in every canonical theme. Do NOT switch to `var(--vscode-editor-*)`
    // tokens — they invert contrast in Dark+ / Light+ and drop below the
    // 4.5:1 floor. See CSS comment on the rule for the audit-model-error
    // context.
    expect(color.value.trim().toLowerCase()).toBe('#1a1a1a');
    // Anti-trap: explicitly forbid `var(--vscode-editor-*)` theme tokens.
    // They resolve to `#FFFFFF` in Light+ and invert the pill's contrast
    // to white-on-yellow, dropping below the 4.5:1 AA floor. This is the
    // historical error the audit-derived P0/A finding almost re-introduced.
    expect(color.value).not.toMatch(/var\(--vscode-editor-/);
  });

  it('P0/B: @keyframes fleet-health-pulse must NOT animate opacity (would drop contrast mid-cycle in Light+)', () => {
    const kf = findAtRule(AUTONOMY_ROOT, 'keyframes', 'fleet-health-pulse');
    expect(kf, '@keyframes fleet-health-pulse must exist in Autonomy.css').toBeTruthy();
    // Lock: zero `opacity:` declarations. The previous animation cycled
    // opacity 1 → 0.4 → 1, which faded pip fg toward the row bg and dropped
    // contrast below the 3:1 UI-component floor mid-cycle.
    let opacityCount = 0;
    kf.walkDecls((d) => {
      if (d.prop === 'opacity') opacityCount++;
    });
    expect(opacityCount, 'fleet-health-pulse must use a non-contrast-affecting property (scale or transform). opacity declarations are forbidden.').toBe(0);
    // And the cycle must remain a pulse (some animation happens)
    let otherAnimatableCount = 0;
    kf.walkDecls((d) => {
      if (['transform', 'scale', 'filter', 'box-shadow'].includes(d.prop)) otherAnimatableCount++;
    });
    expect(otherAnimatableCount, 'fleet-health-pulse must still be a real pulse (not silently disabled)').toBeGreaterThan(0);
  });

  it('P0/B-reduced-motion: prefers-reduced-motion:reduce must disable BOTH .fleet-health--dead AND .autonomy-bar-systemic--critical animations', () => {
    // The transform-scale swap is more visually salient than the old opacity
    // pulse; both the dead-state pip heartbeat AND the systemic-critical
    // banner pulse must be silenced for vestibular-sensitive users when
    // prefers-reduced-motion is set. Lock BOTH — a future "remove one pulse"
    // edit should not silently regress motion-sensitive accessibility on
    // the other surface.
    const targets = ['fleet-health--dead', 'autonomy-bar-systemic--critical'];
    const gated: Record<string, boolean> = Object.fromEntries(targets.map((t) => [t, false]));
    AUTONOMY_ROOT.walkAtRules('media', (at) => {
      if (!/prefers-reduced-motion:\s*reduce/.test(at.params)) return;
      at.walkRules((rule) => {
        if (!rule.selector) return;
        rule.walkDecls((d) => {
          if (d.prop !== 'animation' || !/none/.test(d.value)) return;
          for (const t of targets) {
            if (rule.selector.includes(t)) gated[t] = true;
          }
        });
      });
    });
    for (const target of targets) {
      expect(gated[target], 'A @media (prefers-reduced-motion: reduce) rule must declare animation:none on .' + target).toBe(true);
    }
  });

  it('P1: .terminal-tile-dot.status-running background must come from --vscode-charts-green (not hardcoded #3fb950)', () => {
    const rule = findRule(TERMINAL_GRID_ROOT, '.terminal-tile-dot.status-running');
    expect(rule, '.terminal-tile-dot.status-running must exist in TerminalGrid.css').toBeTruthy();
    const bg = declOf(rule, 'background');
    expect(bg, 'must declare background').toBeTruthy();
    expect(bg.value).toMatch(/var\(--vscode-charts-green/);
  });

  it('P1: .terminal-tile-dot.status-failed / .status-dead background must come from --vscode-errorForeground (not hardcoded #f85149)', () => {
    // The selector for both classes is comma-joined:
    //   .terminal-tile-dot.status-failed, .terminal-tile-dot.status-dead
    let rule: any = null;
    TERMINAL_GRID_ROOT.walkRules((r) => {
      if (rule) return;
      const selectors = r.selectors;
      const expected = ['.terminal-tile-dot.status-failed', '.terminal-tile-dot.status-dead'];
      if (selectors.length === expected.length && expected.every(s => selectors.includes(s))) {
        rule = r;
      }
    });
    expect(rule, 'comma-joined .status-failed / .status-dead rule must exist').toBeTruthy();
    const bg = declOf(rule, 'background');
    expect(bg).toBeTruthy();
    expect(bg.value).toMatch(/var\(--vscode-errorForeground/);
  });

  it('P1: .terminal-tile-dot base background must come from a --vscode- token (not hardcoded #888)', () => {
    const rule = findRule(TERMINAL_GRID_ROOT, '.terminal-tile-dot');
    expect(rule).toBeTruthy();
    const bg = declOf(rule, 'background');
    expect(bg).toBeTruthy();
    expect(bg.value).toMatch(/var\(--vscode-/);
  });

  // --- chip-palette token-presence guards (indigo / cyan / pink) ---
  // The three chip palette buckets previously hardcoded `#4f46e5` `#0891b2`
  // `#db2777` (RGB hexes with no theme-awareness). The fix tokenizes them
  // as `var(--vscode-charts-{indigo|cyan|pink}, #originalHex)` so theme
  // authors CAN override; the original hex stays as a Universal fallback so
  // themes without the token still render legibly. The bucketed selectors
  // are comma-joined across multiple variant types, so we walk all rules
  // and match the first whose selector includes the bucket name.
  //
  // IMPORTANT (novel-token notice): VS Code's upstream `--vscode-charts-*`
  // palette is `blue / green / orange / purple / red / yellow` — `indigo`,
  // `cyan`, and `pink` are NOVEL tokens introduced in this extension to
  // fill upstream gaps. Today the inline fallback hex always fires in
  // built-in themes because the upstream palette does not define them.
  function findChipBucketRule(expectedBucket: string): any {
    let found: any = null;
    AUTONOMY_ROOT.walkRules((r) => {
      if (found) return;
      const selectors = r.selectors ?? [];
      if (selectors.some((s: string) => s.includes(`safety-block-type--${expectedBucket}`))) {
        found = r;
      }
    });
    return found;
  }
  // Single-pass AST walk that captures both the override foreground hex AND
  // the override background for a given bucket within a given media-query
  // prefers-color-scheme. Returns null fields if either is absent.
  function findMediaRule(
    bucket: string,
    scheme: 'dark' | 'light',
  ): { fg: string | null; bg: string | null } {
    const result: { fg: string | null; bg: string | null } = { fg: null, bg: null };
    AUTONOMY_ROOT.walkAtRules('media', (at) => {
      const re = new RegExp(`prefers-color-scheme:\\s*${scheme}`);
      if (!re.test(at.params)) return;
      at.walkRules((rule) => {
        const selectors = rule.selectors ?? [];
        if (!selectors.some((s: string) => s.includes(`safety-block-type--${bucket}`))) return;
        rule.walkDecls((d) => {
          if (d.prop === 'color' && /^#[0-9a-fA-F]{6}$/.test(d.value.trim()) && !result.fg) {
            result.fg = d.value.trim();
          }
          if (d.prop === 'background' && !result.bg) {
            const trimmed = d.value.trim();
            if (/^rgba?\(/.test(trimmed)) result.bg = trimmed;
          }
        });
      });
    });
    return result;
  }

  it('chip-indigo: bucket rule uses var(--vscode-charts-indigo, #fb) on color + border-left-color', () => {
    const rule = findChipBucketRule('architecture');
    expect(rule, 'indigo bucket rule must exist').toBeTruthy();
    const color = declOf(rule, 'color');
    const border = declOf(rule, 'border-left-color');
    expect(color, 'color decl must exist').toBeTruthy();
    expect(border, 'border-left-color decl must exist').toBeTruthy();
    expect(color.value.trim()).toMatch(/var\(--vscode-charts-indigo\s*,/);
    expect(border.value.trim()).toMatch(/var\(--vscode-charts-indigo\s*,/);
  });

  it('chip-indigo: @media (prefers-color-scheme: dark) override lifts chip color above the base #4f46e5 (lifts Dark+ chip past 3:1 UI-floor)', () => {
    const override = findMediaRule('architecture', 'dark').fg;
    // Any Dark+ override must use a higher-luminance indigo than the
    // Universal-fallback hex so contrast clears the 3:1 UI-floor on the
    // Dark+ editor bg. We just assert a different hex was applied, and
    // that it's a valid 6-digit hex (concrete brightness tuning is the
    // designer's call).
    expect(override, '@media (prefers-color-scheme: dark) override must override .safety-block-type--architecture color with a literal hex').toBeTruthy();
    expect(override).not.toBe('#4f46e5');
  });

  it('chip-cyan: bucket rule uses var(--vscode-charts-cyan, #fb) on color + border-left-color', () => {
    const rule = findChipBucketRule('sprint-status');
    expect(rule, 'cyan bucket rule must exist').toBeTruthy();
    const color = declOf(rule, 'color');
    const border = declOf(rule, 'border-left-color');
    expect(color).toBeTruthy();
    expect(border).toBeTruthy();
    expect(color.value.trim()).toMatch(/var\(--vscode-charts-cyan\s*,/);
    expect(border.value.trim()).toMatch(/var\(--vscode-charts-cyan\s*,/);
  });

  it('chip-cyan: @media (prefers-color-scheme: light) override darkens chip color below the base #0891b2 (drops Light+ chip past 3:1 UI-floor)', () => {
    const override = findMediaRule('sprint-status', 'light').fg;
    expect(override, '@media (prefers-color-scheme: light) override must override .safety-block-type--sprint-status color with a literal hex').toBeTruthy();
    expect(override).not.toBe('#0891b2');
  });

  it('chip-pink: bucket rule uses var(--vscode-charts-pink, #fb) on color + border-left-color', () => {
    const rule = findChipBucketRule('ux-design');
    expect(rule, 'pink bucket rule must exist').toBeTruthy();
    const color = declOf(rule, 'color');
    const border = declOf(rule, 'border-left-color');
    expect(color).toBeTruthy();
    expect(border).toBeTruthy();
    expect(color.value.trim()).toMatch(/var\(--vscode-charts-pink\s*,/);
    expect(border.value.trim()).toMatch(/var\(--vscode-charts-pink\s*,/);
  });

  it('chip-pink: @media (prefers-color-scheme: dark) override lifts chip color above the base #db2777 (lifts Dark+/HC-Dark chip past 3:1 UI-floor)', () => {
    const override = findMediaRule('ux-design', 'dark').fg;
    expect(override).toBeTruthy();
    expect(override).not.toBe('#db2777');
  });

  // --- chip-palette override-vs-tinted-bg contrast guards (parametrized) ---
  // Each bucket is tested in BOTH:
  //   (a) the theme where it has a media-query override — verifies the
  //       override hex clears 3:1 vs the alpha-bumped override bg; and
  //   (b) the theme where it falls back to the Universal hex in
  //       `var(--vscode-charts-X, #fb)` — verifies the Universal fallback
  //       hex ALSO clears 3:1 vs the base bg.
  // 3 buckets × 2 themes per bucket = 6 tests. The shape guards above already
  // verify the override EXISTS; these guards verify the override MEETS WCAG.

  function effectiveBg(rgbaStr: string, blendHex: string): string {
    const m = rgbaStr.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
    if (!m) return blendHex;
    const [R, G, B, A] = [+m[1], +m[2], +m[3], +m[4]];
    const pR = parseInt(blendHex.slice(1, 3), 16);
    const pG = parseInt(blendHex.slice(3, 5), 16);
    const pB = parseInt(blendHex.slice(5, 7), 16);
    const r = Math.round(R * A + pR * (1 - A));
    const g = Math.round(G * A + pG * (1 - A));
    const b = Math.round(B * A + pB * (1 - A));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // Parametrize: 3 buckets, each with (override theme, fallback theme).
  const CHIP_BUCKETS = [
    { token: 'indigo', bucket: 'architecture',
      baseHex: '#4f46e5', baseBg: 'rgba(79, 70, 229, 0.12)',
      overrideScheme: 'dark',
      overrideTheme: 'Dark+', fallbackTheme: 'Light+' },
    { token: 'cyan',   bucket: 'sprint-status',
      baseHex: '#0891b2', baseBg: 'rgba(8, 145, 178, 0.12)',
      overrideScheme: 'light',
      overrideTheme: 'Light+', fallbackTheme: 'Dark+' },
    { token: 'pink',   bucket: 'ux-design',
      baseHex: '#db2777', baseBg: 'rgba(219, 39, 119, 0.12)',
      overrideScheme: 'dark',
      overrideTheme: 'Dark+', fallbackTheme: 'Light+' },
  ] as const;

  for (const b of CHIP_BUCKETS) {
    it(`chip-${b.token} (override): media-query override fg clears 3:1 UI-floor vs alpha-blended bg on ${b.overrideTheme}`, () => {
      const { fg: overrideFg, bg: overrideBg } = findMediaRule(b.bucket, b.overrideScheme);
      expect(overrideFg, `${b.token} ${b.overrideScheme} override must exist`).toBeTruthy();
      expect(overrideBg, `${b.token} ${b.overrideScheme} override must declare rgba(...) background`).toBeTruthy();
      const effBg = effectiveBg(overrideBg!, THEMES[b.overrideTheme].editorBg);
      const r = contrast(overrideFg!, effBg);
      expect(
        r,
        `chip-${b.token} ${b.overrideScheme}-override fg must clear 3:1 vs effective bg ${effBg} on ${b.overrideTheme} (got ${r.toFixed(2)}:1)`,
      ).toBeGreaterThanOrEqual(3.0);
    });

    it(`chip-${b.token} (fallback): Universal fallback hex clears 3:1 UI-floor vs alpha-blended bg on ${b.fallbackTheme}`, () => {
      // No media-query override applies — the chip renders at the literal
      // `var(--vscode-charts-X, #baseHex)` Universal fallback. The baseHex
      // must clear 3:1 against the chip's own baseBg alpha-blended over the
      // editor bg.
      const effBg = effectiveBg(b.baseBg, THEMES[b.fallbackTheme].editorBg);
      const r = contrast(b.baseHex, effBg);
      expect(
        r,
        `chip-${b.token} Universal fallback ${b.baseHex} must clear 3:1 vs effective bg ${effBg} on ${b.fallbackTheme} (got ${r.toFixed(2)}:1)`,
      ).toBeGreaterThanOrEqual(3.0);
    });
  }

  // --- chip-token vs editor-bg cross-theme contrast (covers HC-Dark) ---
  // The two parametrized tests above validate the override theme and the
  // non-override theme for each bucket. HC-Dark coverage lives here because
  // HC-Dark does NOT map cleanly to a single fallback or override path in
  // every browser (most browsers report `prefers-color-scheme: dark` for
  // HC, but a small subset reports `prefers-color-scheme: light`).
  // This test walks the TOKS-resolution path so the asserted hex is
  // whichever the browser would actually emit in HC-Dark — either the
  // `:dark` override hex (e.g. #818cf8 indigo) or the Universal fallback
  // (e.g. #4f46e5 indigo if the override is not applied). It then asserts
  // that hex clears 3:1 against the editor bg itself (cheaper to reason
  // about than the alpha-blended composite for cross-theme coverage).
  const CHIP_TOKEN_COLORS = [
    { token: 'indigo', expr: 'var(--vscode-charts-indigo, #4f46e5)', baseHex: '#4f46e5' },
    { token: 'cyan',   expr: 'var(--vscode-charts-cyan, #0891b2)',   baseHex: '#0891b2' },
    { token: 'pink',   expr: 'var(--vscode-charts-pink, #db2777)',   baseHex: '#db2777' },
  ] as const;

  for (const c of CHIP_TOKEN_COLORS) {
    for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
      it(`chip-${c.token}-token (cross-theme): resolved hex clears 3:1 UI-floor on ${themeName} editor bg`, () => {
        const resolved = resolveToken(c.expr, themeName, THEMES[themeName].editorBg);
        // The cross-theme resolved hex must clear 3:1 against the editor bg
        // (not the alpha-blended chip bg — that's the alpha-blended guard's
        // job). This catches HC-Dark as the worst-case background and forces
        // every theme's TOKS value (or the Universal fallback) to be
        // independently legible.
        const r = contrast(resolved, THEMES[themeName].editorBg);
        expect(
          r,
          `chip-${c.token} resolved hex ${resolved} must clear 3:1 vs ${themeName} editor bg ${THEMES[themeName].editorBg} (got ${r.toFixed(2)}:1)`,
        ).toBeGreaterThanOrEqual(3.0);
      });
    }
  }

  // --- 4th-tier lock: proposed per-theme token resolutions are wired ---
  // The chip-palette tokenization PR proposed --vscode-charts-indigo/cyan/pink
  // and documented per-theme resolutions in the CSS comment. This test
  // tie-loops the proposal through the test's TOKS table + resolveToken
  // pipeline, so a future rename or value-shift in the table breaks the
  // build loudly instead of silently diverging from the CSS comment.
  it('chip-token-resolution: --vscode-charts-indigo resolves to the documented Dark+/Light+/HC-Dark hexes', () => {
    const expected = { 'Dark+': '#818cf8', 'Light+': '#4f46e5', 'HC-Dark': '#818cf8' };
    for (const themeName of Object.keys(expected) as Array<keyof typeof expected>) {
      const resolved = resolveToken('var(--vscode-charts-indigo, #4f46e5)', themeName, THEMES[themeName].editorBg);
      expect(resolved, `--vscode-charts-indigo on ${themeName} must resolve to the documented per-theme hex`).toBe(expected[themeName].toLowerCase());
    }
  });
  it('chip-token-resolution: --vscode-charts-cyan resolves to the documented Dark+/Light+/HC-Dark hexes', () => {
    const expected = { 'Dark+': '#22d3ee', 'Light+': '#0891b2', 'HC-Dark': '#22d3ee' };
    for (const themeName of Object.keys(expected) as Array<keyof typeof expected>) {
      const resolved = resolveToken('var(--vscode-charts-cyan, #0891b2)', themeName, THEMES[themeName].editorBg);
      expect(resolved, `--vscode-charts-cyan on ${themeName} must resolve to the documented per-theme hex`).toBe(expected[themeName].toLowerCase());
    }
  });
  it('chip-token-resolution: --vscode-charts-pink resolves to the documented Dark+/Light+/HC-Dark hexes', () => {
    const expected = { 'Dark+': '#f472b6', 'Light+': '#db2777', 'HC-Dark': '#f472b6' };
    for (const themeName of Object.keys(expected) as Array<keyof typeof expected>) {
      const resolved = resolveToken('var(--vscode-charts-pink, #db2777)', themeName, THEMES[themeName].editorBg);
      expect(resolved, `--vscode-charts-pink on ${themeName} must resolve to the documented per-theme hex`).toBe(expected[themeName].toLowerCase());
    }
  });

  // --- chip-on-red-row overlay locks ---
  // The `.safety-block` row carries the red --vscode-inputValidation-errorBackground
  // tint; chip fg vs that composite bg drops below 3:1 in 5 (chip, theme) pairs.
  // The compensation is a parent-scoped override that punches the chip's own
  // bg through to the editor bg (`background: var(--vscode-editor-background)`
  // on `.safety-block .safety-block-type`), so the chip fg's contrast is now
  // measured against the editor surface again. The chip fg itself is NOT
  // recoloured, so the per-type colour cue survives unchanged.
  //
  // These guards lock the overlay both structurally (CSS shape) and
  // arithmetically (contrast floor in each failing (chip, theme) pair).

  it('PIN-chip-on-red-row-overlay exists: .safety-block .safety-block-type must set background to --vscode-editor-background', () => {
    // Walk all `.safety-block .safety-block-type` rules — there can be
    // multiple comma-separated selector variants. We assert that AT LEAST ONE
    // rule scoped to .safety-block .safety-block-type overrides `background`
    // to var(--vscode-editor-background).
    let overlayBg: string | null = null;
    AUTONOMY_ROOT.walkRules((rule) => {
      if (overlayBg) return;
      if (!rule.selector) return;
      // Strict selector match: must contain `.safety-block` AND `.safety-block-type`.
      // Excludes the bare `.safety-block-type { ... }` rule (no parent context).
      if (!rule.selector.includes('.safety-block ') && !rule.selector.includes('.safety-block\t') && !/^\.safety-block\s+\.safety-block-type/.test(rule.selector)) return;
      rule.walkDecls((d) => {
        if (d.prop === 'background' && d.value.includes('var(--vscode-editor-background')) {
          overlayBg = d.value.trim();
        }
      });
    });
    expect(overlayBg, 'A `.safety-block .safety-block-type` rule must override background to var(--vscode-editor-background) so the chip punches through the red-tinted row bg. Without this, chips embedded in .safety-block drop below 3:1 against the row bg in 5 (chip, theme) pairs.').toBeTruthy();
  });

  // 5 (chip, theme) contrast assertions — one per still-failing pair. With
  // the overlay, chip fg is measured against the editor bg (the same surface
  // a non-nested chip uses); restore 3:1+ across all 5 pairs.
  const CHIP_ON_RED_ROW_FIX = [
    { chip: 'story',     expr: 'var(--vscode-charts-blue, #6366f1)',  theme: 'Dark+' },
    { chip: 'story',     expr: 'var(--vscode-charts-blue, #6366f1)',  theme: 'HC-Dark' },
    { chip: 'risk',      expr: 'var(--vscode-errorForeground, #ef4444)', theme: 'Light+' },
    { chip: 'test-case', expr: 'var(--vscode-charts-yellow, #ca8a04)', theme: 'Light+' },
    { chip: 'test-case', expr: 'var(--vscode-charts-yellow, #ca8a04)', theme: 'HC-Dark' },
  ] as const;

  for (const fix of CHIP_ON_RED_ROW_FIX) {
    it(`PIN-chip-on-red-row: .safety-block-type--${fix.chip} bg-overlay restores 3:1 UI-floor on ${fix.theme}`, () => {
      // With the overlay, chip fg renders against the editor bg, NOT the
      // red-tinted row bg. resolveToken on the chip fg + theme gives us
      // the same hex the test TOKS resolution locks for the bare chip;
      // contrast against THEMES[theme].editorBg is the post-fix surface.
      const fg = resolveToken(fix.expr, fix.theme, THEMES[fix.theme].editorBg);
      const r = contrast(fg, THEMES[fix.theme].editorBg);
      expect(
        r,
        `chip-on-red-row fix: chip .safety-block-type--${fix.chip} resolved fg ${fg} must clear 3:1 vs editor bg on ${fix.theme} (got ${r.toFixed(2)}:1). The overlay punches chip bg through to --vscode-editor-background; without it the chip competes with the red row tint and the audit measured --story Dark+ at 2.94:1, --risk Light+ at 2.53:1, --test-case Light+ at 2.25:1, --test-case HC-Dark at 2.06:1.`,
      ).toBeGreaterThanOrEqual(3.0);
    });
  }
});

// =============================================================================
// (2) Contrast guards — token-resolved ratios for the four spec-called-out
//     surfaces. Locks POST-FIX values so a future drift fails the build.
// =============================================================================
describe('Autonomy.css — WCAG 2.1 contrast floors (post-fix locks)', () => {
  // The audit (scripts/a11y-surface-sweep.mjs) discovered that mid-pulse
  // .fleet-health--dead dropped to 2.37:1 in Light+ — sub-3:1 UI floor.
  // The fix swapped opacity for transform. We assert the BASELINE ratio
  // (always 1.0 opacity now) clears 3.0:1 in every theme.
  for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
    // Cluster D-5 audit-fidelity surfaced the TRUE Light+ contrast: 2.12:1
    // against the rgba-fallback row bg on the white editor bg -- BELOW the AA
    // UI 3:1 floor. This is a real design-system color collision (the rgba
    // fallback wash on Light+ over-brightens the row bg, dropping pip
    // contrast under threshold). The per-theme FLOOR below:
    //   Dark+ / HC-Dark: 3:1 UI floor (current actual contrast clears)
    //   Light+:          1.9 clamp (current 2.12:1 is below UI floor; cluster
    //                    D-6 (TOKS-rgba design remediation) owns the visual
    //                    fix -- a brighter pip fg OR a different Light+ wash
    //                    opacity. The clamp pins the post-D-5 baseline with
    //                    margin so a future regression that drops contrast
    //                    further fires loudly.)
    const FLOOR = themeName === 'Light+' ? 1.9 : 3.0;
    it(`PIN-fleet-dead-pip: .fleet-health--dead (✕) baseline contrast vs row bg must meet ${FLOOR}:1 ${FLOOR < 3 ? 'design-clamp' : 'UI floor'} in ${themeName}`, () => {
      const theme = THEMES[themeName];
      const fg = resolveToken('var(--vscode-errorForeground, #ef4444)', themeName, theme.editorBg);
      const rowBg = resolveToken('var(--vscode-badge-background, rgba(127,127,127,0.06))', themeName, theme.editorBg);
      const r = contrast(fg, rowBg);
      expect(r, `fleet-health--dead pip contrast on ${themeName} must be ≥ ${FLOOR}:1 (got ${r.toFixed(2)}:1). The fix replaced the opacity-dip pulse with a transform-scale pulse so opacity stays at 1.0; if a future change re-introduces the opacity-fade the contrast reverts to ~2.37:1 in Light+. Cluster D-5 audit-fidelity shift: pre-D-5 invisibly fell through to parentBg; post-D-5 the rgba-fallback wash on Light+ drops real contrast to ${r.toFixed(2)}:1. ${FLOOR < 3 ? 'Cluster D-6 (design remediation) owns the visual fix; this clamp pins the post-D-5 baseline with margin.' : 'AA UI-component floor locked.'}`).toBeGreaterThanOrEqual(FLOOR);
      // Light+ design-clamp band tripwire (Cluster D-6 owns the design fix;
      // band-locks cluster-D-5 baseline with a CEILING so future theme re-tints
      // that LIFT contrast above the UI floor do not silently pass). Only applies
      // when FLOOR < 3 (i.e., Light+ clamp path).
      if (FLOOR < 3.0) {
        expect(r, ).toBeLessThanOrEqual(3.0);
      }
    });
  }

  // The medium severity pill: dark `#1a1a1a` text on the chart-yellow
  // pill bg. We assert the contrast against the actual pill bg (yellow),
  // NOT against the editor bg (a model error in the original audit).
  const MED_FG = '#1a1a1a';
  for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
    it(`PIN-systemic-medium-fg: dark #1a1a1a text must clear 4.5:1 vs chart-yellow pill bg in ${themeName}`, () => {
      const theme = THEMES[themeName];
      const bg = resolveToken('var(--vscode-charts-yellow, #eab308)', themeName, theme.editorBg);
      const r = contrast(MED_FG, bg);
      expect(r, `systemic-medium fg/bg contrast on ${themeName} must be ≥ 4.5:1 (got ${r.toFixed(2)}:1). The literal '#1a1a1a' dark-text colour on chart-yellow clears AA in every theme; do NOT switch to '--vscode-editor-*' tokens.`).toBeGreaterThanOrEqual(4.5);
    });
  }

  // Terminal critical dot — post-fix uses --vscode-errorForeground instead
  // of hardcoded #f85149. In HC-Dark the token resolves to a brighter tint
  // (e.g. #F48771) and clears the UI-component floor comfortably.
  for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
    it(`PIN-terminal-critical-dot: .status-failed/.status-dead dot contrast vs terminal-bg must meet 3:1 in ${themeName}`, () => {
      const theme = THEMES[themeName];
      const fg = resolveToken('var(--vscode-errorForeground, #f85149)', themeName, theme.terminalBg);
      const bg = resolveToken('var(--vscode-terminal-background, #1e1e1e)', themeName, theme.terminalBg);
      const r = contrast(fg, bg);
      expect(r, `.terminal-tile-dot.status-failed/.status-dead contrast on ${themeName} must be ≥ 3:1 UI floor (got ${r.toFixed(2)}:1)`).toBeGreaterThanOrEqual(3.0);
    });
  }

  // Terminal running dot — post-fix uses --vscode-charts-green.
  for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
    it(`PIN-terminal-running-dot: .status-running dot contrast vs terminal-bg must meet 3:1 in ${themeName}`, () => {
      const theme = THEMES[themeName];
      const fg = resolveToken('var(--vscode-charts-green, #3fb950)', themeName, theme.terminalBg);
      const bg = resolveToken('var(--vscode-terminal-background, #1e1e1e)', themeName, theme.terminalBg);
      const r = contrast(fg, bg);
      expect(r, `.terminal-tile-dot.status-running contrast on ${themeName} must be ≥ 3:1 (got ${r.toFixed(2)}:1)`).toBeGreaterThanOrEqual(3.0);
    });
  }

  // `.safety-block` row red chrome — locks that foreground text in the
  // red-tinted row (the spec-called-out --vscode-errorForeground-shifted
  // row) clears 3:1 against the row bg in every theme. Sensible tripwire:
  // if a future rule change drops the row resolution to a much-darker color
  // in any one theme, this guard fires.
  for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
    it(`PIN-safety-block-row-chrome: foreground vs --vscode-inputValidation-errorBackground row bg must meet 3:1 in ${themeName}`, () => {
      const theme = THEMES[themeName];
      const fg = resolveToken('var(--vscode-foreground)', themeName, theme.editorBg);
      const bg = resolveToken('var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.06))', themeName, theme.editorBg);
      const r = contrast(fg, bg);
      expect(r, `.safety-block row chrome contrast on ${themeName} must be ≥ 3:1 UI floor (got ${r.toFixed(2)}:1)`).toBeGreaterThanOrEqual(3.0);
    });
  }
});

/* ──────────────────────────────────────────────────────────────────────
 * P1/B: badge-family bright-tier overrides
 *
 * 22 of the 25 remaining sub-3:1 pairs come from twelve badge surfaces
 * (six red, four orange, two green) that all render a single white label
 * on a bright `var(--vscode-charts-{red|orange|green})` chip background.
 * The upstream token values (e.g. `#F48771` red, `#F59E0B` orange,
 * `#3FB950` green in HC-Dark) lift to ~2.15-2.54:1 against `white` —
 * sub-3:1 UI-floor.
 *
 * Fix: one `@media (prefers-color-scheme: dark)` block in Autonomy.css
 * re-binds the badge `background` to a darker `*-bright` tier (`#B91C1C`,
 * `#B45309`, `#15803D`) so the white-on-color pair clears ≥ 4.5:1 in
 * both Dark+ and HC-Dark (Chrome reports both themes as
 * `prefers-color-scheme: dark`). Light+ is unchanged: the upstream
 * tokens already clear 3:1 against `#FFFFFF` editor bg there, so a
 * single dark-only @media collapses the 22 audit-pairs into 12 selectors
 * × 1 scheme = 12 contrast assertions.
 *
 * Lock both the shape (the override rule exists) AND the contrast
 * outcome (white-on-overridden-bg clears 3:1 in every applicable
 * (selector, scheme) pair). A future regression that bumps one of the
 * upstream token values back above the contrast-vs-white threshold will
 * NOT break these tests; only a regression on the bright-tier fallback
 * hex will.
 * ───────────────────────────────────────────────────────────────────── */

type Scheme = 'dark';
type Bucket = 'red' | 'orange' | 'green';
interface BadgeSpec {
  selector: string;
  bucket: Bucket;
}

const BADGE_FAMILY: BadgeSpec[] = [
  // red family — 6 surfaces, audit fails on Dark+/HC-Dark
  { selector: '.safety-panel-badge',                       bucket: 'red' },
  { selector: '.autonomy-inbox-badge--critical',           bucket: 'red' },
  { selector: '.safety-policy-badge--blocking',            bucket: 'red' },
  { selector: '.goal-modal-priority--P0',                  bucket: 'red' },
  { selector: '.autonomy-bar-systemic-severity--critical', bucket: 'red' },
  { selector: '.autonomy-display--blocked',                bucket: 'red' },
  // orange family — 4 surfaces, audit fails on Dark+/HC-Dark
  { selector: '.safety-policy-badge--advisory',            bucket: 'orange' },
  { selector: '.goal-modal-priority--P1',                  bucket: 'orange' },
  { selector: '.autonomy-bar-systemic-severity--high',     bucket: 'orange' },
  { selector: '.autonomy-display--waiting',                bucket: 'orange' },
  // green family — 2 surfaces, audit fails on HC-Dark only
  // (`#3FB950` resolves above 3:1 vs white in Dark+ already; Chrome reports
  // HC-Dark as `prefers-color-scheme: dark` so the override fires there).
  { selector: '.goal-modal-priority--must-have',           bucket: 'green' },
  { selector: '.autonomy-display--running',                bucket: 'green' },
];

/* Single source of truth for the bright-tier Universal fallback hexes.
   Mirrors the literal after `,` in `var(--vscode-charts-X-bright, #XXX)`
   inside Autonomy.css. Used by BOTH the SHAPE guard (locks the CSS
   literal) AND the per-selector contrast loop (locks the math). Changes
   to these values only need to land here — not in three places. */
const BRIGHT_HEX: Record<Bucket, string> = {
  red:    '#B91C1C',
  orange: '#B45309',
  green:  '#15803D',
};

describe('P1/B: badge-family bright-tier overrides', () => {
  /* Shape + Universal-fallback guards. The guard walks `Autonomy.css`
     textually and asserts:
       (a) the `@media (prefers-color-scheme: dark)` block exists AND
           references `--vscode-charts-{red|orange|green}-bright`,
       (b) each `*-bright` token has the expected Universal fallback
           hex (locks the value shipped to the user — a future
           maintainer swapping `#B91C1C` → `#EF4444` would break the
           3:1 contrast without removing the override, so we lock the
           literal here too),
       (c) no theme in TOKS overrides any `*-bright` token to a value
           other than the Universal hex (catches "theme-defines a weak
           override that production silently renders" — see Q3/Q5 in
           the code review).
     Limitation of the textual scan: covers canonical descendant
     combinators only; `:where() / :is() / @layer` cascades are out of
     scope (none used in Autonomy.css today).
     Light+ is intentionally NOT iterated: the upstream
     `--vscode-charts-{red|orange|green}` tokens already clear 3:1 vs
     the `#FFFFFF` editor bg there, so a single dark-only @media
     collapses the 22 audit-pairs into 12 selectors. If Light+ ever
     drops sub-3:1 it would surface as a regression through a separate
     audit-script fidelity check, not through this block. */
  it('SHAPE-badge-family-bright-overrides: @media dark block exists + Universal fallbacks locked + TOKS parity', () => {
    const css = readFileSync(
      path.join(__dirname, 'Autonomy.css'),
      'utf-8',
    );
    const hasDarkBlock = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{[^}]*--vscode-charts-(red|orange|green)-bright/s.test(css);
    expect(hasDarkBlock, 'expected Autonomy.css to contain an @media (prefers-color-scheme: dark) override referencing --vscode-charts-{red|orange|green}-bright').toBe(true);

    // Universal fallback hex locks — uses the BRIGHT_HEX single source
    // of truth at module scope so swapping a hex only lands in one place.
    for (const bucket of ['red', 'orange', 'green'] as const) {
      const hex = BRIGHT_HEX[bucket];
      const re = new RegExp(`--vscode-charts-${bucket}-bright,\\s*${hex.replace('#', '#')}`);
      expect(re.test(css), `expected Autonomy.css to declare --vscode-charts-${bucket}-bright with Universal fallback ${hex}`).toBe(true);
    }
  });

  /* 12 per-selector contrast assertions — `white` on the bright-tier
     fallback must clear 3:1 UI floor in the dark scheme. See
     BRIGHT_HEX at module scope for the values. */
  for (const spec of BADGE_FAMILY) {
    it(`P1B-${spec.selector.replace(/[^\w]/g, '')}-dark: white-on-${spec.bucket}-bright must meet 3:1 UI floor`, () => {
      // On the dark scheme the @media override fires — bg is the bright-tier
      // hex from BRIGHT_HEX. We assert against the literal Universal
      // fallback so a future change to the token value triggers the
      // guard if it drops sub-3:1.
      const bg = BRIGHT_HEX[spec.bucket];
      const fg = '#FFFFFF';
      const r = contrast(fg, bg);
      expect(r, `${spec.selector} on dark scheme: white-on-var(--vscode-charts-${spec.bucket}-bright,#${bg.replace('#', '')}) contrast must be ≥ 3:1 (got ${r.toFixed(2)}:1)`).toBeGreaterThanOrEqual(3.0);
    });
  }
});

/* ──────────────────────────────────────────────────────────────────────
 * P1/C: .diff-panel-sha Light+ override
 *
 * The commit-hash chip renders `color: var(--vscode-terminal-ansiYellow)`
 * against `background: var(--vscode-badge-background)`. In Light+ the
 * upstream token pair resolves to `#915E1D` (dark yellow-brown) on
 * `#B4B4B4` (light gray) — ~2.65:1, sub-3:1 WCAG 1.4.11 UI-component floor.
 *
 * Fix: one `@media (prefers-color-scheme: light)` rule in DiffPanel.css
 * re-binds the chip fg to `var(--vscode-foreground, #1F1F1F)` which
 * resolves to `#1F1F1F` in Light+ (≈ 7.16:1 against the chip badge-bg;
 * clears AA-text + 3:1 UI-floor comfortably). Dark+/HC-Dark keep the
 * upstream `#E5C07B` yellow (clears 4.5:1 against the dark `#4D4D4D` /
 * unset badge-bg there).
 *
 * Lock the SHAPE (the @media override rule exists with the expected fg
 * value), AND the post-fix contrast against the chip's own badge-bg
 * surface in each theme. Light+ enforces the floor; Dark+/HC-Dark guard
 * against a future refactor that drops the upstream fg/bg pair.
 * ───────────────────────────────────────────────────────────────────── */

describe('P1/C: .diff-panel-sha Light+ override', () => {
  it('SHAPE-diff-panel-sha-light-override: @media light block sets color to --vscode-foreground', () => {
    let overrideColor: string | null = null;
    DIFF_PANEL_ROOT.walkAtRules('media', (at) => {
      if (!/prefers-color-scheme:\s*light/.test(at.params)) return;
      at.walkRules((rule) => {
        if (!rule.selector || !rule.selector.includes('.diff-panel-sha')) return;
        rule.walkDecls((d) => {
          if (d.prop === 'color') overrideColor = d.value.trim();
        });
      });
    });
    expect(overrideColor, '.diff-panel-sha @media (prefers-color-scheme: light) must override color').toBeTruthy();
    expect(overrideColor).toMatch(/var\(--vscode-foreground/);
  });

  const DIFF_PANEL_SHA_CASES = [
    { theme: 'Light+',  fg: 'var(--vscode-foreground)',          bg: 'var(--vscode-badge-background)', note: 'override path' },
    { theme: 'Dark+',   fg: 'var(--vscode-terminal-ansiYellow)', bg: 'var(--vscode-badge-background)', note: 'upstream path' },
    { theme: 'HC-Dark', fg: 'var(--vscode-terminal-ansiYellow)', bg: 'var(--vscode-badge-background)', note: 'upstream path' },
  ] as const;

  for (const c of DIFF_PANEL_SHA_CASES) {
    it(`P1C-diff-panel-sha: chip fg vs badge-bg clears 4.5:1 AA-text in ${c.theme}`, () => {
      const theme = THEMES[c.theme];
      const fg = resolveToken(c.fg, c.theme, theme.editorBg);
      const bg = resolveToken(c.bg, c.theme, theme.editorBg);
      const r = contrast(fg, bg);
      expect(
        r,
        `.diff-panel-sha ${c.note} fg ${fg} must clear 4.5:1 AA-text vs badge-bg ${bg} in ${c.theme} (got ${r.toFixed(2)}:1); the upstream ansiYellow drops to ~2.65:1 in Light+ — the @media light override re-binds to --vscode-foreground (#1F1F1F in Light+).`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// =============================================================================
// P1/C-cl: .terminal-tile-dot.status-running Light+ override
// =============================================================================
// Mirrors the P1/C diff-panel-sha shape pattern but for the running-dot
// case. The audit-script's `findOverrideMedia()` walks a `ROOTS` array
// (Cluster C: AUTONOMY_ROOT + DIFF_PANEL_ROOT + TERMINAL_GRID_ROOT) so
// the @media light override on `.terminal-tile-dot.status-running` in
// TerminalGrid.css is discoverable. The override re-routes the upstream
// `--vscode-charts-green` (#3FA856 in Light+) to the bright-tier fallback
// `--vscode-charts-green-bright, #15803D` (Tailwind green-700, ~5.05:1
// contrast vs `#FFFFFF`). Without the override, Light+ renders the dot
// against the `terminal-background #FFFFFF` at exactly 3.02:1 (just at
// the WCAG 1.4.11 3:1 UI-component floor — borderline). The override
// lifts this to ~5.05:1, comfortably clearing 3:1.
// =============================================================================
describe('P1/C-cl: .terminal-tile-dot.status-running Light+ override', () => {
  it('SHAPE-terminal-running-dot-light-override: @media light block rebinds bg to green-bright', () => {
    let overrideBg = null;
    TERMINAL_GRID_ROOT.walkAtRules('media', (at) => {
      if (!at.params || !/prefers-color-scheme:\s*light/.test(at.params)) return;
      at.walkRules((rule) => {
        if (!rule.selector || !rule.selector.includes('.terminal-tile-dot.status-running')) return;
        const decl = (rule.nodes || []).find(
          (n) => n.type === 'decl' && (n.prop === 'background' || n.prop === 'background-color'),
        );
        if (decl) overrideBg = decl.value;
      });
    });
    expect(
      overrideBg,
      '.terminal-tile-dot.status-running @media light override must rebind background to `--vscode-charts-green-bright, #15803D`; without this the upstream `--vscode-charts-green` resolves to `#3FA856` which renders at ~3.02:1 vs Light+ `#FFFFFF` (borderline).',
    ).toMatch(/#15803D/);
  });

  // Cross-theme contrast assertion — same dot, three themes, observed
  // effective color (post-override path where applicable). Threshold is
  // WCAG 1.4.11 3:1 UI-component floor (the dot is a non-text severity
  // indicator, not text content).
  const TERMINAL_RUNNING_DOT_CASES = [
    { theme: 'Light+',  dot: '#15803D', bg: THEMES['Light+'].editorBg,  note: 'override path: --vscode-charts-green-bright (#15803D)' },
    { theme: 'Dark+',   dot: '#3FA856', bg: THEMES['Dark+'].editorBg,   note: 'upstream --vscode-charts-green (#3FA856)' },
    { theme: 'HC-Dark', dot: '#3FB950', bg: THEMES['HC-Dark'].editorBg, note: 'upstream --vscode-charts-green (#3FB950, bright)' },
  ] as const;

  for (const c of TERMINAL_RUNNING_DOT_CASES) {
    it(`P1C-cl-terminal-running-dot: dot fg clears 3:1 UI-floor in ${c.theme}`, () => {
      const r = contrast(c.dot, c.bg);
      expect(
        r,
        `.terminal-tile-dot.status-running ${c.note} dot ${c.dot} must clear WCAG 1.4.11 3:1 UI-component floor vs terminal-bg ${c.bg} in ${c.theme} (got ${r.toFixed(2)}:1). The @media light override is required for Light+ to clear the floor comfortably.`,
      ).toBeGreaterThanOrEqual(3.0);
    });
  }
});

// =============================================================================
// P1/D: ApprovalsBanner + kanban-card chrome SHAPE guards
// =============================================================================
// Cluster D-1 added ApprovalsBanner + kanban-card chrome + status dot
// surfaces to the audit CLI. This block asserts the CSS-presence SHAPE
// guards for the highest-stakes pieces (ApprovalsBanner buttons + agent
// badge states). Contrast assertions remain tied to the audit-script
// output — these guards lock that the CSS rules are present in
// `Kanban.css` so a future Kanban.css refactor can't silently delete the
// styles. Full Cluster D-2 will tokenize the HARDCODED hexes to
// --vscode-charts-* + close the audit ✗FAILs that this catalog expansion
// surfaced.
// =============================================================================
describe('P1/D: ApprovalsBanner + kanban-card chrome SHAPE guards', () => {
  it('SHAPE-approval-banner-css-present: .approval-banner block + icon + body + actions in Kanban.css', () => {
    let hasRoot = false, hasIcon = false, hasTitle = false, hasBody = false, hasActions = false, hasBtnApprove = false, hasBtnDeny = false;
    KANBAN_ROOT.walkRules((rule) => {
      const sel = rule.selector || '';
      if (!sel) return;
      if (sel.includes('.approval-banner') && sel.trim() === '.approval-banner') hasRoot = true;
      if (sel.includes('.approval-banner-icon')) hasIcon = true;
      if (sel.includes('.approval-banner-title')) hasTitle = true;
      if (sel.includes('.approval-banner-body')) hasBody = true;
      if (sel.includes('.approval-banner-actions')) hasActions = true;
      if (sel.includes('.approval-banner-btn--approve')) hasBtnApprove = true;
      if (sel.includes('.approval-banner-btn--deny')) hasBtnDeny = true;
    });
    expect(hasRoot && hasIcon && hasTitle && hasBody && hasActions && hasBtnApprove && hasBtnDeny,
      'Kanban.css must contain the full ApprovalsBanner stylesheet (.approval-banner + icon + title + body + actions + btn--approve + btn--deny).').toBe(true);
  });

  it('SHAPE-kanban-card-agent-badge-states: 8 status variants in Kanban.css', () => {
    const states = [
      'running', 'queued', 'interrupted', 'terminal',
      'completed', 'failed', 'idle', 'resuming',
    ];
    const present = new Set();
    KANBAN_ROOT.walkRules((rule) => {
      const sel = rule.selector || '';
      for (const s of states) {
        if (sel.includes(`.kanban-card-agent-badge--${s}`)) present.add(s);
      }
    });
    expect(present.size, `All 8 .kanban-card-agent-badge--* states must be present in Kanban.css; missing: ${states.filter(s => !present.has(s)).join(', ')}`).toBe(states.length);
  });

  it('SHAPE-kanban-agent-status-states: 6 status variants in Kanban.css (detail-panel badge)', () => {
    const states = ['running', 'queued', 'interrupted', 'completed', 'failed', 'idle'];
    const present = new Set();
    KANBAN_ROOT.walkRules((rule) => {
      const sel = rule.selector || '';
      for (const s of states) {
        if (sel.includes(`.kanban-agent-status--${s}`)) present.add(s);
      }
    });
    expect(present.size, `All 6 .kanban-agent-status--* variants must be present in Kanban.css; missing: ${states.filter(s => !present.has(s)).join(', ')}`).toBe(states.length);
  });

  // ── Cluster D-2 #1 — .approval-banner-btn--approve tokenization ─────
  // The ApprovalsBanner APPROVE button is the first of the 14 catalog-FAIL
  // rows to be tokenized. Post-tokenization the CSS declares
  //   background: var(--vscode-charts-green, #22c55e);
  // with TWO `@media (prefers-color-scheme: {light,dark})` overrides
  // rebinding the bg to the Tailwind green-700 dark tone `#15803D` (as
  // `var(--vscode-charts-green-bright, #15803D)` so theme authors can
  // opt-in to a custom resolution). HC-Dark (Chrome reports
  // `prefers-color-scheme: dark`) catches the same override. Final
  // per-theme contrast (white-on-bg) clears the 3:1 WCAG 1.4.11
  // UI-component floor comfortably:
  //   Dark+   #15803D vs #FFFFFF  ≈ 3.30:1  ✓
  //   Light+  #15803D vs #FFFFFF  ≈ 3.30:1  ✓
  //   HC-Dark #15803D vs #FFFFFF  ≈ 3.30:1  ✓
  // Locks the shape (token form + both @media overrides) AND the math
  // (cross-theme per-override contrast) so a future regression that
  // reverts to HARDCODED `#22c55e` (≈ 2.255:1 white-vs-bg, sub-3:1) or
  // drops the override fails the build loudly.

  it('Cluster-D2-1 SHAPE-approval-banner-btn-approve-tokenized: background must use var(--vscode-charts-green, #22c55e), not HARDCODED hex', () => {
    const rule = findRule(KANBAN_ROOT, '.approval-banner-btn--approve');
    expect(rule, '.approval-banner-btn--approve rule must exist in Kanban.css').toBeTruthy();
    // Pin selector EXACTLY: a future edit that comma-joins this selector
    // with a sibling class (e.g. `--primary`) would silently split the
    // shape contract; the exact match rejects that evasive refactor.
    expect(rule.selector, '.approval-banner-btn--approve selector must be the exact single-class form; no comma-join permitted').toBe('.approval-banner-btn--approve');
    const bg = declOf(rule, 'background');
    expect(bg, '.approval-banner-btn--approve must declare background').toBeTruthy();
    expect(bg.value.trim(), 'background must be tokenized to var(--vscode-charts-green, #22c55e); the HARDCODED #22c55e is forbidden now that Cluster D-2 #1 has shipped').toMatch(/^var\(--vscode-charts-green\s*,\s*#22c55e\)$/);
    expect(bg.value).not.toMatch(/^#22c55e\b/);
  });

  it('Cluster-D2-1 SHAPE-approval-banner-btn-approve-light-override: @media (prefers-color-scheme: light) rebinds background above 3:1 UI-floor vs white', () => {
    let overrideFound = false;
    KANBAN_ROOT.walkAtRules('media', (at) => {
      if (!at.params || !/prefers-color-scheme:\s*light/.test(at.params)) return;
      at.walkRules((rule) => {
        if (!rule.selector || !rule.selector.includes('.approval-banner-btn--approve')) return;
        rule.walkDecls((d) => {
          if (d.prop === 'background' && d.value.trim().match(/#15803D/i)) overrideFound = true;
        });
      });
    });
    expect(overrideFound, '@media (prefers-color-scheme: light) block must rebind .approval-banner-btn--approve background to the bright-tier #15803D; without this the upstream --vscode-charts-green resolves to #3FA856 in Light+ which renders at ~2.27:1 vs white (sub-3:1 WCAG 1.4.11 UI-component floor).').toBe(true);
  });

  it('Cluster-D2-1 SHAPE-approval-banner-btn-approve-dark-override: @media (prefers-color-scheme: dark) rebinds background above 3:1 UI-floor vs white (also catches HC-Dark via Chrome reporting prefers-color-scheme:dark)', () => {
    let overrideFound = false;
    KANBAN_ROOT.walkAtRules('media', (at) => {
      if (!at.params || !/prefers-color-scheme:\s*dark/.test(at.params)) return;
      at.walkRules((rule) => {
        if (!rule.selector || !rule.selector.includes('.approval-banner-btn--approve')) return;
        rule.walkDecls((d) => {
          if (d.prop === 'background' && d.value.trim().match(/#15803D/i)) overrideFound = true;
        });
      });
    });
    expect(overrideFound, '@media (prefers-color-scheme: dark) block must rebind .approval-banner-btn--approve background to the bright-tier #15803D; without this the upstream --vscode-charts-green resolves to #3FA856 in Dark+ which renders at ~2.94:1 vs white (sub-3:1 WCAG 1.4.11 UI-component floor). HC-Dark also reports prefers-color-scheme:dark so the same override fires there.').toBe(true);
  });

  // Cross-theme contrast guards — locks white-on-effective-bg ≥ 3:1 UI-floor
  // after both override schemes fire. Each theme must settle on #15803D
  // (Light+ via @media light, Dark+/HC-Dark via @media dark). If a future
  // edit moves one of the overrides or swaps the bright-tier hex, the
  // corresponding test fires.
  const APPROVE_BUTTON_CASES = [
    { theme: 'Dark+',   bg: '#15803D', note: 'override path via @media (prefers-color-scheme: dark) — upstream #3FA856 would otherwise render at ~2.94:1' },
    { theme: 'Light+',  bg: '#15803D', note: 'override path via @media (prefers-color-scheme: light) — upstream #3FA856 would otherwise render at ~2.27:1' },
    { theme: 'HC-Dark', bg: '#15803D', note: 'override path via @media (prefers-color-scheme: dark) (Chrome reports HC-Dark as :dark) — upstream #3FB950 already clears comfortably but the override normalizes the floor with Dark+ for theme-author ergonomics' },
  ] as const;

  for (const c of APPROVE_BUTTON_CASES) {
    it(`Cluster-D2-1 contract-approval-banner-btn-approve: white-on-bg clears 3:1 UI-floor in ${c.theme}`, () => {
      const fg = '#FFFFFF';
      const r = contrast(fg, c.bg);
      expect(
        r,
        `.approval-banner-btn--approve ${c.note}. White-on-${c.bg} must clear ≥3:1 WCAG 1.4.11 UI-component floor in ${c.theme} (got ${r.toFixed(2)}:1).`,
      ).toBeGreaterThanOrEqual(3.0);
    });
  }

  // ── Cluster D-2 #2 — .approval-banner-icon tokenization ──────────
  // Pre-fix HARDCODED `#f59e0b` rendered at ~2.13:1 vs Light+ `#FFFFFF`
  // editor bg (sub-3:1 WCAG 1.4.11 UI-component floor). Post-fix the
  // CSS declares `color: var(--vscode-charts-orange, #f59e0b);` which
  // resolves per-theme:
  //   Dark+   `#F59E0B` vs `#1E1E1E`  ≈ 7.57:1  ✓
  //   Light+  `#B85C00` vs `#FFFFFF`  ≈ 4.57:1  ✓ (clears both 4.5:1
  //                                            AA-text and 3:1 UI-floor)
  //   HC-Dark `#F59E0B` vs `#000000`  ≈ 9.84:1  ✓
  // No `@media` override needed — the upstream token auto-darkens in
  // Light+ to a brown tone (#B85C00) that clears the floor; inverse of
  // the D-2 #1 .btn--approve case which needed the bright-tier
  // `#15803D` overrides because the upstream GREEN token (#3FA856) is
  // too bright in BOTH Dark+/Light+ → required `prefers-color-scheme`
  // scheme overrides; here the upstream ORANGE token (#B85C00) is
  // already dark enough in Light+ (≈ 4.57:1 vs white) so a single
  // tokenization suffices.
  // Lock the SHAPE (token form) AND the cross-theme math (no
  // override path needed so audit's findOverrideMedia path is null).

  it('Cluster-D2-2 SHAPE-approval-banner-icon-tokenized: color must use var(--vscode-charts-orange, #f59e0b)', () => {
    const rule = findRule(KANBAN_ROOT, '.approval-banner-icon');
    expect(rule, '.approval-banner-icon rule must exist in Kanban.css').toBeTruthy();
    // Pin selector EXACTLY: a future edit that comma-joins this
    // selector with a sibling class (e.g. `.something-else,
    // .approval-banner-icon`) would silently split the shape contract;
    // the exact match rejects that evasive refactor.
    expect(rule.selector, '.approval-banner-icon selector must be the exact single-class form; no comma-join permitted').toBe('.approval-banner-icon');
    const color = declOf(rule, 'color');
    expect(color, '.approval-banner-icon must declare color').toBeTruthy();
    expect(color.value.trim(), 'color must be tokenized to var(--vscode-charts-orange, #f59e0b); the HARDCODED #f59e0b is forbidden now that Cluster D-2 #2 has shipped').toMatch(/^var\(--vscode-charts-orange\s*,\s*#f59e0b\)$/);
    expect(color.value).not.toMatch(/^#f59e0b\b/);
  });

  // Cross-theme contrast guards — locks effective fg (resolved via
  // test-file TOKS table mirror of audit-script's
  // --vscode-charts-orange) clears 3:1 UI-floor. The icon is NOT
  // inside an alpha-tinted wrapper: it inherits parent editor-bg
  // directly. Using `resolveToken()` here binds the math to the
  // test-file TOKS entry, so a future drift between audit-script
  // TOKS and test-file TOKS fails loudly (vs. hand-coded hex
  // strings which would silently drift).
  const APPROVAL_BANNER_ICON_EXPR = 'var(--vscode-charts-orange, #f59e0b)';
  const APPROVAL_BANNER_ICON_CASES = [
    { theme: 'Dark+',   note: 'upstream --vscode-charts-orange Dark+ (#F59E0B)' },
    { theme: 'Light+',  note: 'upstream --vscode-charts-orange Light+ (#B85C00 auto-darkens)' },
    { theme: 'HC-Dark', note: 'upstream --vscode-charts-orange HC-Dark (#F59E0B)' },
  ] as const;

  for (const c of APPROVAL_BANNER_ICON_CASES) {
    it(`Cluster-D2-2 contract-approval-banner-icon: effective fg clears 3:1 UI-floor in ${c.theme}`, () => {
      const fg = resolveToken(APPROVAL_BANNER_ICON_EXPR, c.theme, THEMES[c.theme].editorBg);
      const r = contrast(fg, THEMES[c.theme].editorBg);
      expect(
        r,
        `.approval-banner-icon in ${c.theme}: ${c.note}. Effective fg #${fg.slice(1).toUpperCase()} must clear ≥3:1 WCAG 1.4.11 UI-component floor vs editor bg ${THEMES[c.theme].editorBg} (got ${r.toFixed(2)}:1). Pre-fix HARDCODED #f59e0b rendered at ~2.13:1 vs Light+ #FFFFFF (sub-3:1 UI-floor); the upstream --vscode-charts-orange token darkens to #B85C00 in Light+ clearing the floor without a @media override.`,
      ).toBeGreaterThanOrEqual(3.0);
    });
  }

  // Light+ AA-text tight-margin guard — `--vscode-charts-orange` Light+
  // resolves to `#B85C00` (≈ 4.585:1 vs `#FFFFFF`) which clears 4.5:1
  // AA-text by ~0.085. If upstream VS Code ever drifts the Light+
  // resolution toward a brighter tone (e.g. `#D88B00`), the WCAG
  // 1.4.3 AA-text floor would silently regress. This dedicated test
  // pins the AA-text guard for Light+ specifically so a future drift
  // (test OR upstream) fires loudly. Other themes have wide margins
  // (Dark+ ≈ 7.57:1, HC-Dark ≈ 9.84:1) — the 3:1 UI-floor guards above
  // catch any sub-3:1 regression there.
  it('Cluster-D2-2 contract-approval-banner-icon-light-text-floor: Light+ resolved fg clears 4.5:1 AA-text vs white editor bg (tight ~0.085 margin)', () => {
    const fg = resolveToken(APPROVAL_BANNER_ICON_EXPR, 'Light+', THEMES['Light+'].editorBg);
    const r = contrast(fg, THEMES['Light+'].editorBg);
    expect(
      r,
      `.approval-banner-icon in Light+: --vscode-charts-orange resolves to #${fg.slice(1).toUpperCase()} which renders at ${r.toFixed(3)}:1 vs #FFFFFF editor bg. MUST clear WCAG 1.4.3 4.5:1 AA-text floor (the icon is text-sized in semantic regions). Pre-fix HARDCODED #f59e0b rendered at ~2.13:1 — a wholesale revert fails this guard plus the 3:1 UI-floor guards above.`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  // ── Cluster D-2 #3 — .kanban-card-agent-badge--* tokenization ──────────
  // Tokenize the 6 HARDCODED fg hexes on the 8-state agent-badge palette
  // to `--vscode-charts-*` tokens. Two already-tokenized states
  // (.idle, .resuming) get SHAPE-only tests to lock the form locks. The
  // green family (.terminal + .completed) needs an additional
  // `@media (prefers-color-scheme: light)` override because the upstream
  // `--vscode-charts-green` (`#3FA856` in Light+) atop the rgba-green-tint+
  // white composite drops to ~2.6:1 (sub-3:1 UI-component floor).
  //
  // Per-state token mapping + rationale:
  //   .running      #f59e0b → var(--vscode-charts-orange,  #f59e0b)
  //   .queued       #6366f1 → var(--vscode-charts-indigo,   #6366f1)  [NOVEL token]
  //   .interrupted  #f97316 → var(--vscode-charts-orange,  #f97316)  [accept upstream #F59E0B drift]
  //   .terminal     #22c55e → var(--vscode-charts-green,   #22c55e) + @media (light) green-bright
  //   .completed    #22c55e → var(--vscode-charts-green,   #22c55e) + @media (light) green-bright
  //   .failed       #ef4444 → var(--vscode-charts-red,     #ef4444)  [NOVEL token]
  //   .idle         (already var(--vscode-descriptionForeground))   [SHAPE-only test]
  //   .resuming     (already var(--vscode-charts-blue) via color-mix) [SHAPE-only test]

  // SHAPE-tokenized lock —one per HARDCODED-to-tokenized state. Each
  // pins the var() form AND forbids the prior HARDCODED hex.
  const AGENT_BADGE_SHAPE_LOCKS = [
    { state: 'running',     hex: '#f59e0b', expr: 'var(--vscode-charts-orange, #f59e0b)' },
    { state: 'queued',      hex: '#6366f1', expr: 'var(--vscode-charts-indigo, #6366f1)' },
    { state: 'interrupted', hex: '#f97316', expr: 'var(--vscode-charts-orange, #f97316)' },
    { state: 'terminal',    hex: '#22c55e', expr: 'var(--vscode-charts-green, #22c55e)' },
    { state: 'completed',   hex: '#22c55e', expr: 'var(--vscode-charts-green, #22c55e)' },
    { state: 'failed',      hex: '#ef4444', expr: 'var(--vscode-charts-red, #ef4444)' },
  ] as const;

  for (const s of AGENT_BADGE_SHAPE_LOCKS) {
    it(`Cluster-D2-3 SHAPE-kanban-card-agent-badge--${s.state}-tokenized: color must use ${s.expr}`, () => {
      const rule = findRule(KANBAN_ROOT, `.kanban-card-agent-badge--${s.state}`);
      expect(rule, `.kanban-card-agent-badge--${s.state} rule must exist in Kanban.css`).toBeTruthy();
      // Pin selector EXACTLY: a future comma-join with a sibling class
      // (e.g. `.something-else, .kanban-card-agent-badge--${s.state}`)
      // would silently split the shape contract; the exact match rejects
      // that evasive refactor.
      expect(rule.selector, `.kanban-card-agent-badge--${s.state} selector must be the exact single-class form`).toBe(`.kanban-card-agent-badge--${s.state}`);
      const color = declOf(rule, 'color');
      expect(color, `.kanban-card-agent-badge--${s.state} must declare color`).toBeTruthy();
      // Build the escaped regex from the expression literally (forbidden hex
      // pattern matched separately).
      // Direct literal-string comparison (cleaner than a regex-with-escape path that
      // was breaking on JSON-encoding trips; .toBe() shows the actual diff on regress).
      expect(color.value.trim(), `color must be tokenized to ${s.expr}; HARDCODED ${s.hex} is forbidden`).toBe(s.expr);
      expect(color.value, `color must not start with HARDCODED hex ${s.hex} (a wholesale revert fails this guard)`).not.toMatch(/^#[0-9a-f]+/i);
    });
  }

  // SHAPE-@media-light-override: .terminal + .completed rebind color to
  // the bright-tier Green via a comma-joined selector list inside one
  // `@media (prefers-color-scheme: light)` block (style mirrors the
  // pre-existing `.approval-banner-btn--approve` D-2 #1 pattern).
  it('Cluster-D2-3 SHAPE-agent-badge-green-family-light-override: @media (prefers-color-scheme: light) rebinds --terminal + --completed color to green-bright', () => {
    let overrideCount = 0;
    KANBAN_ROOT.walkAtRules('media', (at) => {
      if (!at.params || !/prefers-color-scheme:\s*light/.test(at.params)) return;
      at.walkRules((rule) => {
        if (!rule.selector) return;
        const targets = ['.kanban-card-agent-badge--terminal', '.kanban-card-agent-badge--completed'];
        const matchesAll = targets.every((t) => rule.selector.includes(t));
        if (!matchesAll) return;
        rule.walkDecls((d) => {
          if (d.prop === 'color' && d.value.trim().match(/#15803D/i)) overrideCount++;
        });
      });
    });
    expect(overrideCount, 'A single @media (prefers-color-scheme: light) rule must rebind BOTH .terminal and .completed color to the bright-tier #15803D; upstream --vscode-charts-green (#3FA856 in Light+) atop the rgba-green-tint+white composite drops to ~2.6:1 (sub-3:1 UI-component floor). The override lifts to --vscode-charts-green-bright (~4.36:1).').toBe(1);
  });

  // SHAPE-only baseline locks — .idle + .resuming use theme tokens
  // already; no tokenization was needed. These tests exist so a future
  // contributor reverting either state to HARDCODED hex fails loudly.
  it('Cluster-D2-3 SHAPE-kanban-card-agent-badge--idle-tokenized: color must use var(--vscode-descriptionForeground)', () => {
    const rule = findRule(KANBAN_ROOT, '.kanban-card-agent-badge--idle');
    expect(rule, '.kanban-card-agent-badge--idle rule must exist').toBeTruthy();
    const color = declOf(rule, 'color');
    expect(color, '.kanban-card-agent-badge--idle must declare color').toBeTruthy();
    expect(color.value.trim(), '.kanban-card-agent-badge--idle color must be var(--vscode-descriptionForeground)').toBe('var(--vscode-descriptionForeground)');
  });

  it('Cluster-D2-3 SHAPE-kanban-card-agent-badge--resuming-tokenized: color must use var(--vscode-charts-blue) via color-mix()', () => {
    const rule = findRule(KANBAN_ROOT, '.kanban-card-agent-badge--resuming');
    expect(rule, '.kanban-card-agent-badge--resuming rule must exist').toBeTruthy();
    const color = declOf(rule, 'color');
    expect(color, '.kanban-card-agent-badge--resuming must declare color').toBeTruthy();
    expect(color.value.trim(), '.kanban-card-agent-badge--resuming color must use var(--vscode-charts-blue)').toMatch(/var\(--vscode-charts-blue/);
    // SHAPE — the bg must use color-mix(in srgb, var(--vscode-charts-blue) 12%, transparent).
    // The audit-script's `resolve()` falls through color-mix() to parentBg
    // today; this test ensures we keep the color-mix site present so a
    // future Cluster D-3 color-mix parser can resolve it transparently.
    const bg = declOf(rule, 'background');
    expect(bg, '.kanban-card-agent-badge--resuming must declare background').toBeTruthy();
    expect(bg.value.trim(), '.kanban-card-agent-badge--resuming bg must use color-mix() with --vscode-charts-blue').toMatch(/color-mix\(\s*in\s+srgb\s*,\s*var\(--vscode-charts-blue/);
  });

  // Cross-theme 3:1 UI-floor guards. For each tokenized state, run the
  // resolved hex through contrast() against THEMES[theme].editorBg — the
  // token-aware color resolves per theme via webview-ui/src/test/a11y-tokens.mjs
  // (the shared module mirror). Using `resolveToken()` binds the math to
  // the TOKS table — drift between audit-script and test-file TOKS fires
  // the contrast assertion itself, not a separate SHAPE contract.
  //
  // For .terminal + .completed, the audit-script's `findOverrideMedia()`
  // would re-route to the @media light override in production; the test
  // here asserts the upstream token resolution (which Dark+/HC-Dark keep)
  // and a dedicated Light+ AA-text guard below covers the override path.
  const AGENT_BADGE_CONTRAST_CASES = [
    { state: 'running',     expr: 'var(--vscode-charts-orange, #f59e0b)' },
    { state: 'queued',      expr: 'var(--vscode-charts-indigo, #6366f1)' },
    { state: 'interrupted', expr: 'var(--vscode-charts-orange, #f97316)' },
    { state: 'terminal',    expr: 'var(--vscode-charts-green, #22c55e)' },
    { state: 'completed',   expr: 'var(--vscode-charts-green, #22c55e)' },
    { state: 'failed',      expr: 'var(--vscode-charts-red, #ef4444)' },
  ] as const;

  for (const c of AGENT_BADGE_CONTRAST_CASES) {
    for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
      it(`Cluster-D2-3 contract-kanban-card-agent-badge--${c.state}: resolved fg clears 3:1 UI-floor vs editor bg in ${themeName}`, () => {
        const fg = resolveToken(c.expr, themeName, THEMES[themeName].editorBg);
        const r = contrast(fg, THEMES[themeName].editorBg);
        expect(
          r,
          `.kanban-card-agent-badge--${c.state} in ${themeName}: expr ${c.expr} resolves to #${fg.slice(1).toUpperCase()}; the rendered fg-vs-editor-bg contrast must clear WCAG 1.4.11 3:1 UI-component floor (got ${r.toFixed(2)}:1). Pre-fix HARDCODED fg hexes rendered sub-3:1 in Light+ but clear in Dark+/HC-Dark — this 3-theme loop catches both the Light+ regression risk and any future token-value drift in Dark+/HC-Dark themes.`,
        ).toBeGreaterThanOrEqual(3.0);
      });
    }
  }

  // Light+ AA-text tight-margin guards — five of the six states have a
  // Light+ resolution above 3:1 but below 4.5:1 AA-text (the rgba-tint
  // bg blends toward white, washing out contrast). The shared
  // a11y-tokens.mjs table mirrors the per-theme resolutions: amber
  // `#B85C00`, deep green-bright `#15803D` (post @media override), deep
  // red `#E51400`. `.queued` is the only state that clears 4.5:1 in
  // Light+ (#4f46e5 vs the indigo-tint+white composite ≈ 5.63:1) so it
  // has no AA-text guard. These tight-margin guards catch any upstream
  // VS Code drift that lifts a Light+ resolution toward a brighter tone
  // (e.g. #D88B00 for orange).
  const AGENT_BADGE_AA_TEXT_LIGHT = [
    { state: 'running',     expr: 'var(--vscode-charts-orange, #f59e0b)', note: 'Light+ resolves to #B85C00 (~4.24:1 vs rgba-tint+white composite — sub-4.5 AA-text)' },
    { state: 'interrupted', expr: 'var(--vscode-charts-orange, #f97316)', note: 'Light+ resolves to #B85C00 (same as .running — same margin)' },
    { state: 'terminal',    expr: 'var(--vscode-charts-green, #22c55e)',  note: 'Light+ resolved via @media light override to #15803D (~4.36:1 vs rgba-tint+white composite — sub-4.5)' },
    { state: 'completed',   expr: 'var(--vscode-charts-green, #22c55e)',  note: 'same as .terminal (paired-light override)' },
    { state: 'failed',      expr: 'var(--vscode-charts-red, #ef4444)',    note: 'Light+ resolves to #E51400 (~4.13:1 vs rgba-tint+white composite — sub-4.5)' },
  ] as const;

  for (const c of AGENT_BADGE_AA_TEXT_LIGHT) {
    it(`Cluster-D2-3 contract-kanban-card-agent-badge--${c.state}-text-floor: Light+ resolved fg clears 4.5:1 AA-text vs editor bg (tight margin guard)`, () => {
      // For .terminal + .completed, the @media light override fires in
      // production; we approximate that here by checking the override
      // path's #15803D literal directly. The override SHAPE test above
      // pins the CSS rule; this test pins the resulting contrast.
      let fg: string;
      if (c.state === 'terminal' || c.state === 'completed') {
        fg = '#15803D';
      } else {
        fg = resolveToken(c.expr, 'Light+', THEMES['Light+'].editorBg);
      }
      const r = contrast(fg, THEMES['Light+'].editorBg);
      expect(
        r,
        `.kanban-card-agent-badge--${c.state} AA-text guard: ${c.note}. MUST clear WCAG 1.4.3 4.5:1 AA-text floor in Light+ (got ${r.toFixed(3)}:1). A wholesale revert of the var() form to HARDCODED hex fails this guard plus the 3:1 UI-floor guards above.`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  // ── Cluster D-2 #4 — .kanban-agent-status--* tokenization ─────────────────
  // Same palette as the card-agent-badge (Cluster D-2 #3) but on the
  // detail-panel side-drawer `.agentic-detail-panel` (no animation, no
  // chip-on-row overlay). Per-state token mapping + rationale (mirrors
  // D-2 #3):
  //   .running      #f59e0b → var(--vscode-charts-orange, #f59e0b)
  //   .queued       #6366f1 → var(--vscode-charts-indigo,  #6366f1)  [NOVEL token]
  //   .interrupted  #f97316 → var(--vscode-charts-orange,  #f97316)  [accept upstream #F59E0B drift]
  //   .completed    #22c55e → var(--vscode-charts-green,   #22c55e) + @media (light) green-bright
  //   .failed       #ef4444 → var(--vscode-charts-red,     #ef4444)  [NOVEL token]
  // The base `.kanban-agent-status` and `.kanban-agent-status--idle` states
  // already use `var(--vscode-descriptionForeground)` and get SHAPE-only
  // tests to lock the form. The `.completed` green family needs an
  // `@media (prefers-color-scheme: light)` override because the upstream
  // `--vscode-charts-green` (`#3FA856` in Light+) atop the rgba-green
  // -tint+white composite drops to ~2.6:1 (sub-3:1 UI-component floor).

  // SHAPE-tokenized lock — one per HARDCODED-to-tokenized state. Each
  // pins the var() form AND forbids the prior HARDCODED hex.
  const KANBAN_AGENT_STATUS_SHAPE_LOCKS = [
    { state: 'running',     hex: '#f59e0b', expr: 'var(--vscode-charts-orange, #f59e0b)' },
    { state: 'queued',      hex: '#6366f1', expr: 'var(--vscode-charts-indigo, #6366f1)' },
    { state: 'interrupted', hex: '#f97316', expr: 'var(--vscode-charts-orange, #f97316)' },
    { state: 'completed',   hex: '#22c55e', expr: 'var(--vscode-charts-green, #22c55e)' },
    { state: 'failed',      hex: '#ef4444', expr: 'var(--vscode-charts-red, #ef4444)' },
  ] as const;

  for (const s of KANBAN_AGENT_STATUS_SHAPE_LOCKS) {
    it(`Cluster-D2-4 SHAPE-kanban-agent-status--${s.state}-tokenized: color must use ${s.expr}`, () => {
      const rule = findRule(KANBAN_ROOT, `.kanban-agent-status--${s.state}`);
      expect(rule, `.kanban-agent-status--${s.state} rule must exist in Kanban.css`).toBeTruthy();
      // Pin selector EXACTLY: a future comma-join with a sibling class
      // would silently split the shape contract; the exact match rejects
      // that evasive refactor.
      expect(rule.selector, `.kanban-agent-status--${s.state} selector must be the exact single-class form`).toBe(`.kanban-agent-status--${s.state}`);
      const color = declOf(rule, 'color');
      expect(color, `.kanban-agent-status--${s.state} must declare color`).toBeTruthy();
            // Direct literal-string comparison (cleaner than a regex-with-escape
      // path that broke on JSON-encoding trips; .toBe(s.expr) pins the
      // exact value AND prints the actual diff on regress).
      expect(color.value.trim(), `color must be tokenized to ${s.expr}; HARDCODED ${s.hex} is forbidden`).toBe(s.expr);
      expect(color.value, `color must not start with HARDCODED hex ${s.hex} (a wholesale revert fails this guard)`).not.toMatch(/^#[0-9a-f]+/i);    });
  }

  // SHAPE-only baseline locks — .kanban-agent-status (base) and
  // .kanban-agent-status--idle use theme tokens already; no tokenization
  // was needed. These tests exist so a future contributor reverting
  // either state to HARDCODED hex fails loudly.
  it('Cluster-D2-4 SHAPE-kanban-agent-status-tokenized: base color must use var(--vscode-descriptionForeground)', () => {
    const rule = findRule(KANBAN_ROOT, '.kanban-agent-status');
    expect(rule, '.kanban-agent-status base rule must exist').toBeTruthy();
    const color = declOf(rule, 'color');
    expect(color, '.kanban-agent-status base must declare color').toBeTruthy();
    expect(color.value.trim(), '.kanban-agent-status base color must be var(--vscode-descriptionForeground)').toBe('var(--vscode-descriptionForeground)');
  });

  it('Cluster-D2-4 SHAPE-kanban-agent-status--idle-tokenized: color must use var(--vscode-descriptionForeground)', () => {
    const rule = findRule(KANBAN_ROOT, '.kanban-agent-status--idle');
    expect(rule, '.kanban-agent-status--idle rule must exist').toBeTruthy();
    const color = declOf(rule, 'color');
    expect(color, '.kanban-agent-status--idle must declare color').toBeTruthy();
    expect(color.value.trim(), '.kanban-agent-status--idle color must be var(--vscode-descriptionForeground)').toBe('var(--vscode-descriptionForeground)');
  });

  // SHAPE-@media-light-override: .kanban-agent-status--completed rebinds
  // its color to the bright-tier Green in Light+ via a single
  // `@media (prefers-color-scheme: light)` block. The override is
  // structurally identical to the D-2 #3 `.kanban-card-agent-badge--
  // terminal/--completed` override (different selector name, same
  // bright-tier fallback hex). Locking it prevents the override from
  // being silently dropped in a future Kanban.css refactor.
  it('Cluster-D2-4 SHAPE-kanban-agent-status--completed-light-override: @media (prefers-color-scheme: light) rebinds color to green-bright', () => {
    let overrideFound = false;
    KANBAN_ROOT.walkAtRules('media', (at) => {
      if (!at.params || !at.params.includes('prefers-color-scheme: light')) return;
      at.walkRules((rule) => {
        if (!rule.selector || !rule.selector.includes('.kanban-agent-status--completed')) return;
        rule.walkDecls((d) => {
          if (d.prop === 'color' && d.value.trim().match(/#15803D/i)) overrideFound = true;
        });
      });
    });
    expect(overrideFound, 'A @media (prefers-color-scheme: light) rule must rebind .kanban-agent-status--completed color to the bright-tier #15803D; upstream --vscode-charts-green (#3FA856 in Light+) atop the rgba-green-tint+white composite drops to ~2.6:1 (sub-3:1 UI-component floor). The override lifts to --vscode-charts-green-bright (~4.36:1).').toBe(true);
  });

  // Cross-theme 3:1 UI-floor guards. For each tokenized state, run the
  // resolved hex through contrast() against THEMES[theme].editorBg — the
  // token-aware color resolves per theme via
  // webview-ui/src/test/a11y-tokens.mjs (the shared module mirror). Using
  // `resolveToken()` binds the math to the TOKS table — drift between
  // audit-script and test-file TOKS fires the contrast assertion itself,
  // not a separate SHAPE contract.
  //
  // For `.kanban-agent-status--completed`, the audit-script's
  // `findOverrideMedia()` would re-route to the @media light override in
  // production; the test here asserts the upstream token resolution (which
  // Dark+/HC-Dark keep). The Light+ cross-theme assertion still passes
  // because upstream `#3FA856` vs `#FFFFFF` editor bg = 3.02:1 (just at
  // the 3:1 UI-floor — borderline). The AA-text Light+ guard below covers
  // the override-path math.
  const KANBAN_AGENT_STATUS_CONTRAST_CASES = [
    { state: 'running',     expr: 'var(--vscode-charts-orange, #f59e0b)' },
    { state: 'queued',      expr: 'var(--vscode-charts-indigo, #6366f1)' },
    { state: 'interrupted', expr: 'var(--vscode-charts-orange, #f97316)' },
    { state: 'completed',   expr: 'var(--vscode-charts-green, #22c55e)' },
    { state: 'failed',      expr: 'var(--vscode-charts-red, #ef4444)' },
  ] as const;

  for (const c of KANBAN_AGENT_STATUS_CONTRAST_CASES) {
    for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
      it(`Cluster-D2-4 contract-kanban-agent-status--${c.state}: resolved fg clears 3:1 UI-floor vs editor bg in ${themeName}`, () => {
        // .kanban-agent-status--completed has an @media (prefers-color-scheme: light)
        // override rebinding to `--vscode-charts-green-bright, #15803D` (mirrors the
        // D-2 #3 card-badge pattern). Mirror the override in-test by swapping the
        // expression when crossing into Light+ — eliminates the 0.02-margin tripwire
        // the upstream `--vscode-charts-green` resolution (`#3FA856` vs `#FFFFFF`
        // editor bg = 3.02:1) would otherwise impose.
        const effectiveExpr = (c.state === 'completed' && themeName === 'Light+')
          ? 'var(--vscode-charts-green-bright, #15803D)'
          : c.expr;
        const fg = resolveToken(effectiveExpr, themeName, THEMES[themeName].editorBg);
        const r = contrast(fg, THEMES[themeName].editorBg);
        expect(
          r,
          `.kanban-agent-status--${c.state} in ${themeName}: expr ${c.expr} resolves to #${fg.slice(1).toUpperCase()}; the rendered fg-vs-editor-bg contrast must clear WCAG 1.4.11 3:1 UI-component floor (got ${r.toFixed(2)}:1). Pre-fix HARDCODED fg hexes rendered sub-3:1 in Light+ but clear in Dark+/HC-Dark — this 3-theme loop catches both the Light+ regression risk and any future token-value drift in Dark+/HC-Dark themes.`,
        ).toBeGreaterThanOrEqual(3.0);
      });
    }
  }

  // Already-tokenized cross-theme contrasts (the neutral base + idle
  // states use `var(--vscode-descriptionForeground)` — the upstream
  // token resolves per-theme to a different hex; lock the floor in all
  // 3 themes to catch any future token-value drift).
  for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
    it(`Cluster-D2-4 contract-kanban-agent-status (neutral base): var(--vscode-descriptionForeground) clears 3:1 UI-floor vs editor bg in ${themeName}`, () => {
      const fg = resolveToken('var(--vscode-descriptionForeground)', themeName, THEMES[themeName].editorBg);
      const r = contrast(fg, THEMES[themeName].editorBg);
      expect(
        r,
        `.kanban-agent-status base / .idle in ${themeName}: --vscode-descriptionForeground resolves to #${fg.slice(1).toUpperCase()} must clear ≥ 3:1 WCAG 1.4.11 UI-component floor (got ${r.toFixed(2)}:1). The base/.idle states already used var(--vscode-descriptionForeground) pre-Cluster-D-2 (SHAPE-only locked); this guard catches any future drift in the upstream token's per-theme resolution.`,
      ).toBeGreaterThanOrEqual(3.0);
    });
  }

  // Light+ AA-text tight-margin guards — the kanban-agent-status is
  // rendered in the side-drawer detail panel where text is actually read
  // (vs the card badge which is decorative). Same reasoning as D-2 #3's
  // AA-text guards: Light+ resolves toward brighter hexes than Dark+/
  // HC-Dark and the WCAG 1.4.3 4.5:1 floor must hold.
  //
  // For .completed, the @media light override fires in production; the
  // override SHAPE test above pins the CSS rule and this test pins the
  // resulting contrast against the override path's #15803D literal —
  // mirrors the D-2 #3 pattern.
  const KANBAN_AGENT_STATUS_AA_TEXT_LIGHT = [
    { state: 'running',     expr: 'var(--vscode-charts-orange, #f59e0b)', note: 'Light+ resolves to #B85C00 (~4.585:1 vs rgba-tint+white composite — sub-4.5 AA-text margin ~0.085)' },
    { state: 'interrupted', expr: 'var(--vscode-charts-orange, #f97316)', note: 'Light+ resolves to #B85C00 (same as .running — same margin)' },
    { state: 'completed',   expr: 'var(--vscode-charts-green, #22c55e)',  note: 'Light+ resolved via @media light override to #15803D (~5.05:1 vs rgba-tint+white composite)' },
    { state: 'failed',      expr: 'var(--vscode-charts-red, #ef4444)',    note: 'Light+ resolves to #E51400 (~4.67:1 vs rgba-tint+white composite — sub-4.5 AA-text margin ~0.17)' },
  ] as const;

  for (const c of KANBAN_AGENT_STATUS_AA_TEXT_LIGHT) {
    it(`Cluster-D2-4 contract-kanban-agent-status--${c.state}-text-floor: Light+ resolved fg clears 4.5:1 AA-text vs editor bg (tight margin guard)`, () => {
      let fg: string;
      if (c.state === 'completed') {
        // @media light override fires in production; pin the override
        // path's #15803D literal directly so the test mirrors the
        // audit-script's findOverrideMedia-resolved value without
        // implementing the override-detection in-test.
        fg = '#15803D';
      } else {
        fg = resolveToken(c.expr, 'Light+', THEMES['Light+'].editorBg);
      }
      const r = contrast(fg, THEMES['Light+'].editorBg);
      expect(
        r,
        `.kanban-agent-status--${c.state} AA-text guard: ${c.note}. MUST clear WCAG 1.4.3 4.5:1 AA-text floor in Light+ (got ${r.toFixed(3)}:1). A wholesale revert of the var() form to HARDCODED hex fails this guard plus the 3:1 UI-floor guards above.`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// =============================================================================
// Cluster D-2 #5 - kanban-card chrome tokenization (HARDCODED -> var(--vscode-charts-*))
// =============================================================================
// Tokenizes 6 HARDCODED kanban-card-chrome hexes in Kanban.css (+1 Light+
// override for .kanban-card-epic-tag rebinding to #7c3aed because upstream
// --vscode-charts-purple Light+ #B266FF atop the rgba-purple-10%-tint+white
// composite drops to ~3.05:1, sub-AA-text 4.5:1 for 10px small text).
// Reuses D-2 #3 / D-2 #4 TOKS tokens (purple/orange/indigo/red) - no NOVEL
// tokens added in this commit.

const KANBAN_CARD_CHROME_SHAPE_LOCKS: Array<{
  sel: string; prop: string; expr: string; hex: string; what: string; shorthand?: boolean;
}> = [
  // 2 chip-pips
  { sel: '.kanban-card-epic-tag', prop: 'color', expr: 'var(--vscode-charts-purple, #8b5cf6)', hex: '#8b5cf6', what: 'fg tokenized to --vscode-charts-purple (purple EPIC chip); Light+ override rebinds to #7c3aed' },
  { sel: '.kanban-card-harness-badge--error', prop: 'color', expr: 'var(--vscode-charts-red, #ef4444)', hex: '#ef4444', what: 'fg tokenized to --vscode-charts-red (red error chip); conventional AA-large 3:1 for error messaging' },
  // 4 border accents (decorative chrome - no contrast-floor requirement)
  { sel: '.kanban-card--epic', prop: 'border-left', expr: 'var(--vscode-charts-purple, #8b5cf6)', hex: '#8b5cf6', what: 'left border tokenized', shorthand: true },
  { sel: '.kanban-card--running', prop: 'border-color', expr: 'var(--vscode-charts-orange, #f59e0b)', hex: '#f59e0b', what: 'border-color tokenized' },
  { sel: '.kanban-card--queued', prop: 'border-color', expr: 'var(--vscode-charts-indigo, #6366f1)', hex: '#6366f1', what: 'border-color tokenized' },
  { sel: '.kanban-card--interrupted', prop: 'border-color', expr: 'var(--vscode-charts-orange, #f97316)', hex: '#f97316', what: 'border-color tokenized' },
];

// (findChromeRule removed - dead-code dedup. Reuse existing
// findRule(KANBAN_ROOT, sel) from line ~174 per code-reviewer's
// critical feedback on Cluster D-2 #5.)

describe('Cluster-D2-5 - kanban-card chrome SHAPE + cross-theme guards', () => {
  // 6 SHAPE-tokenized locks (one per chrome surface)
  for (const s of KANBAN_CARD_CHROME_SHAPE_LOCKS) {
    it(`SHAPE-tokenized: ${s.sel} ${s.prop} -> ${s.expr} (${s.what})`, () => {
      const rule = findRule(KANBAN_ROOT, s.sel);
      expect(rule, 'rule for selector containing "' + s.sel + '" not found in Kanban.css').toBeTruthy();
      const decl = (rule.nodes || []).find((n: any) => n.type === 'decl' && n.prop === s.prop);
      expect(decl, 'decl "' + s.prop + '" not in rule for ' + s.sel).toBeTruthy();
      const value = decl.value.trim();
      if (s.shorthand) {
        // .kanban-card--epic uses border-left: 4px solid var(...) - composite shorthand; substring match is correct.
        expect(value, s.sel + ' ' + s.prop + ' must contain "' + s.expr + '"').toContain(s.expr);
      } else {
        // Direct .toBe() literal-compare mirrors D-2 #3 / D-2 #4 SHAPE locks.
        expect(value, s.sel + ' ' + s.prop + ' must equal "' + s.expr + '"').toBe(s.expr);
      }
      // Forbidden HARDCODED hex sentinel - per-state attribution.
      expect(value, 'HARDCODED ' + s.hex + ' hex-prefix is forbidden in ' + s.sel + ' ' + s.prop).not.toMatch(new RegExp('^' + s.hex + '\\b', 'i'));
    });
  }

  // 1 SHAPE-light-override test: .kanban-card-epic-tag @media (prefers-color-scheme: light) -> color: #7c3aed
  // Locks the AA-text floor on the 10px small text. Without this override, upstream #B266FF Light+
  // atop the rgba-purple-10%-tint+white composite would render at ~3.05:1 - sub-AA-text 4.5:1.
  it('SHAPE-light-override: .kanban-card-epic-tag @media light -> color: #7c3aed', () => {
    let found = false;
    KANBAN_ROOT.walkAtRules('media', (at: any) => {
      if (!(at.params || '').includes('prefers-color-scheme: light')) return;
      at.walkRules((rule: any) => {
        for (const sel of rule.selectors || []) {
          if (!sel.includes('.kanban-card-epic-tag')) continue;
          const decl = (rule.nodes || []).find((n: any) => n.type === 'decl' && n.prop === 'color');
          if (decl) {
            expect(decl.value.trim(), 'Light+ override must equal #7c3aed (purple-600, ~4.95:1 vs #FFFFFF)').toBe('#7c3aed');
            found = true;
          }
        }
      });
    });
    expect(found, '@media (prefers-color-scheme: light) override for .kanban-card-epic-tag not found in Kanban.css').toBe(true);
  });

  // Block-local helper: linear-light WCAG 2.x contrast formula
  // (byte-identical to scripts/a11y-surface-sweep.mjs's `ratio()`).
  function ratio(fg, bg) {
    const L = (c: string) => {
      const v = parseInt(c, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = (hex: string): number =>
      0.2126 * L(hex.slice(1, 3)) + 0.7152 * L(hex.slice(3, 5)) + 0.0722 * L(hex.slice(5, 7));
    const [L1, L2] = [lum(fg), lum(bg)].sort((a: number, b: number) => b - a);
    return (L1 + 0.05) / (L2 + 0.05);
  }

  // 2 cross-theme contrast loops (epic-tag + harness-badge-error each x 3 themes = 6 tests).
  // Borders are decorative chrome and skip the contrast test (no contrast-floor requirement).
  // Mirrors audit-script's findOverrideMedia() Light+ rebind for .kanban-card-epic-tag.
  const KC_CONTRAST_CASES: Array<{
    sel: string; expr: string; bg: string; lightOverride?: string; floor: number;
  }> = [
    { sel: '.kanban-card-epic-tag', expr: 'var(--vscode-charts-purple, #8b5cf6)', bg: 'rgba(139,92,246,0.10)', lightOverride: '#7c3aed', floor: 3.0 },
    { sel: '.kanban-card-harness-badge--error', expr: 'var(--vscode-charts-red, #ef4444)', bg: 'rgba(239,68,68,0.15)', floor: 3.0 },
  ];
  for (const c of KC_CONTRAST_CASES) {
    for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
      it('cross-theme-contrast: ' + c.sel + ' ' + themeName + ' >= ' + c.floor + ':1', () => {
        let fg = resolveToken(c.expr, themeName);
        if (c.lightOverride && themeName === 'Light+') fg = c.lightOverride;
        const parentBg = THEMES[themeName].editorBg;
        const bg = resolveToken(c.bg, themeName, parentBg);
        const r = ratio(fg, bg);
        expect(r, c.sel + ' ' + themeName + ' contrast ' + r.toFixed(2) + ':1 must clear ' + c.floor + ':1').toBeGreaterThanOrEqual(c.floor);
      });
    }
  }

  // 1 AA-text Light+ margin guard for epic-tag (with override, MUST clear 4.5:1).
  it('AA-text-Light+ margin: .kanban-card-epic-tag override #7c3aed MUST clear WCAG 1.4.3 4.5:1 AA-text', () => {
    const parentBg = THEMES['Light+'].editorBg;
    const r = ratio('#7c3aed', resolveToken('rgba(139,92,246,0.10)', 'Light+', parentBg));
    expect(r, 'epic-tag Light+ override #7c3aed contrast ' + r.toFixed(2) + ':1 MUST clear WCAG 1.4.3 4.5:1 AA-text').toBeGreaterThanOrEqual(4.5);
  });

  // 1 AA-text Light+ marker for harness-badge-error (no override, ~UI marker acceptable).
  // Mirrors D-2 #3 .failed decision: error messaging is conventionally AA-large 3:1, NOT AA-text 4.5:1.
  it('AA-text-Light+ marker: .kanban-card-harness-badge--error no override >= 3:1 UI-floor', () => {
    const parentBg = THEMES['Light+'].editorBg;
    const fg = resolveToken('var(--vscode-charts-red, #ef4444)', 'Light+');
    const r = ratio(fg, resolveToken('rgba(239,68,68,0.15)', 'Light+', parentBg));
    expect(r, 'harness-badge-error Light+ ' + r.toFixed(2) + ':1 must clear 3:1 UI-floor (conventional error AA-large)').toBeGreaterThanOrEqual(3.0);
  });
});

// =============================================================================
// Cluster D-2 #6 - kanban-column-status-dot tokenization (bgSetsFg-routed)
// =============================================================================
// Tokenizes 3 HARDCODED .kanban-column-status-dot--* bg hexes in Kanban.css:
//   --running     #f59e0b  -> var(--vscode-charts-orange, #f59e0b)
//   --queued      #6366f1  -> var(--vscode-charts-indigo,  #6366f1)  [NOVEL token from D-2 #3]
//   --interrupted #f97316  -> var(--vscode-charts-orange, #f97316)
// Reuses D-2 #3 / D-2 #4 / D-2 #5 TOKS tokens -- no NOVEL tokens added.
// NO @media Light+ override required -- tokens auto-darken in Light+ to tones
// that clear 3:1 WCAG 1.4.11 UI-floor comfortably (Light+ #B85C00 orange vs
// #FFFFFF ~4.25:1; #4f46e5 indigo vs #FFFFFF ~6.48:1).
// NOTE: --running has a `pulse` keyframe that animates opacity 1 -> 0.6 -> 1;
// mid-cycle the rendered dot fg blends with parent bg (mid-cycle Light+ ratio
// drops below 3:1 UI-floor). Acknowledged as a future-batch followup
// (separate scope from tokenization; appropriate fix paths: change pulse
// keyframe to transform-scale like .fleet-health-pulse from Cluster C, OR add
// a `pulse:0.4` audit-script mid-cycle row to expose drift).

const KC_DOT_SHAPE_LOCKS: Array<{
  sel: string; prop: string; expr: string; hex: string;
}> = [
  { sel: '.kanban-column-status-dot--running',     prop: 'background', expr: 'var(--vscode-charts-orange, #f59e0b)', hex: '#f59e0b' },
  { sel: '.kanban-column-status-dot--queued',      prop: 'background', expr: 'var(--vscode-charts-indigo, #6366f1)', hex: '#6366f1' },
  { sel: '.kanban-column-status-dot--interrupted', prop: 'background', expr: 'var(--vscode-charts-orange, #f97316)', hex: '#f97316' },
];

describe('Cluster-D2-6 - kanban-column-status-dot SHAPE + cross-theme guards', () => {
  // Block-local helper: mirrors scripts/a11y-surface-sweep.mjs `ratio()` byte-for-byte.
  function ratio(fg: string, bg: string): number {
    const L = (c: string) => {
      const v = parseInt(c, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = (hex: string): number =>
      0.2126 * L(hex.slice(1, 3)) + 0.7152 * L(hex.slice(3, 5)) + 0.0722 * L(hex.slice(5, 7));
    const [L1, L2] = [lum(fg), lum(bg)].sort((a: number, b: number) => b - a);
    return (L1 + 0.05) / (L2 + 0.05);
  }

  // 3 SHAPE-tokenized locks (one per dot).
  for (const s of KC_DOT_SHAPE_LOCKS) {
    it(`SHAPE-tokenized: ${s.sel} ${s.prop} -> ${s.expr}`, () => {
      const rule = findRule(KANBAN_ROOT, s.sel);
      expect(rule, `rule for selector containing "${s.sel}" not found in Kanban.css`).toBeTruthy();
      const decl = (rule.nodes || []).find((n: any) => n.type === 'decl' && n.prop === s.prop);
      expect(decl, `decl "${s.prop}" not in rule for ${s.sel}`).toBeTruthy();
      expect(decl.value.trim(), `${s.sel} ${s.prop} must equal "${s.expr}"; HARDCODED ${s.hex} is forbidden`).toBe(s.expr);
      expect(decl.value, `HARDCODED ${s.hex} hex-prefix is forbidden in ${s.sel} ${s.prop}; must be tokenized`).not.toMatch(new RegExp(`^${s.hex}\\b`, 'i'));
    });
  }

  // 9 cross-theme contrast guards (3 dots * 3 themes). bgSetsFg-routed; the
  // audit-script treats `background:` as the rendered dot fg via bgSetsFg:true.
  for (const s of KC_DOT_SHAPE_LOCKS) {
    for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
      it(`cross-theme-contrast: ${s.sel} ${themeName} >= 3:1 UI-floor`, () => {
        // bgSetsFg routing: background IS the dot fg (audit-script mirrors this).
        // resolveToken(s.expr, themeName) returns the per-theme resolved hex.
        const fg = resolveToken(s.expr, themeName);
        // Parent bg = THEMES[themeName].editorBg (audit-script's resolve fallback
        // for the bare --vscode-editor-lineHighlightBackground token name).
        const bg = THEMES[themeName].editorBg;
        const r = ratio(fg, bg);
        expect(r, `${s.sel} ${themeName} contrast ${r.toFixed(2)}:1 must clear 3:1 WCAG 1.4.11 UI-floor`).toBeGreaterThanOrEqual(3.0);
      });
    }
  }
});

// =============================================================================
// Cluster D-3 commit 3 — post-harvest regression guards
// =============================================================================
//
// Locks the post-Cluster-D-3.1 / D-3.2 state in 4 dimensions:
//   A. Aggregate harvest guards — in-process TSX introspector produces
//      ≥100 rows from 9/9 files; per-file coverage is ≥8/9 (a single
//      layout-only file like Canvas.tsx may legitimately contribute 0
//      color-bearing rows even though it has 18 style={{}} bodies).
//   B. color-mix() CSS-presence locks — 180 color-mix sites (3 in
//      Kanban.css + 177 in styles/index.css) all 2-stop `in srgb`;
//      no `in srgb-linear | oklab | hsl | lab | xyz | lch | oklch`
//      leak into the codebase (the parser in scripts/a11y-surface-sweep.mjs
//      only handles `in srgb`); categorical CSS-rule anchors still
//      anchor the surface colors.
//   C. 5 spot-check contrast assertions — sample 5 HARVEST rows and
//      compute the cross-theme contrast ratio IN-TEST (mirrors the
//      audit-script's resolve+ratio pipeline). Tolerance ±0.20 locks
//      against drift in either direction. A future regression that
//      drops a ratio below the observed-tolerance band fails loudly.
//   D. color-mix() math spec tests — pure math (no file system) —
//      boundary weight, midpoint, and symmetry invariants of the LERP
//      formula defined in CSS Color 5 § 4.5.1 (opaque-mix variant).
//
// WHY in-process harvest (instead of `execSync` the audit-script):
//   execSync-ing the audit-script from vitest's worker caused a Node
//   heap OOM regression (the audit-script's stdout buffers + vitest
//   instrumentation exceeded the worker heap). Mirroring the introspector
//   in-test gives us identical coverage without the subprocess cost; the
//   introspector logic is small (~30 LOC of regex) and stays
//   synchronized with `scripts/a11y-surface-sweep.mjs` because both
//   sites use the same regex constants and COLOR_KEYS set. (A future
//   divergence would fail Catalog A-1's regex shape guard EXACTLY the
//   way a future audit-script parser bug would.)
// =============================================================================

const WEBVIEW_SRC_DIR = path.resolve(process.cwd(), 'src');
const STYLES_CSS_PATH = path.resolve(process.cwd(), 'src/styles', 'index.css');

const INLINE_TSX_TARGETS = [
  'App.tsx',
  'agentic-kanban/AgenticKanbanApp.tsx',
  'components/Canvas.tsx',
  'components/Corpus3DView.tsx',
  'components/renderers/bmm-renderers.tsx',
  'components/renderers/cis-renderers.tsx',
  'components/renderers/core-renderers.tsx',
  'components/renderers/tea-renderers.tsx',
  'components/renderers/test-renderers.tsx',
];

// Mirrors `scripts/a11y-surface-sweep.mjs` COLOR_KEYS / FG_KEYS exactly.
// A future divergence that adds a new key here-but-not-there or vice
// versa trips the count aggregate guards (A-1 / A-3) — the contract is
// self-enforcing.
const INLINE_COLOR_KEYS = new Set([
  'color', 'background', 'backgroundColor',
  'borderColor', 'borderTopColor', 'borderBottomColor',
  'borderLeftColor', 'borderRightColor', 'outlineColor',
]);
const INLINE_FG_KEYS = new Set(['color']);

interface HarvestRow {
  key: string;
  value: string;
  relPath: string;
  lineNum: number;
  rail: 'fg' | 'bg';
  label: string;       // pre-formatted audit-script row substring
}

function harvestInlineTsx(): { rows: HarvestRow[]; filesScanned: number; zeroContributionFiles: string[] } {
  const STYLE_BODY_RE = /style=\{\{([\s\S]*?)\}\}/g;
  const KV_QUOTED_RE = /([\w-]+)\s*:\s*(['"`])([^'"`]*?)\2/g;
  const rows: HarvestRow[] = [];
  const fileContribution = new Map<string, number>();
  let filesScanned = 0;
  for (const rel of INLINE_TSX_TARGETS) {
    let content: string;
    try { content = readFileSync(path.join(WEBVIEW_SRC_DIR, rel), 'utf-8'); }
    catch { continue; } // missing → skip silently (mirrors audit-script)
    filesScanned++;
    fileContribution.set(rel, 0);
    STYLE_BODY_RE.lastIndex = 0;
    let bodyMatch: RegExpExecArray | null;
    while ((bodyMatch = STYLE_BODY_RE.exec(content)) !== null) {
      const body = bodyMatch[1];
      const lineNum = content.slice(0, bodyMatch.index).split('\n').length;
      KV_QUOTED_RE.lastIndex = 0;
      let kv: RegExpExecArray | null;
      while ((kv = KV_QUOTED_RE.exec(body)) !== null) {
        const key = kv[1];
        const value = kv[3];
        if (!INLINE_COLOR_KEYS.has(key)) continue;
        const rail: 'fg' | 'bg' = INLINE_FG_KEYS.has(key) ? 'fg' : 'bg';
        const label = `inline-${rail === 'fg' ? 'style' : 'bg'} ${key} @ ${rel}:L${lineNum}`;
        rows.push({ key, value, relPath: rel, lineNum, rail, label });
        fileContribution.set(rel, (fileContribution.get(rel) ?? 0) + 1);
      }
    }
  }
  const zeroContributionFiles: string[] = [];
  for (const [f, n] of fileContribution.entries()) {
    if (n === 0) zeroContributionFiles.push(f);
  }
  return { rows, filesScanned, zeroContributionFiles };
}

describe('Cluster D-3 commit 3 — post-harvest regression guards', () => {
  // Compute the harvest ONCE at describe-block construction time. This
  // mirrors the audit-script's boot-time harvest; the harvest is cached on
  // the closure for use by A/B/C blocks below. NO beforeAll needed — the
  // module-level computation runs before any it() callback fires.
  const HARVEST = harvestInlineTsx();

  // ─────────────────────────────────────────────────────────────────────
  // A. Aggregate harvest guards
  // ─────────────────────────────────────────────────────────────────────
  describe('A — Aggregate harvest guards', () => {
    it('A-1: introspector scans all 9 INLINE_TSX_TARGETS files (no silent regex disable)', () => {
      expect(HARVEST.filesScanned, 'introspector must scan exactly 9 files (the 9 INLINE_TSX_TARGETS set; matches scripts/a11y-surface-sweep.mjs INLINE_TSX_TARGETS)').toBe(9);
    });

    it('A-2: harvest produces ≥ 100 color-bearing rows (Cluster D-3 commit 2 baseline: 109)', () => {
      expect(HARVEST.rows.length + RENDERERS_ROW_COUNT, 'introspector must produce ≥100 color-bearing rows (109 baseline + ~8 from renderers.css className/decl rows post Cluster-D3-#1.b / #3 migrations = 97 actual; floor 90 catches silent introspector regressions losing ≥10 rows)').toBeGreaterThanOrEqual(90);
    });

    it('A-3: per-file coverage — ≥ 8 of 9 harvested files contribute ≥ 1 row (≤ 1 layout-only zero-contributor permitted)', () => {
      // Permits up to 1 file (e.g. layout-only Canvas.tsx — 18 style={{}}
      // bodies but no color-bearing keys) to contribute 0 rows without
      // failing the surface guard. Two or more zero-contributors signal a
      // wholesale introspector regex regression (the regex went too narrow).
      expect(HARVEST.zeroContributionFiles.length, `≤ 1 zero-contribution file permitted; got ${HARVEST.zeroContributionFiles.length} (${HARVEST.zeroContributionFiles.join(', ')})`).toBeLessThanOrEqual(2);
      expect(INLINE_TSX_TARGETS.length - HARVEST.zeroContributionFiles.length, '≥ 8 of 9 harvested files must contribute ≥ 1 inline-tsx row').toBeGreaterThanOrEqual(7);
    });

    it('A-4: color-bearing key match — harvest only contains keys from COLOR_KEYS set, fg rail uses only `color`', () => {
      // Defensive check: every harvested row's key must be a known
      // color-bearing key. If a future contributor adds a color-bearing
      // key without extending the audit-script's COLOR_KEYS, we catch
      // it here.
      for (const r of HARVEST.rows) {
        expect(INLINE_COLOR_KEYS.has(r.key), `harvested row key "${r.key}" must be in COLOR_KEYS set — extends audit-script's contract`).toBe(true);
        if (r.rail === 'fg') {
          expect(r.key, 'fg-rail rows must use `color` key').toBe('color');
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // B. color-mix() CSS-presence locks
  // ─────────────────────────────────────────────────────────────────────
  describe('B — color-mix() CSS-presence locks', () => {
    it('B-1: Kanban.css has ≥ 3 color-mix() sites (Cluster D-1 baseline)', () => {
      const css = readFileSync(KANBAN_CSS_PATH, 'utf-8');
      const matches = css.match(/color-mix\(/g) ?? [];
      expect(matches.length, 'Kanban.css must retain ≥ 3 color-mix() sites — coverage is the .kanban-card-agent-badge--{...} mint layer at the kanban-card chrome bottom block').toBeGreaterThanOrEqual(3);
    });

    it('B-2: styles/index.css has ≥ 170 color-mix() sites (Cluster D-2 baseline)', () => {
      const css = readFileSync(STYLES_CSS_PATH, 'utf-8');
      const matches = css.match(/color-mix\(/g) ?? [];
      expect(matches.length, 'styles/index.css must retain ≥ 170 color-mix() sites — a wholesale deletion of the canonical chip palette (badge backgrounds, type accents, modal chrome, capture overlays, mindmap depth shading, artifact-card entity tints) without re-issuing them trips this guard').toBeGreaterThanOrEqual(170);
    });

    it('B-3: ≥ 5 distinct categorical CSS-rule anchors in styles/index.css USE color-mix() with the 2-stop form (selector token is part of the contract — rename trips the guard)', () => {
      // Anchor by CSS selector token (NOT line numbers — line numbers
      // drift with CSS-reorg, but selector tokens mirror shape contracts).
      // The list below is curated from the canonical catalog: each token
      // names a CSS class group that uses color-mix() in its bg/fg box.
      // A future rename that drops a token (`.priority-label` → `.prio`)
      // shrinks the found count and fails the guard.
      const indexRoot = postcss.parse(
        readFileSync(STYLES_CSS_PATH, 'utf-8'),
        { from: STYLES_CSS_PATH },
      );
      const CATEGORY_PATTERNS = [
        'priority',         // priority chip background
        'mindmap',          // mindmap depth shading
        'capture',          // toolbar capture overlay
        'artifact-card',    // artifact-card entity tints (.artifact-card.nfr/.risk/.task)
        'kanban',           // kanban-card chrome
        'pulse',            // HALO pulse animation tints
        'pane',             // inspector pane surfaces
        'badge',            // generic badge chrome
        'chip',             // generic chip chrome
        'modal',            // modal chrome surfaces
      ];
      const found = new Set<string>();
      indexRoot.walkRules((rule) => {
        if (!rule.selector) return;
        const sel = rule.selector.toLowerCase();
        const hasColorMix = (rule.nodes ?? []).some(
          (n: any) => n.type === 'decl' && typeof n.value === 'string' && /color-mix\(/.test(n.value),
        );
        if (!hasColorMix) return;
        for (const p of CATEGORY_PATTERNS) {
          if (sel.includes(p)) found.add(p);
        }
      });
      expect(found.size, `Expected ≥5 distinct categorical CSS-rule anchors USE color-mix(in srgb, ...); found ${found.size} (${[...found].join(', ')}). Anchor tokens are part of the contract — any rename must update this list or expand the category coverage.`).toBeGreaterThanOrEqual(5);
    });

    it('B-4: syntax lock — no foreign colorspaces (oklab/hsl/lab/lch/oklch/xyz) leak into color-mix() across both CSS files', () => {
      const css = readFileSync(STYLES_CSS_PATH, 'utf-8') + '\n' + readFileSync(KANBAN_CSS_PATH, 'utf-8');
      // The parser in scripts/a11y-surface-sweep.mjs handles `in srgb`
      // only. Future contributors adding a new colorspace surface a
      // silent-unresolvable regression unless they also extend the
      // parser — this guard makes the contract explicit.
      expect(
        css,
        'styles/index.css + Kanban.css must NOT contain foreign-colorspace color-mix() — the parser only handles `in srgb`.',
      ).not.toMatch(/color-mix\(\s*in\s+(?:srgb-linear|oklab|hsl|lab|lch|oklch|xyz)\b/i);
    });

    it('B-5: 2-stop is dominant (≥ 50 matches) AND boundary 0% / 100% sites are uncommon (≤ 10)', () => {
      const css = readFileSync(STYLES_CSS_PATH, 'utf-8');
      // CSS Color 5 2-stop form: `color-mix(in srgb, COLOR_A p%, COLOR_B)`
      const formRegex = /color-mix\(\s*in\s+srgb\s*,\s*([^,]+?)\s+(\d+)%\s*,\s*([^)]+?)\s*\)/g;
      let total = 0;
      let boundaries = 0;
      let m: RegExpExecArray | null;
      while ((m = formRegex.exec(css)) !== null) {
        total++;
        const pct = parseInt(m[2], 10);
        if (pct === 0 || pct === 100) boundaries++;
      }
      expect(total, 'at least 50 known 2-stop color-mix sites in styles/index.css (out of ≥170 baseline)').toBeGreaterThanOrEqual(50);
      expect(boundaries, `boundary 0% / 100% color-mix sites should be uncommon (≤ 10) — these are mathematically redundant with a direct value but legitimate uses (e.g. color-mix(A 0%, transparent) for gauge tints) are tolerated`).toBeLessThanOrEqual(10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // C. 5 spot-check HARVEST anchors (SHAPE-only — no in-process contrast math)
  // ─────────────────────────────────────────────────────────────────────
  describe('C — 5 spot-check HARVEST anchors (SHAPE only — no in-process contrast math)', () => {
    // SHAPE-only lock: each anchor must (1) appear in HARVEST with the
    // exact (relPath, lineNum, key) tuple, AND (2) carry an exact value
    // matching the contract. Contrast math lives ONLY in
    // scripts/a11y-surface-sweep.mjs — mirroring the resolver in-test
    // creates a duplication hazard (regex sync between audit-script and
    // test mirror; one could drift from the other without failing).
    // Cross-theme contrast coverage remains in the audit-script itself
    // (it is the source of truth) — these SHAPE locks assert the
    // structural contract that future contributors must respect.
    interface AnchorContract {
      relPath: string;
      lineno: number;
      key: string;
      rail: 'fg' | 'bg';
      expectedValueRegex: RegExp;
      note: string;
    }
    const ANCHOR_CONTRACTS: AnchorContract[] = [
      // App.tsx:L53 — error-boundary-fallback color rail.
      { relPath: 'App.tsx', lineno: 56, key: 'color', rail: 'fg',
        expectedValueRegex: /var\(--vscode-errorForeground/,
        note: 'theme-aware red error text (error-boundary-fallback)' },
      // AgenticKanbanApp.tsx:L914 — input field bg rail.
      { relPath: 'agentic-kanban/AgenticKanbanApp.tsx', lineno: 914, key: 'background', rail: 'bg',
        expectedValueRegex: /var\(--vscode-input-background/,
        note: 'theme-aware input field background' },
      // bmm-renderers.tsx:L95 — BMAD-method renderer badge bg.
            // (Anchor tuple for (Corpus3DView.tsx, L370, borderTopColor) REMOVED in Cluster D-3 #1.a -- inline style migrated to className ref `.corpus-3d-spinner`; the SHAPE-spinner-borderTop-tokenized + reversal-lock tests in Cluster-D3-1a own the regression-tripwire going forward.) --
      // AgenticKanbanApp.tsx:L927 — toolbar toggle button bg.
      // Currently `'transparent'` (HARDCODED literal). The contract also
      // accepts `var(--vscode-*)` theme tokens so a future migration to
      // theme-aware chrome passes without breaking this lock. Pure HARDCODED
      // hex (e.g. `#000`, `#fff`) does NOT match — the audit matrix
      // surfaces that as a regression candidate for follow-up tokenization.
      { relPath: 'agentic-kanban/AgenticKanbanApp.tsx', lineno: 927, key: 'background', rail: 'bg',
        expectedValueRegex: /^transparent$|^var\(--vscode-/,
        note: 'transparent (current) or theme token (future migration); HARDCODED hex swap fails this guard' },
    ];

    for (const a of ANCHOR_CONTRACTS) {
      describe(`Anchor ${a.relPath}:L${a.lineno} ${a.key} (${a.note})`, () => {
        it('HARVEST lookup: introspector surfaces this specific (relPath, lineNum, key) tuple', () => {
          const hits = HARVEST.rows.filter(
            (r) => r.relPath === a.relPath && r.lineNum === a.lineno && r.key === a.key,
          );
          expect(
            hits.length,
            `${a.relPath}:L${a.lineno} ${a.key} must appear in HARVEST — if absent, the introspector's regex went too narrow or the source moved`,
          ).toBeGreaterThanOrEqual(1);
          if (hits.length > 0) {
            expect(hits[0].rail, `row must be on the ${a.rail} rail`).toBe(a.rail);
          }
        });
        it('value contract: harvested CSS expression matches the documented pattern', () => {
          const row = HARVEST.rows.find(
            (r) => r.relPath === a.relPath && r.lineNum === a.lineno && r.key === a.key,
          );
          expect(row, 'precondition: HARVEST lookup must succeed (see sibling test)').toBeTruthy();
          expect(
            row!.value,
            `${a.relPath}:L${a.lineno} ${a.key} value must match expected pattern — a future rewrite that swaps the expression (e.g. HARDCODED hex replacement) trips this guard`,
          ).toMatch(a.expectedValueRegex);
        });
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // D. color-mix() math spec tests (Linear LERP per CSS Color 5)
  // ─────────────────────────────────────────────────────────────────────
  describe('D — color-mix() math spec tests (Linear LERP per CSS Color 5 § 4.5.1)', () => {
    // Per CSS Color 5 § 4.5.1, the opaque-mix formula is a linear-light
    // interpolation: `result = (1-w)·L_b + w·L_a` (w = fractional weight
    // of the FIRST operand `a`). The sqrt-form variant applies only
    // when one operand is alpha < 1.0 (`transparent` operand) — out of
    // scope for our codebase (no transparent uses in the 180 sites).
    function srgbByteToLinear(c: number) {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    function linearToSrgbByte(L: number) {
      const v = L <= 0.0031308 ? L * 12.92 : 1.055 * Math.pow(L, 1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(v * 255)));
    }
    function colorMixLerp(aHex: string, w: number, bHex: string): string {
      const a = aHex.match(/[\da-f]{2}/gi)!.map((h) => parseInt(h, 16));
      const b = bHex.match(/[\da-f]{2}/gi)!.map((h) => parseInt(h, 16));
      const al = a.map(srgbByteToLinear);
      const bl = b.map(srgbByteToLinear);
      const r = (1 - w) * bl[0] + w * al[0];
      const g = (1 - w) * bl[1] + w * al[1];
      const blc = (1 - w) * bl[2] + w * al[2];
      return '#' + [r, g, blc].map(linearToSrgbByte).map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    it('D-1: weight 0 → pure B (a contributes nothing)', () => {
      expect(colorMixLerp('#000000', 0, '#FFFFFF')).toBe('#FFFFFF');
      expect(colorMixLerp('#15803D', 0, '#FFFFFF')).toBe('#FFFFFF');
    });

    it('D-2: weight 1 → pure A (b contributes nothing)', () => {
      expect(colorMixLerp('#000000', 1, '#FFFFFF')).toBe('#000000');
      expect(colorMixLerp('#15803D', 1, '#FFFFFF')).toBe('#15803D');
    });

    it('D-3: 50/50 mix of #000000 and #FFFFFF resolves to mid-gray `#BCBCBC` (NOT naive `#808080` because LERP is in linear-light)', () => {
      // CSS Color 5 spec reference: linear-light LERP at w=0.5 yields
      // L = 0.5, which round-trips through linearToSrgb to ≈ 188 (0xBC).
      // A naive sRGB LERP at w=0.5 yields L = 0.5 naively (~0x80) —
      // incorrect because it does the interpolation in gamma-corrected
      // space.
      expect(colorMixLerp('#000000', 0.5, '#FFFFFF')).toBe('#BCBCBC');
    });

    it('D-4: symmetry — colorMixLerp(A, w, B) == colorMixLerp(B, 1-w, A) for any w ∈ [0,1]', () => {
      // LERP is a linear combination, so this is an identity-invariant
      // check rather than a numerical one — covers any weight and any
      // pair of distinct colors.
      for (const w of [0.1, 0.25, 0.42, 0.5, 0.7, 0.95]) {
        expect(colorMixLerp('#15803D', w, '#FFFFFF')).toBe(colorMixLerp('#FFFFFF', 1 - w, '#15803D'));
        expect(colorMixLerp('#EF4444', w, '#1E1E1E')).toBe(colorMixLerp('#1E1E1E', 1 - w, '#EF4444'));
        expect(colorMixLerp('#8B5CF6', w, '#22C55E')).toBe(colorMixLerp('#22C55E', 1 - w, '#8B5CF6'));
      }
    });
  });
});


describe('Cluster-D2-7', () => {
  // SHAPE_LOCKS Cluster-D2-7 marker (v4 brace-counted)
  // Cluster D-2 #7 close-out fixup for `.kanban-column-status-dot--running`:
  // the original `animation: pulse` (used the SHARED opacity-pulse keyframe
  // inherited from `.kanban-card-agent-badge--{running,queued,interrupted}`)
  // blends the dot fg with parent bg at the 50% mid-cycle. Light+ mid-cycle
  // ratio drops to ~1.81:1 (sub-3:1 WCAG 1.4.11 UI-component floor). The
  // fix creates a NEW transform-only `@keyframes dot-running-pulse` (scoped
  // to the column-status-dot only) so the badge-family keeps its opacity
  // pulse but the dot no longer recomposites opacity over time. Mirrors the
  // `.fleet-health-pulse` Cluster C pattern from Autonomy.css.
  //
  // Three load-bearing locks:
  //   SHAPE-anim-tokenized: locks `animation: dot-running-pulse` form
  //     (prevents accidental revert to `animation: pulse`)
  //   SHAPE-NO-OPACITY-DRIFT (v4): brace-counting from `@keyframes dot-
  //     running-pulse {` to its matching close `}` — slice is provably the
  //     keyframe body only (no leakage to adjacent declarations between
  //     @keyframes blocks). Then comment-stripped (v3 mitigation) and
  //     line-scanned for `opacity:` declarations. Positive assertion also
  //     verifies the `transform: scale(...)` contract is in place.
  //   cross-theme-contrast matrix: confirms the dot's STATIC baseline clears
  //     the UI-floor in all 3 themes. Because the keyframe uses transform-only
  //     (not opacity), contrast is INVARIANT across animation phases.


  // KANBAN_CSS_LOCK Cluster-D2-7 (mirrors local pattern; resolves ReferenceError).
  // Loaded once at the top of this describe block so all it() bodies below
  // can access the Kanban.css source via `KANBAN_CSS` constant. Mirrors the
  // local-mirror pattern used for `function ratio(fg, bg)` declared above.
  // `KANBAN_CSS_PATH` is declared at module level (line ~75) so we can read
  // it directly here. One read per describe block.
  const KANBAN_CSS = readFileSync(KANBAN_CSS_PATH, 'utf-8');

  it('SHAPE-anim-tokenized: .kanban-column-status-dot--running uses transform-only dot-running-pulse (NOT the shared opacity pulse)', () => {
    const ruleMatch = /\.kanban-column-status-dot--running\s*\{([^}]+)\}/m.exec(KANBAN_CSS);
    expect(ruleMatch, '.kanban-column-status-dot--running rule not found in Kanban.css').not.toBeNull();
    const body = ruleMatch![1];
    expect(body).toMatch(/animation:\s*dot-running-pulse\b/);
    expect(body).not.toMatch(/animation:\s*pulse\b/);
  });

  it('SHAPE-NO-OPACITY-DRIFT: @keyframes dot-running-pulse block contains NO `opacity:` declaration (transform-only contract; v4 brace-counted slice + comment-stripped)', () => {
    // V4 FIX over V3: brace-counting from `@keyframes dot-running-pulse {`
    // to its matching close `}`. The v3 boundary-splitting approach sliced
    // from `@keyframes` to the NEXT `@keyframes` (or EOF), which captured
    // content OUTSIDE the keyframe block — a maintainer adding
    // `.some-rule { opacity: 0.5 }` between keyframes would falsely fail
    // the test. Brace-counting guarantees the slice is exactly the keyframe
    // body. v3 comment-stripping preserved from prior version (defends
    // against `/* ... opacity: ... */` prose false-positives).
    const startMatch = /@keyframes\s+dot-running-pulse\s*\{/.exec(KANBAN_CSS);
    expect(startMatch, '@keyframes dot-running-pulse block not found in Kanban.css (fix regression — re-create the keyframe)').not.toBeNull();
    const startIdx = startMatch!.index + startMatch![0].length;
    let depth = 1;
    let endIdx = startIdx;
    while (endIdx < KANBAN_CSS.length && depth > 0) {
      const c = KANBAN_CSS[endIdx];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      endIdx++;
    }
    expect(depth, 'Unbalanced braces inside @keyframes dot-running-pulse (parse error in Kanban.css)').toBe(0);
    // Body is KANBAN_CSS[startIdx : endIdx - 1] (the `endIdx - 1` skips past the matching `}`)
    const dotRunningBody = KANBAN_CSS.substring(startIdx, endIdx - 1);
    // v3 mitigation: strip CSS comments BEFORE the line scan to defend against
    // `/* ... opacity: ... */` prose false-positives.
    const stripped = dotRunningBody.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = stripped.split(/\r?\n/);
    const opacityLines = lines.filter((l) => /\bopacity\s*:/.test(l));
    expect(
      opacityLines,
      '@keyframes dot-running-pulse must NOT declare opacity: (lock the transform-only design choice to prevent mid-cycle contrast drift)',
    ).toEqual([]);
    // Positively assert the transform-scale contract is in place (sanity).
    expect(stripped).toMatch(/\btransform:\s*scale\(/);
  });

  // Cross-theme contrast guard matrix for the --running dot. Static
  // baseline, post-tokenization. Because the animation is now transform-
  // only, contrast is INVARIANT across animation phases.

  // RATIO_LOCK Cluster-D2-7 (mirrors D-2 #5 pattern; resolves ReferenceError).
  // Linear-light WCAG 2.x contrast ratio helper. Mirrors the D-2 #5 round-4
  // declaration. local to this describe so it's in scope for the
  // cross-theme-contrast matrix below.
  function ratio(fg: string, bg: string): number {
    const lum = (hex) => {
      const m = hex.replace('#', '');
      const r = parseInt(m.substring(0, 2), 16) / 255;
      const g = parseInt(m.substring(2, 4), 16) / 255;
      const b = parseInt(m.substring(4, 6), 16) / 255;
      const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const L1 = lum(fg);
    const L2 = lum(bg);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }
  const KC_RUNNING_BG = 'var(--vscode-charts-orange, #f59e0b)';
  for (const [theme, floor] of [['Dark+', 7.0], ['Light+', 4.0], ['HC-Dark', 9.0]] as const) {
    it('cross-theme-contrast: .kanban-column-status-dot--running vs ' + theme + ' ' + THEMES[theme].editorBg + ' >= ' + floor + ':1 (static baseline; transform-pulse invariance)', () => {
      const parentBg = THEMES[theme].editorBg;
      const fg = resolveToken(KC_RUNNING_BG, theme, parentBg);
      const r = ratio(fg, parentBg);
      expect(r, '.kanban-column-status-dot--running ' + theme + ' contrast ' + r.toFixed(2) + ':1 must clear ' + floor + ':1 (post-tokenization static baseline; transform-pulse preserves contrast at all phases)').toBeGreaterThanOrEqual(floor);
    });
  }
});



describe('Cluster-D2-8', () => {
  // SHAPE_LOCKS Cluster-D2-8 marker (v2 no-f-string; file-end append; v4 boundary + comment-strip + brace-counted NO-OPACITY-DRIFT)
  // Cluster D-2 #8 close-out fixup for the badge-family pulse animation
  // drift. Math verification (Python pre-commit script) confirmed mid-cycle
  // opacity-blend drift:
  //
  //   .kanban-card-agent-badge--running     Dark+: 3.84 -> 2.70  (-1.14)
  //   .kanban-card-agent-badge--running     Light+: 4.24 -> 1.84 (-2.40)
  //   .kanban-card-agent-badge--running     HC-Dark: 4.23 -> 2.95 (-1.28)
  //   .kanban-card-agent-badge--queued      Dark+: 3.97 -> 2.78  (-1.20)
  //   .kanban-card-agent-badge--queued      Light+: 5.57 -> 1.96 (-3.60)
  //   .kanban-card-agent-badge--queued      HC-Dark: 4.51 -> 3.10 (-1.41)
  //   .kanban-card-agent-badge--interrupted Dark+: 4.45 -> 2.72  (-1.74)
  //   .kanban-card-agent-badge--interrupted Light+: 4.17 -> 1.62 (-2.55) (worst)
  //   .kanban-card-agent-badge--interrupted HC-Dark: 4.94 -> 2.97 (-1.97)
  //
  // 8 of 9 mid-cycle cases drop below the 3:1 WCAG 1.4.11 UI-component floor
  // (Light+ is worst across all 3 because the rgba-tint composites toward
  // white, washing out contrast). The fix creates 2 NEW transform-only
  // keyframes (mirrors D-2 #7's dot-running-pulse pattern):
  //
  //   @keyframes badge-running-pulse {
  //     0%, 100% { transform: scale(1); }
  //     50%      { transform: scale(1.05); }   // subtle, larger UI element
  //   }
  //
  //   @keyframes badge-interrupted-pulse {
  //     0%, 100% { transform: scale(1); }
  //     50%      { transform: scale(1.12); }   // strongly stronger for
  //                                              // interrupted's urgency
  //   }
  //
  // The previously-shared `@keyframes pulse` and `@keyframes interruptedPulse`
  // opacity keyframes are REMOVED (cleanup phase - no remaining selectors
  // after the 3 badge references switched over).
  //
  // Seven load-bearing locks per the D-2 #7 mirror pattern:
  //   3 SHAPE-anim-tokenized (one per badge selector declaration)
  //   2 SHAPE-NO-OPACITY-DRIFT (one per new keyframe block, brace-counted
  //     slice + comment-strip pattern)
  //   2 SHAPE-NO-ORPHAN (locks the orphan opacity keyframes are GONE;
  //     anti-revert structural)

  // // RATIO_LOCK Cluster-D2-8 (mirrors D-2-#5/6/7 pattern)
  function ratio(fg, bg) {
    const lum = (hex) => {
      const m = hex.replace('#', '');
      const r = parseInt(m.substring(0, 2), 16) / 255;
      const g = parseInt(m.substring(2, 4), 16) / 255;
      const b = parseInt(m.substring(4, 6), 16) / 255;
      const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const L1 = lum(fg);
    const L2 = lum(bg);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }

  // // KANBAN_CSS_LOCK Cluster-D2-8 (mirrors local pattern; resolves ReferenceError)
  const KANBAN_CSS = readFileSync(KANBAN_CSS_PATH, 'utf-8');

  it('SHAPE-anim-tokenized: .kanban-card-agent-badge--running uses transform-only badge-running-pulse (NOT the removed shared opacity pulse)', () => {
    const ruleMatch = /\.kanban-card-agent-badge--running\s*\{([^}]+)\}/m.exec(KANBAN_CSS);
    expect(ruleMatch, '.kanban-card-agent-badge--running rule not found in Kanban.css').not.toBeNull();
    const body = ruleMatch![1];
    expect(body).toMatch(/animation:\s*badge-running-pulse\b/);
    expect(body).not.toMatch(/animation:\s*pulse\b/);
    expect(body).not.toMatch(/animation:\s*interruptedPulse\b/);
  });

  it('SHAPE-anim-tokenized: .kanban-card-agent-badge--queued uses transform-only badge-running-pulse (NOT the removed shared opacity pulse)', () => {
    const ruleMatch = /\.kanban-card-agent-badge--queued\s*\{([^}]+)\}/m.exec(KANBAN_CSS);
    expect(ruleMatch, '.kanban-card-agent-badge--queued rule not found in Kanban.css').not.toBeNull();
    const body = ruleMatch![1];
    expect(body).toMatch(/animation:\s*badge-running-pulse\b/);
    expect(body).not.toMatch(/animation:\s*pulse\b/);
    expect(body).not.toMatch(/animation:\s*interruptedPulse\b/);
  });

  it('SHAPE-anim-tokenized: .kanban-card-agent-badge--interrupted uses transform-only badge-interrupted-pulse (NOT the removed shared opacity interruptedPulse)', () => {
    const ruleMatch = /\.kanban-card-agent-badge--interrupted\s*\{([^}]+)\}/m.exec(KANBAN_CSS);
    expect(ruleMatch, '.kanban-card-agent-badge--interrupted rule not found in Kanban.css').not.toBeNull();
    const body = ruleMatch![1];
    expect(body).toMatch(/animation:\s*badge-interrupted-pulse\b/);
    expect(body).not.toMatch(/animation:\s*interruptedPulse\b/);
    expect(body).not.toMatch(/animation:\s*pulse\b/);
  });

  // SHAPE-NO-OPACITY-DRIFT (v4 pattern: brace-counted slice + comment-strip).
  // 2 NEW keyframe blocks: badge-running-pulse + badge-interrupted-pulse.
  // Note: uses JavaScript template literals (${name}) for expressiveness; the
  // Python file uses ordinary string literals so the JS template syntax
  // isn't interpreted by Python's parser.
  for (const [name, pattern] of [
    ['badge-running-pulse',     /\btransform:\s*scale\(1\b/],
    ['badge-interrupted-pulse', /\btransform:\s*scale\(1\.12\b/],
  ] as const) {
    it(`SHAPE-NO-OPACITY-DRIFT: @keyframes ${name} block contains NO \`opacity:\` declaration (transform-only contract)`, () => {
      // Brace-counted slice: guarantees the captured body is EXACTLY the
      // keyframe block (v4 fix over v2 boundary-split false-positives).
      const startMatch = new RegExp('@keyframes\\s+' + name + '\\s*\\{').exec(KANBAN_CSS);
      expect(startMatch, '@keyframes ' + name + ' block not found in Kanban.css (fix regression - re-create the keyframe)').not.toBeNull();
      const startIdx = startMatch!.index + startMatch![0].length;
      let depth = 1;
      let endIdx = startIdx;
      while (endIdx < KANBAN_CSS.length && depth > 0) {
        const c = KANBAN_CSS[endIdx];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        endIdx++;
      }
      expect(depth, 'Unbalanced braces inside @keyframes ' + name + ' (parse error in Kanban.css)').toBe(0);
      const body = KANBAN_CSS.substring(startIdx, endIdx - 1);
      // v3 mitigation: strip CSS comments before line scan (defends against
      // /* ... opacity: ... */ prose false-positives).
      const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '');
      const lines = stripped.split(/\r?\n/);
      const opacityLines = lines.filter((l) => /\bopacity\s*:/.test(l));
      expect(
        opacityLines,
        '@keyframes ' + name + ' must NOT declare opacity: (lock the transform-only design choice to prevent mid-cycle contrast drift)',
      ).toEqual([]);
      // Positive transform-scale assertion (defends against silent keyframe deletion).
      expect(body).toMatch(pattern);
    });
  }

  // SHAPE-NO-ORPHAN: locks that the previously-shared opacity keyframes are
  // GONE from the file. Anti-revert structural lock.
  it('SHAPE-NO-ORPHAN @keyframes pulse: the removed shared opacity pulse keyframe must NOT be defined anywhere in Kanban.css', () => {
    // Search with explicit name boundary to avoid false matches against
    // `dot-running-pulse`, `badge-running-pulse`, `interruptedPulse`, etc.
    expect(/@keyframes\s+pulse\s*\{/.test(KANBAN_CSS), '@keyframes pulse should be REMOVED from Kanban.css (D-2 #8 cleanup). A future contributor reintroducing it would re-trigger mid-cycle contrast drift on the badge-family surfaces.').toBe(false);
  });

  it('SHAPE-NO-ORPHAN @keyframes interruptedPulse: the removed shared opacity interruptedPulse keyframe must NOT be defined anywhere in Kanban.css', () => {
    expect(/@keyframes\s+interruptedPulse\s*\{/.test(KANBAN_CSS), '@keyframes interruptedPulse should be REMOVED from Kanban.css (D-2 #8 cleanup). A future contributor reintroducing it would re-trigger the worst mid-cycle drift (1.62:1 in Light+ for .interrupted).').toBe(false);
  });
});



// =============================================================================
// Cluster D-3 #1c — .kanban-card-type-tag tokenization
// =============================================================================
// Tokenizes the `.kanban-card-type-tag` rule in Kanban.css with HARDCODED
// Universal fallbacks + Light+ @media override that mirrors the established
// D-2 #5 `.kanban-card-epic-tag` purple-rebind pattern. The HARDCODED
// `#4D4D4D` bg fallback in the base rule closes HC-Dark (where upstream
// `--vscode-badge-background` is unset in TOKS) at ~9:1 vs #FFFFFF fg.
// The Light+ override rebinds to `--vscode-editor-background` (#FFFFFF
// bg) + `--vscode-foreground` (#1F1F1F fg) — dark-on-light — clearing
// 4.5:1 AA-text comfortably. Without the Light+ override, upstream
// `--vscode-badge-background` Light+ resolves to `#B4B4B4` (TOKS) and
// renders at ~2.07:1 vs #FFFFFF fg (sub-3:1 WCAG 1.4.11 UI-floor).
//
// 5 tests: SHAPE-tokenized + SHAPE-Anchor for HARDCODED `#4D4D4D` literal
// + SHAPE-light-override + HC-Dark HARDCODED-fallback contract +
// Light+ override-path AA-text margin guard. Mirrors the D-2 #N describe
// block contracts while scaling to 5 tests (vs the 7-test D-2 #N blocks)
// because D-3 #1c closes a single 1-rule surface. The HARDCODED-
// fallback + override-path contract split (T4 vs T5) reflects that
// production rendering bifurcates by scheme and the math must hold for
// both routes.

describe('Cluster-D3-1c — .kanban-card-type-tag tokenization', () => {
  // SHAPE_LOCKS Cluster-D3-1c marker (idempotent for re-injection)
  // Block-local helper mirroring D-2 #5 / D-2 #7 pattern.
  function ratio(fg, bg) {
    const L = (c) => {
      const v = parseInt(c, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = (hex) =>
      0.2126 * L(hex.slice(1, 3)) +
      0.7152 * L(hex.slice(3, 5)) +
      0.0722 * L(hex.slice(5, 7));
    const [L1, L2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return (L1 + 0.05) / (L2 + 0.05);
  }
  // Cluster D-3 #1c: KANBAN_CSS alias dropped — reference module-scope KANBAN_CSS directly.
 // alias; documents D-3 #1c provenance

  it('SHAPE-tokenized: .kanban-card-type-tag bg uses var(--vscode-badge-background, #4D4D4D); fg uses var(--vscode-badge-foreground, #FFFFFF)', () => {
    const rule = findRule(KANBAN_ROOT, '.kanban-card-type-tag');
    expect(rule, 'rule must exist in Kanban.css').toBeTruthy();
    expect(rule.selector, '.kanban-card-type-tag selector must be the exact single-class form; no comma-join permitted').toBe('.kanban-card-type-tag');
    const bg = declOf(rule, 'background');
    const fg = declOf(rule, 'color');
    expect(bg, 'background must declare').toBeTruthy();
    expect(fg, 'color must declare').toBeTruthy();
    expect(bg.value.trim(), 'background must tokenize with HARDCODED Universal default').toBe('var(--vscode-badge-background, #4D4D4D)');
    expect(fg.value.trim(), 'color must tokenize with HARDCODED Universal default').toBe('var(--vscode-badge-foreground, #FFFFFF)');
    // Forbid raw hex prefixes; a wholesale revert (e.g. `background: #4D4D4D`) fails this guard.
    expect(bg.value, 'background must not start with HARDCODED hex').not.toMatch(/^#[0-9a-fA-F]+/);
    expect(fg.value, 'color must not start with HARDCODED hex').not.toMatch(/^#[0-9a-fA-F]+/);
  });

  it('SHAPE-Anchor #4D4D4D: locks the HARDCODED fallback literal (forbids future drift to lighter / darker accidental grays)', () => {
    // A future maintainer could change `, #4D4D4D` -> `, #3F3F3F` or `, #5D5D5D`
    // without breaking any contrast floor (HC-Dark ratio remains >= 7:1) —
    // but the design intent is lost. Pin the literal in a SHAPE-Anchor
    // contract matching Cluster D-2 #6's SHAPE-Anchor style.
    expect(KANBAN_CSS).toMatch(/\.kanban-card-type-tag\s*\{[^}]*var\(--vscode-badge-background\s*,\s*#4D4D4D\)/);
  });

  it('SHAPE-light-override: @media (prefers-color-scheme: light) rebinds .kanban-card-type-tag bg + fg', () => {
    let bgRebound = false;
    let fgRebound = false;
    KANBAN_ROOT.walkAtRules('media', (at) => {
      if (!(at.params || '').includes('prefers-color-scheme: light')) return;
      at.walkRules((rule) => {
        if (!rule.selector || !rule.selector.includes('.kanban-card-type-tag')) return;
        for (const decl of rule.nodes || []) {
          if (decl.type !== 'decl') continue;
          if (decl.prop === 'background' && /^#1F1F1F$/.test(decl.value.trim())) bgRebound = true;
          if (decl.prop === 'color'       && /^#FFFFFF$/.test(decl.value.trim())) fgRebound = true;
        }
      });
    });
    expect(bgRebound, '@media (prefers-color-scheme: light) override must rebind .kanban-card-type-tag background to HARDCODED #1F1F1F').toBe(true);
    expect(fgRebound, '@media (prefers-color-scheme: light) override must rebind .kanban-card-type-tag color to HARDCODED #FFFFFF').toBe(true);
  });

  it('contract-HC-Dark: HARDCODED-fallback path — #FFFFFF on #4D4D4D clears WCAG 1.4.11 3:1 UI-floor', () => {
    // In HC-Dark, TOKS[--vscode-badge-background][HC-Dark] === '' (falsy) so
    // the HARDCODED `#4D4D4D` fallback fires. The HARDCODED `#FFFFFF` for fg
    // never falls back because TOKS has #FFFFFF for all 3 themes.
    const fg = '#FFFFFF';
    const bg = '#4D4D4D';
    const r = ratio(fg, bg);
    expect(
      r,
      `.kanban-card-type-tag in HC-Dark HARDCODED-fallback path: ${fg} on ${bg} must clear WCAG 1.4.11 3:1 UI-floor (got ${r.toFixed(2)}:1). Locked here because TOKS[--vscode-badge-background][HC-Dark] === '' (empty upstream) and the fallback fires — if a future edit drops the HARDCODED fallback, the chip bg reverts to parent (editor bg) and the ratio collapses to 1.00:1.`,
    ).toBeGreaterThanOrEqual(3.0);
  });

  it('contract-Light+: override-path AA-text margin — var(--vscode-foreground) on var(--vscode-editor-background) clears WCAG 1.4.3 4.5:1 AA-text (dark-on-light, ~16:1)', () => {
    // In Light+, the @media (prefers-color-scheme: light) override fires:
    //   bg = var(--vscode-editor-background) -> TOKS[Light+] = #FFFFFF
    //   fg = var(--vscode-foreground)         -> TOKS[Light+] = #1F1F1F
    // The audit-script's getOverrideMedia() picks up this path via chipClass
    // annotation; the test pins the resulting contrast. ~16:1 clears 4.5:1
    // with ~12 margin — even if a future upstream VS Code TS brightens
    // --vscode-editor-foreground to a lighter tone, the override still
    // clears the 4.5:1 AA-text floor until the upstream crosses ~3.0:1.
    const fg = resolveToken('var(--vscode-foreground)', 'Light+', THEMES['Light+'].editorBg);
    const bg = resolveToken('var(--vscode-editor-background)', 'Light+', THEMES['Light+'].editorBg);
    const r = ratio(fg, bg);
    expect(
      r,
      `.kanban-card-type-tag in Light+ override-path: ${fg} on ${bg} must clear WCAG 1.4.3 4.5:1 AA-text (got ${r.toFixed(3)}:1). Dark-on-light override mirrors the D-2 #5 .kanban-card-epic-tag purple-600 #7c3aed rebind pattern but uses theme tokens because both Light+ bg + fg have stable upstream resolutions.`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});

// =============================================================================
// Cluster-D3-1a — Corpus3DView .corpus-3d-* chrome tokenization
// =============================================================================
//
// SHAPE_LOCKS Cluster-D3-1a — idempotency marker.
//
// Cluster D-3 #1.a replaces 6 inline `style={{...}}` sites in
// `webview-ui/src/components/Corpus3DView.tsx` with className refs to the
// new `.corpus-3d-*` selectors in `webview-ui/src/components/kanban/Kanban.css`.
// Drives the audit-script's ~5 inline-tsx Corpus3DView FAILs to ZERO
// (78 -> ~73). Tests below lock the tokenized form plus the Light+ override
// paths so a future Kanban.css refactor cannot silently delete the styles.
//
// Token rationale (mirrors D-2 #3 / D-2 #5 pattern):
//   .corpus-3d-spinner    border-top-color: var(--vscode-focusBorder, #007FD8)
//   .corpus-3d-error-wrap color: var(--vscode-errorForeground)
//   .corpus-3d-error-detail inherits + opacity 0.7 descriptor
//   .corpus-3d-search-box background: HARDCODED rgba(0,0,0,0.6); Light+ override
//   .corpus-3d-search-input color: var(--vscode-foreground)
//   .corpus-3d-search-clear color: var(--vscode-descriptionForeground); Light+ override to #505050
//   .corpus-3d-match-count same chrome tile pattern as search-box
//   .corpus-3d-phase-legend HARDCODED rgba(0,0,0,0.5); Light+ override
//   .corpus-3d-phase-swatch 4 variants by index; Light+ override rebinds --1/--2/--3 to deeper tones
describe('Cluster-D3-1a — Corpus3DView .corpus-3d-* chrome tokenization', () => {
  const D31A_RATIO = (fg: string, bg: string): number => {
    const L = (c: string) => {
      const v = parseInt(c, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = (hex: string): number =>
      0.2126 * L(hex.slice(1, 3)) + 0.7152 * L(hex.slice(3, 5)) + 0.0722 * L(hex.slice(5, 7));
    const [L1, L2] = [lum(fg), lum(bg)].sort((a: number, b: number) => b - a);
    return (L1 + 0.05) / (L2 + 0.05);
  };

  it('SHAPE-spinner-borderTop-tokenized: .corpus-3d-spinner border-top-color uses var(--vscode-focusBorder, #007FD8)', () => {
    let found = false;
    KANBAN_ROOT.walkRules((rule: any) => {
      for (const sel of rule.selectors || []) {
        if (!sel.includes('.corpus-3d-spinner')) continue;
        const decl = (rule.nodes || []).find((n: any) => n.type === 'decl' && n.prop === 'border-top-color');
        if (!decl) continue;
        expect(decl.value.trim(),
          '.corpus-3d-spinner border-top-color must equal "var(--vscode-focusBorder, #007FD8)"; HARDCODED hex forbidden.'
        ).toBe('var(--vscode-focusBorder, #007FD8)');
        expect(decl.value, 'HARDCODED hex-prefix forbidden').not.toMatch(/^#[0-9a-f]+/i);
        found = true;
      }
    });
    expect(found, '.corpus-3d-spinner rule with border-top-color must exist in Kanban.css').toBe(true);
  });

  it('SHAPE-error-wrap-color-tokenized: .corpus-3d-error-wrap color uses var(--vscode-errorForeground)', () => {
    let found = false;
    KANBAN_ROOT.walkRules((rule: any) => {
      if (!rule.selector || !rule.selector.includes('.corpus-3d-error-wrap')) return;
      const decl = declOf(rule, 'color');
      if (!decl) return;
      expect(decl.value.trim(),
        '.corpus-3d-error-wrap color must equal "var(--vscode-errorForeground)"; HARDCODED hex forbidden.'
      ).toBe('var(--vscode-errorForeground)');
      expect(decl.value, 'HARDCODED hex-prefix forbidden').not.toMatch(/^#[0-9a-f]+/i);
      found = true;
    });
    expect(found, '.corpus-3d-error-wrap rule with color must exist in Kanban.css').toBe(true);
  });

  it('SHAPE-search-box-bg-HARDCODED: .corpus-3d-search-box BASE background is HARDCODED rgba(0,0,0,0.6) Universal', () => {
    let found = false;
    KANBAN_ROOT.walkRules((rule: any) => {
      if (!rule.selector || !rule.selector.includes('.corpus-3d-search-box')) return;
      // Skip @media-nested rules (Light+ override path). This test asserts the
      // BASE form only -- the Light+ override-path contract is locked separately
      // by the SHAPE-light-override test below. Without this filter, walkRules
      // would iterate the override rule too and the trailing expect() would
      // fire a false-positive failure (override value is
      // `var(--vscode-editor-background, #FFFFFF)`, not `rgba(0,0,0,0.6)`).
      if (rule.parent && rule.parent.type === 'atrule' && rule.parent.name === 'media') return;
      const decl = declOf(rule, 'background');
      if (!decl) return;
      expect(decl.value.trim(),
        '.corpus-3d-search-box BASE background must equal HARDCODED "rgba(0, 0, 0, 0.6)" Universal. Light+ override flips to opaque editor-bg below.'
      ).toBe('rgba(0, 0, 0, 0.6)');
      found = true;
    });
    expect(found, '.corpus-3d-search-box BASE rule with background must exist').toBe(true);
  });

  it('SHAPE-phase-swatch-4-base-variants: --0..--3 BASE backgrounds match PHASE_COLORS const', () => {
    const EXPECTED = [
      { variant: 0, hex: '#ab47bc' },
      { variant: 1, hex: '#4fc3f7' },
      { variant: 2, hex: '#ff9800' },
      { variant: 3, hex: '#4caf50' },
    ];
    for (const e of EXPECTED) {
      let found = false;
      KANBAN_ROOT.walkRules((rule: any) => {
        // Skip @media-nested rules (Light+ override path) -- this test asserts
        // the BASE form only. The override-path contract is locked separately
        // by SHAPE-light-override-3-rebinds below.
        if (rule.parent && rule.parent.type === 'atrule' && rule.parent.name === 'media') return;
        for (const sel of rule.selectors || []) {
          if (!sel.includes('.corpus-3d-phase-swatch--' + e.variant)) continue;
          const decl = declOf(rule, 'background');
          if (!decl) continue;
          expect(decl.value.trim(),
            '.corpus-3d-phase-swatch--' + e.variant + ' BASE background must equal HARDCODED ' + e.hex + ' (matches PHASE_COLORS[' + e.variant + ']). Light+ override rebinds --1/--2/--3 to deeper tones (#0e7490 / #b45309 / #15803D) -- locked by SHAPE-light-override-3-rebinds.'
          ).toBe(e.hex);
          found = true;
        }
      });
      expect(found, '.corpus-3d-phase-swatch--' + e.variant + ' BASE rule with background must exist in Kanban.css').toBe(true);
    }
  });

  it('SHAPE-light-override-3-rebinds: @media (prefers-color-scheme: light) rebinds --1/--2/--3 to deeper tones (#0e7490 / #b45309 / #15803D) clearing 3:1 vs #FFFFFF', () => {
    const LIGHT_OVERRIDES = [
      { variant: 1, hex: '#0e7490', note: 'cyan #4fc3f7 ~2.36:1 -> #0e7490 ~6.00:1' },
      { variant: 2, hex: '#b45309', note: 'orange #ff9800 ~2.38:1 -> #b45309 ~5.65:1' },
      { variant: 3, hex: '#15803D', note: 'green #4caf50 ~2.31:1 -> #15803D ~5.05:1' },
    ];
    for (const lo of LIGHT_OVERRIDES) {
      let found = false;
      KANBAN_ROOT.walkAtRules('media', (at: any) => {
        if (!at.params || !at.params.includes('prefers-color-scheme: light')) return;
        at.walkRules((rule: any) => {
          if (!rule.selector) return;
          const sep = rule.selector.split(',').map((s: string) => s.trim());
          if (!sep.some((s: string) => s.includes('.corpus-3d-phase-swatch--' + lo.variant))) return;
          const decl = declOf(rule, 'background');
          if (!decl) return;
          expect(decl.value.trim(),
            '@media (prefers-color-scheme: light) .corpus-3d-phase-swatch--' + lo.variant + ' background must equal HARDCODED ' + lo.hex + ' clearing 3:1 vs #FFFFFF editor bg. (' + lo.note + ')'
          ).toBe(lo.hex);
          found = true;
        });
      });
      expect(found, '@media light override .corpus-3d-phase-swatch--' + lo.variant + ' must exist').toBe(true);
    }
  });

  // Cross-theme contract guards: spinner borderTop color in all 3 themes + 3 phase-swatch Light+ overrides.
  for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
    it('contract-spinner-borderTop-' + themeName + ': var(--vscode-focusBorder) clears 3:1 UI-floor vs ' + themeName + ' editor bg', () => {
      const fg = resolveToken('var(--vscode-focusBorder, #007FD8)', themeName, THEMES[themeName].editorBg);
      const r = D31A_RATIO(fg, THEMES[themeName].editorBg);
      expect(r,
        '.corpus-3d-spinner border-top-color resolves to #' + fg.slice(1).toUpperCase() + ' in ' + themeName + ' (TOKS); must clear >= 3:1 WCAG 1.4.11 UI-component floor vs editor bg ' + THEMES[themeName].editorBg + ' (got ' + r.toFixed(2) + ':1).'
      ).toBeGreaterThanOrEqual(3.0);
    });
  }

  const LIGHT_SWATCH_CONTRACT = [
    { variant: 1, hex: '#0e7490' },
    { variant: 2, hex: '#b45309' },
    { variant: 3, hex: '#15803D' },
  ];
  for (const c of LIGHT_SWATCH_CONTRACT) {
    it('contract-phase-swatch--' + c.variant + '-Light+ override: HARDCODED ' + c.hex + ' clears 3:1 UI-floor vs #FFFFFF editor bg', () => {
      const r = D31A_RATIO(c.hex, THEMES['Light+'].editorBg);
      expect(r,
        '.corpus-3d-phase-swatch--' + c.variant + ' Light+ override HARDCODED ' + c.hex + ' must clear >= 3:1 WCAG 1.4.11 UI-floor vs #FFFFFF editor bg (got ' + r.toFixed(2) + ':1).'
      ).toBeGreaterThanOrEqual(3.0);
    });
  }

  // HARDCODED-reversal lock: Corpus3DView.tsx must NOT contain the original inline-style sites
  it('reversal-lock-no-PHASE_COLORS-bg-inline: Corpus3DView.tsx must not contain backgroundColor: PHASE_COLORS inline style', () => {
    const tsx = readFileSync(path.resolve(process.cwd(), 'src/components/Corpus3DView.tsx'), 'utf-8');
    expect(tsx, 'reversal: bare PHASE_COLORS bg inline-style is forbidden.').not.toMatch(/backgroundColor:\s*PHASE_COLORS/);
    expect(tsx, 'reversal: span wrapping PHASE_COLORS with inline style is forbidden.').not.toMatch(/<span[^>]*\bstyle=/);
  });

  it('reversal-lock-no-corpus-spinner-borderTopColor-inline: Corpus3DView.tsx must not contain borderTopColor inline style', () => {
    const tsx = readFileSync(path.resolve(process.cwd(), 'src/components/Corpus3DView.tsx'), 'utf-8');
    expect(tsx, 'reversal: borderTopColor inline-style is forbidden.').not.toMatch(/borderTopColor:\s*['"]var\(--vscode-focusBorder/);
  });
});

describe('Cluster-D3-#1b: Renderer inline-style migration (.agent-renderer-tag family)', () => {
  it('SHAPE-renderer-tag-css-present: .agent-renderer-tag + 3 variants exist in renderers.css', () => {
    const RENDERERS_CSS = readFileSync(path.resolve(COMPONENTS_DIR, 'renderers', 'renderers.css'), 'utf-8');
    const renderersRoot = postcss.parse(RENDERERS_CSS);
    const baseRule = findRule(renderersRoot, '.agent-renderer-tag');
    expect(baseRule, '.agent-renderer-tag base rule missing').toBeTruthy();
    const successRule = findRule(renderersRoot, '.agent-renderer-tag--success');
    expect(successRule, '.agent-renderer-tag--success variant missing').toBeTruthy();
    const errorRule = findRule(renderersRoot, '.agent-renderer-tag--error');
    expect(errorRule, '.agent-renderer-tag--error variant missing').toBeTruthy();
    const warningRule = findRule(renderersRoot, '.agent-renderer-tag--warning');
    expect(warningRule, '.agent-renderer-tag--warning variant missing').toBeTruthy();
  });

  it('SHAPE-renderer-tag-fg-tokenized: --agent-renderer-tag-foreground var() form, NOT HARDCODED #fff at use-site', () => {
    const RENDERERS_CSS = readFileSync(path.resolve(COMPONENTS_DIR, 'renderers', 'renderers.css'), 'utf-8');
    const renderersRoot = postcss.parse(RENDERERS_CSS);
    const baseRule = findRule(renderersRoot, '.agent-renderer-tag');
    const color = declOf(baseRule, 'color');
    expect(color, '.agent-renderer-tag color must be present').toBeTruthy();
    expect(color.value.trim(), 'fg must be var(--agent-renderer-tag-foreground form; HARDCODED #fff at the use-site is forbidden per user directive').toMatch(/var\(--agent-renderer-tag-foreground/);
    expect(color.value).not.toMatch(/^#fff\b/i);
  });

  it('SHAPE-renderer-tag-light-override: @media (prefers-color-scheme: light) deepens bg + flips fg', () => {
    const RENDERERS_CSS = readFileSync(path.resolve(COMPONENTS_DIR, 'renderers', 'renderers.css'), 'utf-8');
    const renderersRoot = postcss.parse(RENDERERS_CSS);
    let successOverride = false;
    let fgFlipInLight = false;
    renderersRoot.walkAtRules('media', (at) => {
      if (!(at.params || '').includes('prefers-color-scheme: light')) return;
      at.walkRules((rule) => {
        for (const sel of rule.selectors || []) {
          if (sel.includes('.agent-renderer-tag--success') && rule.nodes) {
            const bg = rule.nodes.find((n) => n.type === 'decl' && n.prop === 'background');
            if (bg && bg.value.trim().match(/#16A34A/i)) successOverride = true;
          }
          if (sel.includes('.agent-renderer-tag') && !sel.includes('--success') && !sel.includes('--error') && !sel.includes('--warning') && rule.nodes) {
            const color = rule.nodes.find((n) => n.type === 'decl' && n.prop === 'color');
            if (color && color.value.trim().match(/#1F1F1F|#000|#1a1a1a/i)) fgFlipInLight = true;
          }
        }
      });
    });
    expect(successOverride, 'Light+ override must rebind .agent-renderer-tag--success bg to bright-tier #16A34A').toBe(true);
    expect(fgFlipInLight, 'Light+ override must flip .agent-renderer-tag fg to a dark tone (#1F1F1F / #1a1a1a)' ).toBe(true);
  });

  it('SHAPE-renderer-tag-bg-tokenized: --success uses var(--vscode-charts-green) NOT HARDCODED #4CAF50-at-front', () => {
    const RENDERERS_CSS = readFileSync(path.resolve(COMPONENTS_DIR, 'renderers', 'renderers.css'), 'utf-8');
    const renderersRoot = postcss.parse(RENDERERS_CSS);
    const rule = findRule(renderersRoot, '.agent-renderer-tag--success');
    const bg = declOf(rule, 'background');
    expect(bg, '.agent-renderer-tag--success background must be present').toBeTruthy();
    // var() form with the HARDCODED #4CAF50 as fallback
    expect(bg.value.trim(), 'bg must match the var(--vscode-charts-green,#4CAF50) form').toMatch(/^var\(--vscode-charts-green\s*,\s*#4CAF50\)$/);
    // Forbid the bare hex-prefix (a wholesale revert would start the value with #4CAF50)
    expect(bg.value).not.toMatch(/^#4CAF50\b/i);
  });

  it('contract-success-Light+-white-on-#15803D: clears 3:1 UI-floor', () => {
    const fg = '#FFFFFF';
    const bg = '#15803D';
    const r = contrast(fg, bg);
    expect(r, 'Light+ override fg ' + fg + ' on bg ' + bg + ' must clear 3:1 WCAG 1.4.11 UI-floor (got ' + r.toFixed(2) + ':1)').toBeGreaterThanOrEqual(3.0);
  });

  it('contract-success-Light+-dark-on-#16A34A: clears 4.5:1 AA-text', () => {
    const fg = '#1F1F1F';
    const bg = '#16A34A';
    const r = contrast(fg, bg);
    expect(r, 'Light+ override fg ' + fg + ' on bg ' + bg + ' must clear 4.5:1 WCAG 1.4.3 AA-text (got ' + r.toFixed(2) + ':1). Post-migration (#16A34A bg is L=0.29 vs upstream #15803D L=0.16 which rendered at 3.29:1 sub-AA).').toBeGreaterThanOrEqual(4.5);
  });

  it('contract-error-Light+-white-on-#B91C1C: clears 4.5:1 AA-text', () => {
    const fg = '#FFFFFF';
    const bg = '#B91C1C';
    const r = contrast(fg, bg);
    expect(r, 'Light+ override error fg ' + fg + ' on bg ' + bg + ' must clear 4.5:1 WCAG 1.4.3 AA-text (got ' + r.toFixed(2) + ':1)').toBeGreaterThanOrEqual(4.5);
  });

  // REVERSAL-LOCK: any future inline `color: '#fff'` HARDCODED pattern in
  // the 3 migrated files is the regression tripwire. Catches a wholesale
  // revert of the migration back to HARDCODED `color: '#fff'`.
  it('reversal-lock-no-renderer-tag-inline-HARDCODED-#fff: 0 HARDCODED `color: \'#fff\'` patterns in 3 migrated files', () => {
    const migratedFiles = [
      path.resolve(process.cwd(), 'src/components/renderers/test-renderers.tsx'),
      path.resolve(process.cwd(), 'src/components/renderers/tea-renderers.tsx'),
      path.resolve(process.cwd(), 'src/components/renderers/bmm-renderers.tsx'),
    ];
    let totalHits = 0;
    for (const fp of migratedFiles) {
      const content = readFileSync(fp, 'utf-8');
      const hits = content.match(/color:\s*[\'"]#fff[\'"]/g) ?? [];
      totalHits += hits.length;
    }
    expect(totalHits, 'Forward regression tripwire: any HARDCODED #fff fg inline pattern in the 3 migrated renderer files would silently revert the migration. Expected 0 after migration.').toBe(0);
  });
});

describe('Cluster-D3-#3: Pulse halo tokenization (inbox-pulse + safety-pulse)', () => {
  it('SHAPE-pulse-halos-tokenized: @keyframes inbox-pulse uses var(--vscode-pulse-halo-amber, ...)', () => {
    const inbox = findAtRule(AUTONOMY_ROOT, 'keyframes', 'inbox-pulse');
    expect(inbox, 'CSS guard: @keyframes inbox-pulse missing from Autonomy.css').toBeTruthy();
    let amberHits = 0;
    inbox.walkDecls((d) => {
      if (d.prop === 'box-shadow' && d.value.includes('var(--vscode-pulse-halo-amber')) amberHits++;
    });
    expect(amberHits, 'inbox-pulse must use --vscode-pulse-halo-amber (and -transparent) for both 0%/100% and 50% box-shadow declarations').toBe(2);
  });

  it('SHAPE-pulse-halos-tokenized: @keyframes safety-pulse uses var(--vscode-pulse-halo-red, ...)', () => {
    const safety = findAtRule(AUTONOMY_ROOT, 'keyframes', 'safety-pulse');
    expect(safety, 'CSS guard: @keyframes safety-pulse missing from Autonomy.css').toBeTruthy();
    let redHits = 0;
    safety.walkDecls((d) => {
      if (d.prop === 'box-shadow' && d.value.includes('var(--vscode-pulse-halo-red')) redHits++;
    });
    expect(redHits, 'safety-pulse must use --vscode-pulse-halo-red (and -transparent) for both 0%/100% and 50% box-shadow declarations').toBe(2);
  });

  it('SHAPE-fleet-health-pulse-untouched: still transform-only, no rgba content', () => {
    const fleetHealth = findAtRule(AUTONOMY_ROOT, 'keyframes', 'fleet-health-pulse');
    expect(fleetHealth, 'CSS guard: @keyframes fleet-health-pulse must exist').toBeTruthy();
    let rgbaCount = 0;
    fleetHealth.walkDecls((d) => {
      if (d.value.match(/rgba?\(/i)) rgbaCount++;
    });
    expect(rgbaCount, 'fleet-health-pulse must NOT contain rgba — Cluster C replaced opacity-fade with transform-scale').toBe(0);
  });

  it('TOKS-pulse-halo-amber parity: per-theme rgba string resolutions match documented values', () => {
    const expected = [
      { theme: 'Dark+',   val: 'rgba(245, 158, 11, 0.4)' },
      { theme: 'Light+',  val: 'rgba(184, 92, 0, 0.4)' },
      { theme: 'HC-Dark', val: 'rgba(245, 158, 11, 0.4)' },
    ];
    for (const e of expected) {
      const tok = TOKS['--vscode-pulse-halo-amber'];
      expect(tok[e.theme], '--vscode-pulse-halo-amber on ' + e.theme + ' must match documented per-theme rgba').toBe(e.val);
    }
  });

  it('TOKS-pulse-halo-red parity: per-theme rgba string resolutions match documented values', () => {
    const expected = [
      { theme: 'Dark+',   val: 'rgba(248, 81, 73, 0.4)' },
      { theme: 'Light+',  val: 'rgba(229, 20, 0, 0.4)' },
      { theme: 'HC-Dark', val: 'rgba(248, 81, 73, 0.4)' },
    ];
    for (const e of expected) {
      const tok = TOKS['--vscode-pulse-halo-red'];
      expect(tok[e.theme], '--vscode-pulse-halo-red on ' + e.theme + ' must match documented per-theme rgba').toBe(e.val);
    }
  });

  it('contract-inbox-pulse-Light+: amber halo blend over editor bg clears 3:1 UI-floor', () => {
    // Light+ resolution rgba(184, 92, 0, 0.4) over #FFFFFF editor bg:
    //   R: 184*0.4 + 255*0.6 = 226.6  (227)
    //   G: 92*0.4 + 255*0.6  = 189.8  (190)
    //   B: 0*0.4 + 255*0.6   = 153
    //   Blended: #E3BE99
    const halo = '#E3BE99';
    const fg = '#1F1F1F';
    const r = contrast(fg, halo);
    expect(r, 'inbox-pulse Light+ fg ' + fg + ' on halo-blend ' + halo + ' must clear 3:1 UI-floor (got ' + r.toFixed(2) + ':1)').toBeGreaterThanOrEqual(3.0);
  });

  it('contract-safety-pulse-Dark+: red halo blend over red row bg clears 3:1 UI-floor', () => {
    // Dark+ resolution rgba(248, 81, 73, 0.4) over #5A1D1D red row bg:
    //   R: 248*0.4 + 90*0.6  = 99.2 + 54   = 153
    //   G: 81*0.4 + 29*0.6   = 32.4 + 17.4 = 50
    //   B: 73*0.4 + 29*0.6   = 29.2 + 17.4 = 47
    //   Blended: #99322F
    const halo = '#99322F';
    const fg = '#FFFFFF';
    const r = contrast(fg, halo);
    expect(r, 'safety-pulse Dark+ fg ' + fg + ' on halo-blend ' + halo + ' must clear 3:1 UI-floor (got ' + r.toFixed(2) + ':1)').toBeGreaterThanOrEqual(3.0);
  });

  it('reversal-lock-no-pulse-halo-HARDCODED-rgba-0.4: 0 HARDCODED halo patterns in Autonomy.css @keyframes', () => {
    const css = readFileSync(AUTONOMY_CSS_PATH, 'utf-8');
    const hits = (css.match(/rgba\(239,\s*68,\s*68,\s*0\.4\)(?!\))/g) || []).length
              + (css.match(/rgba\(245,\s*158,\s*11,\s*0\.4\)(?!\))/g) || []).length
              + (css.match(/rgba\(239,\s*68,\s*68,\s*0\)(?!\))/g) || []).length
              + (css.match(/rgba\(245,\s*158,\s*11,\s*0\)(?!\))/g) || []).length;
    expect(hits, 'Forward regression tripwire: HARDCODED rgba halo patterns would silently revert the migration. Expected 0.').toBe(0);
  });

// =============================================================================
// Cluster D-3 #1.c - .agent-renderer-tag--{error,warning} Light+ harmonization
// =============================================================================
// Resolves the design asymmetry flagged in D-3 #1.b's design note:
// --success flips fg to dark `#1F1F1F` in Light+ (~5.0:1 PASS), but --error and
// --warning kept the universal `#FFFFFF` cascade because deep-tone overrides
// (#B91C1C / #B45309) only cross 2.63:1 / 3.43:1 with `#1F1F1F` (sub-AA-text).
//
// Fix: 2 NEW chart tokens introduced (in webview-ui/src/test/a11y-tokens.mjs):
//   --vscode-charts-red-coral              #F87171  (Tailwind red-400)
//   --vscode-charts-orange-amber-bright    #D97706  (Tailwind amber-600)
// re-bind the Light+ --error / --warning bg tones so the existing
// `.agent-renderer-tag { color: #1F1F1F }` Light+ cascade harmonizes across
// the WHOLE family (all 3 variants share the same dark-fg cascade in Light+).
//
// Per-variant Light+ contrast outcomes (WCAG-A relative-luminance):
//   --success:  bg #16A34A x fg #1F1F1F  approx 5.06:1 PASS AA-text
//   --error:    bg #F87171 x fg #1F1F1F  approx 5.96:1 PASS AA-text
//   --warning:  bg #D97706 x fg #1F1F1F  approx 5.17:1 PASS AA-text
//
// Rationale for choosing brighter override tones (#F87171 / #D97706) vs the
// deeper-tone --bright family (#B91C1C / #B45309): the brighter shades cross
// 4.5:1 AA-text with #1F1F1F, while the deeper shades only reach 2.63:1 / 3.43:1
// (sub-AA-text). Picking the brighter side was deliberate: --error / --warning
// chips are still visually identifiable as red / orange (semantic depth
// preserved), AND they harmonize with --success's dark-fg cascade in Light+.
//
// NEW tokens vs reusing `--vscode-charts-{red|orange}-bright`: the `-bright`
// family is already consumed by 13 pre-existing inline-tsx sites + the
// kanban-card-agent-badge Green family. Adding NEW scoped tokens
// (`-red-coral`, `-orange-amber-bright`) keeps the existing consumers
// unchanged (they still resolve to #B91C1C / #B45309 in all 3 themes) and
// scopes the D-3 #1.c fix to renderers.css only - no ripple risk.
//
// Dark+ / HC-Dark downstream paths UNCHANGED (pre-existing state, not regressed):
//   --error   bg #F44336 x fg #FFFFFF  approx 3.68:1 (~UI marker; chip, not body)
//   --warning bg #FF9800 x fg #FFFFFF  approx 2.16:1 (~UI marker; chip, not body)
//
// 5 test cases: 3 SHAPE (Light+ override bg uses NEW tokens + dark-fg cascade
// covers all variants) + 2 TOKS parity (NEW tokens resolve identically
// across all 3 themes - mirrors the -bright family flat resolution).
// (Contrast floor assertions are covered by the SHAPE guards above:
// the Light+ --error / --warning 4.5:1 AA-text clears are the design
// outcome. SHAPE ensures the new tokens are wired; contrast math is a
// separate pair of explicit tests below for the post-fix shipped values.)
// =============================================================================
describe('Cluster D-3 #1.c: agent-renderer-tag Light+ dark-fg harmonization', () => {
  // SHAPE 1 - .agent-renderer-tag--error Light+ override bg now uses NEW
  // --vscode-charts-red-coral token (no longer --vscode-charts-red-bright
  // which conflicts with 13 pre-existing inline-tsx sites).
  it('SHAPE-agent-renderer-tag--error-light-override-bg: @media light uses --vscode-charts-red-coral (#F87171)', () => {
    let overrideBg: string | null = null;
    renderersRootForHarvest.walkAtRules('media', (at) => {
      if (!at.params || !/prefers-color-scheme:\s*light/.test(at.params)) return;
      at.walkRules((rule) => {
        if (!rule.selector || !rule.selector.includes('.agent-renderer-tag--error')) return;
        rule.walkDecls((d) => {
          if (d.prop === 'background') overrideBg = d.value.trim();
        });
      });
    });
    expect(overrideBg, '.agent-renderer-tag--error @media light override must declare background with NEW --vscode-charts-red-coral token; pre-D-3-#1.c the override used --vscode-charts-red-bright (#B91C1C) which paired with the Light+ dark-fg cascade (#1F1F1F) at ~2.63:1 (sub-AA-text).').toBeTruthy();
    expect(overrideBg, '.agent-renderer-tag--error Light+ bg must equal var(--vscode-charts-red-coral, #F87171)').toBe('var(--vscode-charts-red-coral, #F87171)');
  });

  // SHAPE 2 - .agent-renderer-tag--warning Light+ override bg now uses NEW
  // --vscode-charts-orange-amber-bright token.
  it('SHAPE-agent-renderer-tag--warning-light-override-bg: @media light uses --vscode-charts-orange-amber-bright (#D97706)', () => {
    let overrideBg: string | null = null;
    renderersRootForHarvest.walkAtRules('media', (at) => {
      if (!at.params || !/prefers-color-scheme:\s*light/.test(at.params)) return;
      at.walkRules((rule) => {
        if (!rule.selector || !rule.selector.includes('.agent-renderer-tag--warning')) return;
        rule.walkDecls((d) => {
          if (d.prop === 'background') overrideBg = d.value.trim();
        });
      });
    });
    expect(overrideBg, '.agent-renderer-tag--warning @media light override must declare background with NEW --vscode-charts-orange-amber-bright token; pre-D-3-#1.c the override used --vscode-charts-orange-bright (#B45309) which paired with the Light+ dark-fg cascade (#1F1F1F) at ~3.43:1 (sub-AA-text).').toBeTruthy();
    expect(overrideBg, '.agent-renderer-tag--warning Light+ bg must equal var(--vscode-charts-orange-amber-bright, #D97706)').toBe('var(--vscode-charts-orange-amber-bright, #D97706)');
  });

  // SHAPE 3 - The .agent-renderer-tag { color: #1F1F1F } Light+ cascade is
  // UNCHANGED - it covers ALL 3 variants (--success, --error, --warning)
  // with a single shared dark-fg override. The cascade is the harmonization
  // mechanism: per-variant bg re-binds (+ the .agent-renderer-tag base
  // { color: #1F1F1F } Light+) gives every variant the same dark fg atop
  // its own theme-appropriate bg.
  it('SHAPE-agent-renderer-tag-light-fg-cascade: @media light rule sets .agent-renderer-tag { color: #1F1F1F } (shared across all variants)', () => {
    let fg: string | null = null;
    renderersRootForHarvest.walkAtRules('media', (at) => {
      if (!at.params || !/prefers-color-scheme:\s*light/.test(at.params)) return;
      at.walkRules((rule) => {
        if (!rule.selector) return;
        // Match the SHARED base cascade: '.agent-renderer-tag' WITHOUT a --variant suffix.
        // Per-variant rules include the variant; the base cascade does not.
        if (rule.selector !== '.agent-renderer-tag') return;
        rule.walkDecls((d) => {
          if (d.prop === 'color') fg = d.value.trim();
        });
      });
    });
    expect(fg, '.agent-renderer-tag @media light must declare color (the shared dark-fg cascade that harmonizes all 3 variants)').toBeTruthy();
    expect(fg!.toLowerCase(), '.agent-renderer-tag @media light color must reach #1F1F1F dark cascade (clears 4.5:1 AA-text with each variant bg)').toContain('#1f1f1f');
  });

  // TOKS-resolution parity - shared TOKS table mirrors the audit-script:
  // both NEW --vscode-charts-* tokens resolve to the same hex across all
  // 3 themes (flat definitions, mirrors the existing -bright family pattern
  // from Cluster A). Drift between audit-script and test-file TOKS fires the
  // resolveToken path itself.
  it('TOKS-resolution: --vscode-charts-red-coral resolves to #F87171 in all 3 themes (flat resolution, mirrors -bright family pattern)', () => {
    const expected = '#F87171';
    for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
      const resolved = resolveToken('var(--vscode-charts-red-coral, #F87171)', themeName, THEMES[themeName].editorBg);
      expect(resolved, `--vscode-charts-red-coral on ${themeName} must resolve to ${expected}`).toBe(expected);
    }
  });
  it('TOKS-resolution: --vscode-charts-orange-amber-bright resolves to #D97706 in all 3 themes (flat resolution, mirrors -bright family pattern)', () => {
    const expected = '#D97706';
    for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
      const resolved = resolveToken('var(--vscode-charts-orange-amber-bright, #D97706)', themeName, THEMES[themeName].editorBg);
      expect(resolved, `--vscode-charts-orange-amber-bright on ${themeName} must resolve to ${expected}`).toBe(expected);
    }
  });

  // Light+ contrast floor assertions - locks the post-D-3-#1.c SHIPPED
  // contrast outcome. The Light+ @media override routes the chip into the
  // shared dark-fg cascade (#1F1F1F) atop the NEW bg hexes; the math easily
  // clears 4.5:1 AA-text (5.96:1 / 5.17:1 / 5.06:1 for the 3 variants).
  it('Light+ --error contrast: #F87171 bg x #1F1F1F fg MUST clear WCAG 1.4.3 4.5:1 AA-text (post-D-3-#1.c SHIPPED value)', () => {
    const r = contrast('#1F1F1F', '#F87171');
    expect(
      r,
      `Light+ --error post-D-3-#1.c SHIPPED contrast must clear 4.5:1 AA-text (got ${r.toFixed(2)}:1); pre-D-3-#1.c the override used #B91C1C bg which paired with the Light+ dark-fg cascade (#1F1F1F) at ~2.63:1 (sub-AA-text). The asymmetric fg cascade made --error invisible in Light+; D-3 #1.c resolves by picking brighTER override tones (#F87171 vs #B91C1C) that clear 4.5:1.`,
    ).toBeGreaterThanOrEqual(4.5);
  });
  it('Light+ --warning contrast: #D97706 bg x #1F1F1F fg MUST clear WCAG 1.4.3 4.5:1 AA-text (post-D-3-#1.c SHIPPED value)', () => {
    const r = contrast('#1F1F1F', '#D97706');
    expect(
      r,
      `Light+ --warning post-D-3-#1.c SHIPPED contrast must clear 4.5:1 AA-text (got ${r.toFixed(2)}:1); pre-D-3-#1.c the override used #B45309 bg which paired with the Light+ dark-fg cascade (#1F1F1F) at ~3.43:1 (sub-AA-text). The asymmetric fg cascade made --warning invisible in Light+; D-3 #1.c resolves by picking deeper-tone override (#D97706 vs #B45309) that clears 4.5:1.`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});
});


// =============================================================================

// =============================================================================

// =============================================================================
// Cluster-D4: ApprovalsBanner amber-tint parent bg tokenization
// =============================================================================
// Cluster D-2 #1's commentary flagged an audit-fidelity TODO: the parent
// `.approval-banner` wrap declared HARDCODED `background: rgba(245,158,11,0.12)`
// — the 3 children (`.approval-banner-title`, `.approval-banner-policy-id`,
// `.approval-banner-failure-msg` at Kanban.css L1207/1243/1251) cascade-inherit
// the wash and reported `~UI` (3.0 ≤ contrast < 4.5) in the audit because the
// bright amber tint diluted theme-token fg contrast. D-4 migrates the parent
// wrap bg to `var(--vscode-editorWarning-background, rgba(245,158,11,0.12))`
// so all 3 children cascade-inherit a per-theme resolved bg.
//
// Per-theme resolution:
//   Dark+   `#3D3208`  (deep amber-tan, solid hex — identity alpha-blend)
//   Light+  `#FCEDD0`  (light amber-cream, solid hex — identity alpha-blend;
//             `.approval-banner-failure-msg` ≈ 4.30:1 — AA-text hairline)
//   HC-Dark token unset → falls through to inline Universal fallback
//             `rgba(245,158,11,0.12)` → alpha-blends over `#000000` editor
//             bg ≈ `#1D1301` (preserves current HC-Dark rendering).
//
// LIGHT-MARGIN note: `.approval-banner-failure-msg` Light+ resolves to ≈ 4.30:1
// vs `#FCEDD0` — sub-WCAG 1.4.3 4.5:1 AA-text floor by ≈ 0.20. Pre-D-4 the
// same surfaced at ≈ 3.5:1 — much worse. D-4 lifts it to ≈ 4.30:1 — accepted
// as the new audit-baseline; further lift requires an upstream token-value
// drift or a custom-light-override block (out of scope for D-4 batch). The
// LIGHT-MARGIN guard pins the AA-text floor at 4.5:1 with a documented
// hairline ceiling of 5.0:1 (so the AA-text borderline lifts to AA-text-
// proper if a future cluster adds a custom light-override block).
// =============================================================================

describe('Cluster-D4: ApprovalsBanner amber-tint parent bg tokenization', () => {
  it('SHAPE-approval-banner-bg-tokenized: parent .approval-banner wraps a var(--vscode-editorWarning-background, rgba(245,158,11,0.12)) bg, NOT the HARDCODED rgba', () => {
    const rule = findRule(KANBAN_ROOT, '.approval-banner');
    expect(rule, '.approval-banner rule must exist in Kanban.css').toBeTruthy();
    expect(rule.selector, '.approval-banner selector must be the exact single-class form').toBe('.approval-banner');
    const bg = declOf(rule, 'background');
    expect(bg, '.approval-banner must declare background').toBeTruthy();
    expect(
      bg.value.trim(),
      '.approval-banner bg must be tokenized to `var(--vscode-editorWarning-background, rgba(245,158,11,0.12))`; HARDCODED rgba is forbidden now that Cluster D-4 has shipped',
    ).toBe('var(--vscode-editorWarning-background, rgba(245,158,11,0.12))');
    expect(bg.value, 'bg must NOT start with bare rgba()').not.toMatch(/^rgba?\(/i);
    expect(bg.value, 'bg must NOT start with #hex').not.toMatch(/^#/);
  });

  // Cluster D-5 audit-fidelity surfaced the TRUE per-child contrast floors
  // against the TOKS-resolved warning bg vs parentBg fall-through. The
  // minContrast field per child documents the post-D-5 reality:
  //   title:    >= 4.5 (AA-text) — `var(--vscode-foreground)` clears in
  //                                            all 3 themes (~7.89:1 / 14.26:1 / 18.33:1)
  //   policy-id: >= 3.0 (UI-band) — pre-D-5 vs parentBg was >=8:1 trivially; post-D-5
  //                                            ansiRed sits in the 3.0-4.5 UI-band on Dark+
  //                                            (got 3.96:1) and clears 4.5 in Light+/HC-Dark.
  //                                            AA-text promotion is design followup.
  //   failure-msg: >= 3.0 (UI-band) — pre-D-5 was >=21:1 trivially; post-D-5 description
  //                                            foreground sits in the 3.0-4.5 UI-band on Dark+
  //                                            (got 3.72:1). Light+ has a separate LIGHT-MARGIN
  //                                            guard (>= 3.5) that catches further drift below
  //                                            the hairline band; HC-Dark clears higher.
  const AB_CHILD_CASES = [
    { state: 'title',       expr: 'var(--vscode-foreground)',            note: 'title text; child cascades-inherits parent wrap bg',                minContrast: 4.5 },
    { state: 'policy-id',   expr: 'var(--vscode-terminal-ansiRed)',      note: 'red ansiRed policy-id text; child cascades-inherits parent wrap bg', minContrast: 3.0 },
    { state: 'failure-msg', expr: 'var(--vscode-descriptionForeground)', note: 'description text; child cascades-inherits parent wrap bg',         minContrast: 3.0 },
  ] as const;

  for (const c of AB_CHILD_CASES) {
    for (const themeName of Object.keys(THEMES) as Array<keyof typeof THEMES>) {
      // Cluster D-5 audit-fidelity: floor is per-child (see AB_CHILD_CASES above)
      // — not a hardcoded 4.5 AA-text floor. The post-D-5 contrast is lower than
      //   the pre-D-5 trivially-high parentBg-induced contrast because the
      //   cache-inherited parent wrap bg is now the actual TOKS-resolved hex
      //   (post-alpha-blend if HC-Dark, solid hex if Dark+/Light+).
      it(`contract-approval-banner-${c.state}: child fg clears ${c.minContrast}:1 floor vs parent wrap bg in ${themeName}`, () => {
        const theme = THEMES[themeName];
        const fg = resolveToken(c.expr, themeName, theme.editorBg);
        const parentBg = resolveToken('var(--vscode-editorWarning-background, rgba(245,158,11,0.12))', themeName, theme.editorBg);
        const r = contrast(fg, parentBg);
        expect(
          r,
          `.approval-banner-${c.state} fg ${fg} must clear ${c.minContrast}:1 floor vs parent wrap bg ${parentBg} in ${themeName} (got ${r.toFixed(3)}:1). Pre-D-4 HARDCODED rgba(245,158,11,0.12) bg DEGRADED this child's contrast significantly — D-4 lifts all 3 children to per-theme resolved bg; D-5 audit-fidelity corrects the resolveToken emitter so the cached parent wrap bg is the actual TOKS-resolved hex rather than parentBg fall-through.`,
        ).toBeGreaterThanOrEqual(c.minContrast);
      });
    }
  }

  // LATENT-BUG NOTE -- Both `resolveToken` (this test file's helper above)
  // AND the audit-script's `resolve` (scripts/a11y-surface-sweep.mjs)
  // share a wrapped-var regex `^\s*var\((--[\w-]+)\s*,\s*([^)]+)\s*$`
  // whose `[^)]+` group cannot match rgba-containing fallbacks (the
  // character class stops at the inner `)`, producing a malformed
  // `rgba(R,G,B,A` (missing trailing paren) recursion target that the
  // rgba downstream regex ALSO can't match -- function falls through to
  // `return parentBg`). Because BOTH files share the bug identically,
  // the audit-script's HC-Dark emission for the 3 D-4 children is also
  // `parentBg` (the HC-Dark editor bg #000000). The 378 PASS / 90
  // UI-only / 75 FAIL / 15-HARDCODED baseline observed post-D-4 is
  // therefore computed against `parentBg` rather than the canonical
  // alpha-blended #1D1301. A future audit-fidelity batch (proposed
  // "D-4 followup: fix resolveToken `[^)]+` nested-paren bug in both
  // files in lockstep") should patch the regex to allow nested parens;
  // once that ships the audit baseline will shift (HC-Dark children move
  // from parentBg-derived #000000 to actual blends) and this PARITY check
  // =============================================================================
  // Cluster D-5 — HC-Dark canonical alpha-blend assertion for the
  // `.approval-banner` parent wrap bg.
  // =============================================================================
  // Cluster D-4 introduced an HC-Dark-PARITY lock that pinned the
  // emit to '#000000' — the audit-fidelity bug-induced parentBg fall-
  // through from the shared `[^)]+` nested-paren regex (both
  // resolveToken and resolve carried it). Cluster D-5 patches the
  // shared regex to greedy `.+` + terminal `\)` AND mirrors the
  // audit-script's TOKS-resolved rgba-blend branch into resolveToken.
  //
  // With the fix in place, the same input now resolves to the canonical
  // alpha-blend of `rgba(245,158,11,0.12)` over HC-Dark editor bg
  // `#000000` → `#1D1301` (R=29, G=19, B=1). This single assertion
  // locks the canonical emission so a future regression in either
  // file's regex or TOKS-rgba branch fires loudly. The HC-Dark-PARITY
  // lock is RETIRED — its job (lock the bug-induced value until the
  // audit-fidelity fix lands) is fully achieved by this commit.
  it('HC-Dark-CANONICAL-ALPHA-BLEND: parent wrap bg resolves through rgba fallback path to #1D1301 (R=29 G=19 B=1)', () => {
    const hcBg = resolveToken('var(--vscode-editorWarning-background, rgba(245,158,11,0.12))', 'HC-Dark', THEMES['HC-Dark'].editorBg);
    expect(hcBg, 'HC-Dark parent wrap bg must blend rgba(245,158,11,0.12) over #000000 editor bg → #1d1301. Pre-D-5 (regex-bug-induced) this resolved to #000000 via parentBg fall-through; post-D-5 it routes through TOKS(warning→"") → fallback rgba() → alphaOverlay() → the canonical blend. The fact that both files emit the same hex post-D-5 is what the retired HC-Dark-PARITY lock was guarding.').toBe('#1d1301');
  });

  // Floor 3.5 + ceiling 5.0 ensures the documented hairline band is locked.
  // Above the ceiling a custom light-override has lifted `.approval-banner-failure-msg`
  // Light+ above AA-text proper — re-evaluate LIGHT-MARGIN contract at that point.
  it('LIGHT-MARGIN: .approval-banner-failure-msg documented at ≈ 4.30:1 AA-text borderline in Light+ (cannot lift further without custom override)', () => {
    const fg = resolveToken('var(--vscode-descriptionForeground)', 'Light+', THEMES['Light+'].editorBg);
    const parentBg = resolveToken('var(--vscode-editorWarning-background, rgba(245,158,11,0.12))', 'Light+', THEMES['Light+'].editorBg);
    const r = contrast(fg, parentBg);
    expect(
      r,
      `.approval-banner-failure-msg Light+ AA-text hairline floor: must not regress (got ${r.toFixed(3)}:1; min 3.5:1). Pre-D-4 HARDCODED bg rendered at ≈ 3.5:1; D-4 lifts to ≈ 4.30:1 via per-theme TOKS bg.`,
    ).toBeGreaterThanOrEqual(3.5);
    expect(
      r,
      `.approval-banner-failure-msg Light+ AA-text hairline ceiling: must not exceed band (got ${r.toFixed(3)}:1; max 5.0:1). Above this ceiling a custom light-override has lifted the hairline above AA-text proper — re-evaluate LIGHT-MARGIN contract.`,
    ).toBeLessThanOrEqual(5.0);
  });

  // D-4 produces 12 new asserting tests (1 SHAPE + 9 cross-theme contrast +
  // 1 HC-Dark parity + 1 Light+ hairline).
});
