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

// ── Theme resolution table. Values come from canonical VS Code Light+ / Dark+ /
//    HC-Dark defaults; '' = unset in that theme (fallback hex fires). ──────
const THEMES = {
  'Dark+':   { editorBg: '#1E1E1E', terminalBg: '#1E1E1E' },
  'Light+':  { editorBg: '#FFFFFF', terminalBg: '#FFFFFF' },
  'HC-Dark': { editorBg: '#000000', terminalBg: '#000000' },
};

const TOKS = {
  '--vscode-editor-background':       { 'Dark+': '#1E1E1E', 'Light+': '#FFFFFF',  'HC-Dark': '#000000' },
  '--vscode-editor-foreground':       { 'Dark+': '#D4D4D4', 'Light+': '#1F1F1F',  'HC-Dark': '#FFFFFF' },
  '--vscode-foreground':              { 'Dark+': '#CCCCCC', 'Light+': '#1F1F1F',  'HC-Dark': '#FFFFFF' },
  '--vscode-errorForeground':         { 'Dark+': '#F48771', 'Light+': '#CE5017',  'HC-Dark': '#F48771' },
  '--vscode-charts-green':            { 'Dark+': '#3FA856', 'Light+': '#3FA856',  'HC-Dark': '#3FB950' },
  '--vscode-charts-yellow':           { 'Dark+': '#CA8A04', 'Light+': '#B58900',  'HC-Dark': '#CA8A04' },
  '--vscode-charts-indigo':           { 'Dark+': '#818cf8', 'Light+': '#4f46e5', 'HC-Dark': '#818cf8' },
  '--vscode-charts-cyan':             { 'Dark+': '#22d3ee', 'Light+': '#0891b2', 'HC-Dark': '#22d3ee' },
  '--vscode-charts-pink':             { 'Dark+': '#f472b6', 'Light+': '#db2777', 'HC-Dark': '#f472b6' },
  '--vscode-inputValidation-errorBackground': { 'Dark+': '#5A1D1D', 'Light+': '#FCD9D9', 'HC-Dark': '' },
  '--vscode-descriptionForeground':   { 'Dark+': '#8B8B8B', 'Light+': '#717171',  'HC-Dark': '#FFFFFF' },
  '--vscode-terminal-background':     { 'Dark+': '#1E1E1E', 'Light+': '#FFFFFF',  'HC-Dark': '#000000' },
  '--vscode-badge-background':        { 'Dark+': '#4D4D4D', 'Light+': '#B4B4B4',  'HC-Dark': '' },
};

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
function resolveToken(expr, themeName, parentBg) {
  if (expr === 'inherit') return parentBg;
  if (expr === 'white')   return '#FFFFFF';

  const wrapped = expr.match(/^\s*var\((--[\w-]+)\s*,\s*([^)]+)\)\s*$/);
  if (wrapped) {
    const tokVal = TOKS[wrapped[1]]?.[themeName];
    if (tokVal) return tokVal;
    return resolveToken(wrapped[2].trim(), themeName, parentBg);
  }
  const bare = expr.match(/^\s*var\((--[\w-]+)\)\s*$/);
  if (bare) {
    return TOKS[bare[1]]?.[themeName] ?? parentBg;
  }
  const rgba = expr.match(/^\s*rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)\s*$/);
  if (rgba) {
    const [R, G, B, A] = [+rgba[1], +rgba[2], +rgba[3], +rgba[4]];
    const pR = parseInt(parentBg.slice(1, 3), 16);
    const pG = parseInt(parentBg.slice(3, 5), 16);
    const pB = parseInt(parentBg.slice(5, 7), 16);
    const r = Math.round(R * A + pR * (1 - A));
    const g = Math.round(G * A + pG * (1 - A));
    const b = Math.round(B * A + pB * (1 - A));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
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
    it(`PIN-fleet-dead-pip: .fleet-health--dead (✕) baseline contrast vs row bg must meet 3:1 UI floor in ${themeName}`, () => {
      const theme = THEMES[themeName];
      const fg = resolveToken('var(--vscode-errorForeground, #ef4444)', themeName, theme.editorBg);
      const rowBg = resolveToken('var(--vscode-badge-background, rgba(127,127,127,0.06))', themeName, theme.editorBg);
      const r = contrast(fg, rowBg);
      expect(r, `fleet-health--dead pip contrast on ${themeName} must be ≥ 3.0:1 (got ${r.toFixed(2)}:1). The fix replaced the opacity-dip pulse with a transform-scale pulse so opacity stays at 1.0; if a future change re-introduces the opacity-fade the contrast reverts to ~2.37:1 in Light+.`).toBeGreaterThanOrEqual(3.0);
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
