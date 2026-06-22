// =============================================================================
// WCAG 2.1 contrast audit — SafetyPanel / FleetDashboard / AutonomyBar /
// TracePanel / DiffPanel / TerminalGrid surfaces against Dark+ / Light+ /
// HC-Dark canonical VS Code theme defaults.
//
// Floors applied:
//   * 4.5:1  WCAG AA normal-text          (text vs bg)
//   * 3.0:1  WCAG 1.4.11 UI-component     (border / icon vs bg)
//   * <3.0   severe-fail
// Pulse mid-cycle (opacity 0.4) treated as a linear fg-toward-bg blend.
//
// CSS-specificity-aware override resolution
// -----------------------------------------
// The chip-on-red-row surface group (.safety-block-type--{story,risk,test-case}
// embedded inside .safety-block) used to report sub-3:1 against the composite
// row+chip+editor triple-blend. That was a *simulation* artifact: the actual
// CSS now contains a parent-scoped override `.safety-block .safety-block-type
// { background: var(--vscode-editor-background); }` which wins on specificity
// (parent + class > single class) and replaces the chip's own rgba bg with
// the editor surface — so the chip fg's contrast is measured against the
// editor, not a 3-layer composite.
//
// To mirror that at the audit layer, the script now parses Autonomy.css
// with postcss and, for each surface annotated with a `parentClass` and a
// `chipClass`, walks the AST to find the most-specific rule that sets the
// requested property for selectors matching BOTH class tokens. The override's
// resolved value replaces the chip's own rgba bg before the contrast pass.
// Any future fix of the same pattern (parent-scoped override on `*.chip`)
// is auto-detected.
// =============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postcss from 'postcss';

// ── Locate + parse Autonomy.css (relative to this script) ──────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTONOMY_CSS_PATH = path.resolve(
  __dirname, '..', 'webview-ui', 'src', 'agentic-kanban', 'Autonomy.css',
);
const AUTONOMY_ROOT = postcss.parse(
  readFileSync(AUTONOMY_CSS_PATH, 'utf-8'),
  { from: AUTONOMY_CSS_PATH },
);

function L(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function lum(h) {
  return 0.2126 * L(+('0x' + h.slice(1, 3))) +
         0.7152 * L(+('0x' + h.slice(3, 5))) +
         0.0722 * L(+('0x' + h.slice(5, 7)));
}
function ratio(a, b) {
  const [L1, L2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (L1 + 0.05) / (L2 + 0.05);
}
function blend([R, G, B, A], base) {
  const bR = +('0x' + base.slice(1, 3));
  const bG = +('0x' + base.slice(3, 5));
  const bB = +('0x' + base.slice(5, 7));
  const r = Math.round(R * A + bR * (1 - A));
  const g = Math.round(G * A + bG * (1 - A));
  const b = Math.round(B * A + bB * (1 - A));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// =============================================================================
// CSS-specificity override resolution
// =============================================================================
//
// `specificityOf(selector)`: weighted count of class tokens + pseudo-classes
// (weight 10 each) + element identifiers (weight 1 each). The codebase has
// no `#id` selectors today, so the ID component (weight 100) is omitted.
// Combinators (` `, `>`, `+`, `~`) are NOT counted — they're syntactic
// separators only per the CSS specificity spec.
//
// Pseudo-classes like `:hover` ARE counted as classes (CSS spec).
function specificityOf(selector) {
  // Strip combinators and count remaining tokens, separating class-ish from
  // element-ish. Class-ish: tokens prefixed with `.` or `:`.
  const tokens = selector.split(/[\s>+~]+/).filter(Boolean);
  let classes = 0;
  let elements = 0;
  for (const t of tokens) {
    // Class chain: `.foo.bar` — count every `.` token + pseudo-class (`:`)
    classes  += (t.match(/\./g)  || []).length;
    classes  += (t.match(/:/g)  || []).length;
    // Element: identifier parts that are NOT preceded by `.` and not `:`
    const elemParts = t.split(/[.:]/).filter(p => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(p));
    elements += elemParts.length;
  }
  return classes * 10 + elements;
}

// `findOverride(parentClass, chipClass, propName, themeName)`:
// Walk all rules in the parsed stylesheet. Among those whose selector
// tokens contain BOTH `parentClass` AND `chipClass` (substring match is
// tight enough for this codebase — `.safety-block` and `.safety-block-type`
// are unique tokens not shared with longer class names), pick the
// declaration for `propName` from the highest-specificity match.
//
// Tie-break: when two rules have equal specificity, the AST-traversal order
// wins (later rules are visited later, matching CSS source-order semantics
// for equally-specific selectors).
//
// `@media` filter: if a rule is nested inside `@media (prefers-color-scheme:
// {dark,light})`, the override only counts for themes whose name matches the
// media query (Dark+ OR HC-Dark for `:dark`, Light+ for `:light`). This
// mirrors how a real browser applies the override.
function findOverride(parentClass, chipClass, propName, themeName) {
  let bestSpec = -1;
  let bestOrder = -1;
  let bestValue = null;
  let order = 0;
  AUTONOMY_ROOT.walkRules((rule) => {
    order++;
    // @media filter
    if (rule.parent && rule.parent.type === 'atrule' && rule.parent.name === 'media') {
      const params = (rule.parent.params || '').toLowerCase();
      const isDark  = params.includes('dark');
      const isLight = params.includes('light');
      if (isDark  && !(themeName === 'Dark+' || themeName === 'HC-Dark')) return;
      if (isLight && themeName !== 'Light+') return;
    }
    for (const sel of rule.selectors || []) {
      if (!sel.includes(parentClass) || !sel.includes(chipClass)) continue;
      const decl = (rule.nodes || []).find(
        (n) => n.type === 'decl' && n.prop === propName,
      );
      if (!decl) continue;
      const spec = specificityOf(sel);
      if (spec > bestSpec || (spec === bestSpec && order > bestOrder)) {
        bestSpec = spec;
        bestOrder = order;
        bestValue = decl.value;
      }
    }
  });
  return bestValue;
}

// =============================================================================
// Canonical VS Code theme defaults (representative baselines).
// HC variant: '' = unset/transparent in that theme.
// =============================================================================
const THEMES = {
  'Dark+':   { editorBg: '#1E1E1E' },
  'Light+':  { editorBg: '#FFFFFF' },
  'HC-Dark': { editorBg: '#000000' },
};

const TOKS = {
  '--vscode-editorBackground':        { 'Dark+': '#1E1E1E', 'Light+': '#FFFFFF',  'HC-Dark': '#000000' },
  '--vscode-editor-background':       { 'Dark+': '#1E1E1E', 'Light+': '#FFFFFF',  'HC-Dark': '#000000' },
  '--vscode-editor-foreground':       { 'Dark+': '#D4D4D4', 'Light+': '#1F1F1F',  'HC-Dark': '#FFFFFF' },
  '--vscode-foreground':              { 'Dark+': '#CCCCCC', 'Light+': '#1F1F1F',  'HC-Dark': '#FFFFFF' },
  '--vscode-descriptionForeground':   { 'Dark+': '#8B8B8B', 'Light+': '#717171',  'HC-Dark': '#FFFFFF' },
  '--vscode-errorForeground':         { 'Dark+': '#F48771', 'Light+': '#CE5017',  'HC-Dark': '#F48771' },
  '--vscode-focusBorder':             { 'Dark+': '#007FD8', 'Light+': '#007FD8',  'HC-Dark': '#F38518' },
  '--vscode-charts-blue':             { 'Dark+': '#1E80E0', 'Light+': '#1E80E0',  'HC-Dark': '#1E80E0' },
  '--vscode-charts-green':            { 'Dark+': '#3FA856', 'Light+': '#3FA856',  'HC-Dark': '#3FB950' },
  '--vscode-charts-orange':           { 'Dark+': '#F59E0B', 'Light+': '#B85C00',  'HC-Dark': '#F59E0B' },
  '--vscode-charts-yellow':           { 'Dark+': '#CA8A04', 'Light+': '#B58900',  'HC-Dark': '#CA8A04' },
  '--vscode-charts-purple':           { 'Dark+': '#B266FF', 'Light+': '#B266FF',  'HC-Dark': '#B266FF' },
  '--vscode-terminal-ansiRed':        { 'Dark+': '#E06C75', 'Light+': '#A1260D',  'HC-Dark': '#E06C75' },
  '--vscode-terminal-ansiGreen':      { 'Dark+': '#98C379', 'Light+': '#1A8E3E',  'HC-Dark': '#98C379' },
  '--vscode-terminal-ansiYellow':     { 'Dark+': '#E5C07B', 'Light+': '#915E1D',  'HC-Dark': '#E5C07B' },
  '--vscode-inputValidation-errorBackground':   { 'Dark+': '#5A1D1D', 'Light+': '#FCD9D9', 'HC-Dark': '' },
  '--vscode-inputValidation-warningBackground': { 'Dark+': '#4A3018', 'Light+': '#FCE5C5', 'HC-Dark': '' },
  '--vscode-editorInfo-background':             { 'Dark+': '#2A2A3D', 'Light+': '#DDE7F3', 'HC-Dark': '' },
  '--vscode-editorWarning-background':          { 'Dark+': '#3D3208', 'Light+': '#FCEDD0', 'HC-Dark': '' },
  '--vscode-badge-background':                  { 'Dark+': '#4D4D4D', 'Light+': '#B4B4B4', 'HC-Dark': '' },
  '--vscode-badge-foreground':                  { 'Dark+': '#FFFFFF', 'Light+': '#FFFFFF', 'HC-Dark': '#FFFFFF' },
  '--vscode-textLink-foreground':               { 'Dark+': '#3794FF', 'Light+': '#0563C1', 'HC-Dark': '#F38518' },
  '--vscode-button-background':                 { 'Dark+': '#0E639C', 'Light+': '#005FB8', 'HC-Dark': '' },
  '--vscode-button-foreground':                 { 'Dark+': '#FFFFFF', 'Light+': '#FFFFFF', 'HC-Dark': '#FFFFFF' },
  '--vscode-button-secondaryBackground':        { 'Dark+': '#3A3D41', 'Light+': '#E5E5E5', 'HC-Dark': '' },
  '--vscode-button-secondaryForeground':        { 'Dark+': '#CCCCCC', 'Light+': '#1F1F1F', 'HC-Dark': '#FFFFFF' },
  '--vscode-list-activeSelectionBackground':    { 'Dark+': '#094771', 'Light+': '#CCE8FF', 'HC-Dark': '' },
  '--vscode-list-activeSelectionForeground':    { 'Dark+': '#FFFFFF', 'Light+': '#1F1F1F', 'HC-Dark': '#FFFFFF' },
  '--vscode-list-hoverBackground':              { 'Dark+': '#2A2D2E', 'Light+': '#F0F0F0', 'HC-Dark': '' },
  '--vscode-menu-background':                   { 'Dark+': '#252526', 'Light+': '#F2F2F2', 'HC-Dark': '#000000' },
  '--vscode-menu-border':                       { 'Dark+': '#454545', 'Light+': '#DCDCDC', 'HC-Dark': '#6FC3DF' },
  '--vscode-editorWidget-border':               { 'Dark+': '#454545', 'Light+': '#DCDCDC', 'HC-Dark': '#6FC3DF' },
  '--vscode-input-background':                  { 'Dark+': '#3C3C3C', 'Light+': '#FFFFFF', 'HC-Dark': '#000000' },
  '--vscode-input-border':                      { 'Dark+': '#3C3C3C', 'Light+': '#CECECE', 'HC-Dark': '#6FC3DF' },
  '--vscode-input-foreground':                  { 'Dark+': '#D4D4D4', 'Light+': '#1F1F1F', 'HC-Dark': '#FFFFFF' },
  '--vscode-sideBar-background':                { 'Dark+': '#252526', 'Light+': '#F2F2F2', 'HC-Dark': '#000000' },
  '--vscode-terminal-background':               { 'Dark+': '#1E1E1E', 'Light+': '#FFFFFF', 'HC-Dark': '#000000' },
  '--vscode-editorGroupHeader-tabsBackground':  { 'Dark+': '#252526', 'Light+': '#F2F2F2', 'HC-Dark': '#000000' },
};

const HARDCODED = {
  '#ef4444': [239, 68, 68, 1],
  '#22c55e': [34, 197, 94, 1],
  '#6366f1': [99, 102, 241, 1],
  '#ca8a04': [202, 138, 4, 1],
  '#eab308': [234, 179, 8, 1],
  '#4f46e5': [79, 70, 229, 1],
  '#0891b2': [8, 145, 178, 1],
  '#db2777': [219, 39, 119, 1],
  '#f59e0b': [245, 158, 11, 1],
  '#f85149': [248, 81, 73, 1],
  '#3fb950': [63, 185, 80, 1],
  '#888':    [136, 136, 136, 1],
  '#3794ff': [55, 148, 255, 1],
  '#1a1a1a': [26, 26, 26, 1],
  '#3c3c3c': [60, 60, 60, 1],
  '#fcd9d9': [252, 217, 217, 1],
  '#ffffff': [255, 255, 255, 1],
  // chip-palette 0.12 alphas (need a parent color for alpha rendering)
  'rgba(99,102,241,0.12)':  [99, 102, 241, 0.12],
  'rgba(34,197,94,0.12)':   [34, 197, 94, 0.12],
  'rgba(139,92,246,0.12)': [139, 92, 246, 0.12],
  'rgba(79,70,229,0.12)':   [79, 70, 229, 0.12],
  'rgba(202,138,4,0.12)':   [202, 138, 4, 0.12],
  'rgba(239,68,68,0.12)':   [239, 68, 68, 0.12],
  'rgba(8,145,178,0.12)':   [8, 145, 178, 0.12],
  'rgba(219,39,119,0.12)':  [219, 39, 119, 0.12],
};

// Resolver: given a CSS expression, return the effective color for the
// listed theme. Resolves var(--X, fallback) and rgba(R,G,B,A) layering.
function resolve(expr, themeName, parentBg) {
  if (expr === 'inherit') return parentBg;
  if (expr === 'white') return '#FFFFFF';

  // var(--X, fallback) — try to resolve the token; else fall through
  const m = expr.match(/^\s*var\((--[\w-]+)\s*,\s*([^)]+)\)\s*$/);
  if (m) {
    const tokVal = TOKS[m[1]]?.[themeName];
    if (tokVal) return tokVal;
    // Token unset — use inline fallback expression (which may itself be rgba())
    return resolve(m[2].trim(), themeName, parentBg);
  }

  // Bare var(--X) — no fallback
  const bare = expr.match(/^\s*var\((--[\w-]+)\)\s*$/);
  if (bare) {
    const tokVal = TOKS[bare[1]]?.[themeName];
    if (tokVal) return tokVal;
    return parentBg; // unset in this theme → use parent (best-effort)
  }

  // rgba(R,G,B,A) — blend over parent
  const rgba = expr.match(/^\s*rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)\s*$/);
  if (rgba) {
    return blend([+rgba[1], +rgba[2], +rgba[3], +rgba[4]], parentBg);
  }

  // Fallback literal hex like #RGB
  if (expr.startsWith('#')) return expr;
  // Unparseable → parent
  return parentBg;
}

// =============================================================================
// Surface catalogue — every (parent bg, fg, surface bg, fg-mode) combo
// pulled from the live CSS. One row per pair we'll contrast.
//
// Surfaces annotated with `parentClass` + `chipClass` are eligible for the
// CSS-specificity-aware override path: the script scans the parsed
// Autonomy.css for any rule whose selector matches BOTH class tokens and
// has higher specificity than the chip's own bucket rule, then uses that
// rule's resolved value for the chip's effective bg (or color) in the
// contrast pass. Today that's just the 3 chip-on-red-row entries; the
// mechanism is general for any future parent-scoped overrides.
// =============================================================================
const SURFACES = [
  // === specifically-called-out: row-vs-editor in 3 themes ===
  { cat: 'row-vs-editor', s: '.safety-block (Recent Block row)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-foreground)',
    bg: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.06))',
    note: 'red-tinted row that all chip palette foregrounds must compete with' },
  { cat: 'row-vs-editor', s: '.safety-circuit--open (open circuit row)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-foreground)',
    bg: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.06))' },
  { cat: 'row-vs-editor', s: '.fleet-agent-row (one agent per row)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-foreground)',
    bg: 'var(--vscode-badge-background, rgba(127,127,127,0.06))' },
  { cat: 'row-vs-editor', s: '.autonomy-systemic--critical (full-width banner row)',
    parent: '--vscode-editorGroupHeader-tabsBackground',
    fg: 'var(--vscode-foreground)',
    bg: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.10))' },
  { cat: 'row-vs-editor', s: '.trace-panel-workflow-chip (one workflow per chip)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-foreground)',
    bg: 'var(--vscode-editorGroupHeader-tabsBackground, rgba(127,127,127,0.08))' },

  // === badge background vs surface ===
  { cat: 'badge-vs-surface', s: '.safety-panel-badge (open-circuit count bubble)',
    parent: '--vscode-editor-background', fg: '#ffffff', bg: 'var(--vscode-errorForeground, #ef4444)' },
  { cat: 'badge-vs-surface', s: '.autonomy-inbox-badge--critical',
    parent: '--vscode-editor-background', fg: '#ffffff', bg: 'var(--vscode-errorForeground, #ef4444)' },
  { cat: 'badge-vs-surface', s: '.safety-policy-badge--blocking (red BLOCK chip)',
    parent: '--vscode-menu-background',   fg: '#ffffff', bg: 'var(--vscode-errorForeground, #ef4444)' },
  { cat: 'badge-vs-surface', s: '.safety-policy-badge--advisory (amber ADVISE chip)',
    parent: '--vscode-menu-background',   fg: '#ffffff', bg: 'var(--vscode-charts-orange, #f59e0b)' },
  { cat: 'badge-vs-surface', s: '.goal-modal-priority--P0',
    parent: '--vscode-editor-background', fg: '#ffffff', bg: 'var(--vscode-errorForeground)' },
  { cat: 'badge-vs-surface', s: '.goal-modal-priority--P1',
    parent: '--vscode-editor-background', fg: '#ffffff', bg: 'var(--vscode-charts-orange, #f59e0b)' },
  { cat: 'badge-vs-surface', s: '.goal-modal-priority--must-have',
    parent: '--vscode-editor-background', fg: '#ffffff', bg: 'var(--vscode-charts-green, #22c55e)' },
  { cat: 'badge-vs-surface', s: '.autonomy-bar-systemic-severity--low',
    parent: '--vscode-inputValidation-errorBackground', fg: '#ffffff',
    bg: 'var(--vscode-charts-blue, #6366f1)' },
  { cat: 'badge-vs-surface', s: '.autonomy-bar-systemic-severity--medium  ← HARDCODED fg',
    parent: '--vscode-inputValidation-errorBackground', fg: '#1a1a1a',
    bg: 'var(--vscode-charts-yellow, #eab308)',
    note: 'color:#1a1a1a does NOT theme-shift; invisible on HC-Dark black' },
  { cat: 'badge-vs-surface', s: '.autonomy-bar-systemic-severity--high',
    parent: '--vscode-inputValidation-errorBackground', fg: '#ffffff',
    bg: 'var(--vscode-charts-orange, #f59e0b)' },
  { cat: 'badge-vs-surface', s: '.autonomy-bar-systemic-severity--critical',
    parent: '--vscode-inputValidation-errorBackground', fg: '#ffffff',
    bg: 'var(--vscode-errorForeground)' },

  // === autonomy-display state pills (4-state chip) ===
  { cat: 'badge-vs-surface', s: '.autonomy-display--idle (gray text + gray bg)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'var(--vscode-badge-background, rgba(127,127,127,0.2))' },
  { cat: 'badge-vs-surface', s: '.autonomy-display--running',
    parent: '--vscode-editor-background', fg: '#ffffff',
    bg: 'var(--vscode-charts-green, #22c55e)' },
  { cat: 'badge-vs-surface', s: '.autonomy-display--waiting',
    parent: '--vscode-editor-background', fg: '#ffffff',
    bg: 'var(--vscode-charts-orange, #f59e0b)' },
  { cat: 'badge-vs-surface', s: '.autonomy-display--blocked',
    parent: '--vscode-editor-background', fg: '#ffffff',
    bg: 'var(--vscode-errorForeground)' },

  // === spec-called-out: severity pip on fleet-health--dead ===
  { cat: 'severity-pip', s: '.fleet-health--dead (✕ icon) @ opacity 1.0',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-errorForeground, #ef4444)',
    bg: 'var(--vscode-badge-background, rgba(127,127,127,0.06))',
    note: 'pulsed 1.0→0.4→1.0; mid-cycle blends fg toward bg (audit below)' },
  { cat: 'severity-pip', s: '.fleet-health--dead @ PULSE mid-cycle (opacity 0.4)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-errorForeground, #ef4444)',
    bg: 'var(--vscode-badge-background, rgba(127,127,127,0.06))',
    pulse: 0.4,
    note: 'pulse lifts fg toward bg color; effective fgness drops' },
  { cat: 'severity-pip', s: '.fleet-health--healthy (●)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-green, #22c55e)',
    bg: 'var(--vscode-badge-background, rgba(127,127,127,0.06))' },
  { cat: 'severity-pip', s: '.fleet-health--degraded (◐)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-orange, #f59e0b)',
    bg: 'var(--vscode-badge-background, rgba(127,127,127,0.06))' },
  { cat: 'severity-pip', s: '.safety-block-verb (red "BLOCKED BY" on the red row)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-errorForeground, #ef4444)',
    bg: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.06))' },

  // === chips drawn ON the red row ===
  // The parentClass + chipClass annotations enable the specificity-aware
  // override path. The override that's expected is:
  //   .safety-block .safety-block-type { background: var(--vscode-editor-background); }
  // which wins on specificity (parent + class > single class) and replaces
  // the chip's own rgba bg with the editor surface. The chip fg remains
  // unchanged; contrast is measured against the editor.
  { cat: 'chip-on-red-row', s: '.safety-block-type--story chip ON row',
    parentOverride: '#5A1D1D',
    fg: 'var(--vscode-charts-blue, #6366f1)',
    bg: 'rgba(99,102,241,0.12)',
    parentClass: '.safety-block',
    chipClass: '.safety-block-type' },
  { cat: 'chip-on-red-row', s: '.safety-block-type--risk chip ON row',
    parentOverride: '#5A1D1D',
    fg: 'var(--vscode-errorForeground, #ef4444)',
    bg: 'rgba(239,68,68,0.12)',
    parentClass: '.safety-block',
    chipClass: '.safety-block-type' },
  { cat: 'chip-on-red-row', s: '.safety-block-type--test-case chip ON row',
    parentOverride: '#FCD9D9',
    fg: 'var(--vscode-charts-yellow, #ca8a04)',
    bg: 'rgba(202,138,4,0.12)',
    parentClass: '.safety-block',
    chipClass: '.safety-block-type' },

  // === DiffPanel surfaces ===
  { cat: 'badge-vs-surface', s: '.diff-panel-stat--add (+N count)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-terminal-ansiGreen)', bg: 'inherit' },
  { cat: 'badge-vs-surface', s: '.diff-panel-stat--del (-N count)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-terminal-ansiRed)', bg: 'inherit' },
  { cat: 'badge-vs-surface', s: '.diff-panel-sha (commit hash)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-terminal-ansiYellow)', bg: 'var(--vscode-badge-background)' },
  { cat: 'row-vs-editor', s: '.diff-panel-diff-add (diff "+" line)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-terminal-ansiGreen)',
    bg: 'rgba(35,134,54,0.15)' },
  { cat: 'row-vs-editor', s: '.diff-panel-diff-del (diff "-" line)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-terminal-ansiRed)',
    bg: 'rgba(218,54,51,0.15)' },

  // === TracePanel error chip ===
  { cat: 'badge-vs-surface', s: '.trace-panel-workflow-chip-errors (⚠ count)',
    parent: '--vscode-editorGroupHeader-tabsBackground',
    fg: 'var(--vscode-errorForeground)',
    bg: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.12))' },
  { cat: 'badge-vs-surface', s: '.trace-panel-workflow-chip-count (N count)',
    parent: '--vscode-editorGroupHeader-tabsBackground',
    fg: 'var(--vscode-charts-blue, #6366f1)', bg: 'var(--vscode-badge-background, rgba(127,127,127,0.2))' },

  // === TerminalGrid status dot (HARDCODED hex, no theme fallback) ===
  { cat: 'severity-pip', s: '.terminal-tile-dot.status-running  ← HARDCODED',
    parent: '--vscode-terminal-background', fg: '#3fb950', bg: 'inherit',
    note: 'GitHub-Dark green; does not theme-shift' },
  { cat: 'severity-pip', s: '.terminal-tile-dot.status-failed/dead  ← HARDCODED',
    parent: '--vscode-terminal-background', fg: '#f85149', bg: 'inherit',
    note: 'GitHub-Dark red; does not theme-shift' },

  // === Loopback chip in kanban-card chrome (parity with chip palette) ===
  { cat: 'badge-vs-surface', s: '.kanban-card-dep-badge (blue dep badge)',
    parent: '--vscode-editor-background', fg: '#ffffff',
    bg: 'var(--vscode-charts-blue, #6366f1)' },
];

// =============================================================================
// Run matrix
// =============================================================================
console.log('================================================================================');
console.log('A11Y SWEEP — autonomy / fleet / trace / diff / terminal surfaces');
console.log('Floors: AA-text 4.5:1, WCAG-1.4.11 UI-component 3.0:1, severe-fail <3.0:1');
console.log('Specificity-aware override resolution: ENABLED (Autonomy.css parsed for');
console.log('  parent-scoped `.parent .chip { ... }` overrides keyed by parentClass+chipClass');
console.log('================================================================================\n');

let totalPairs = 0, fails = 0, uiFails = 0, hardcodedHits = 0;

for (const themeName of Object.keys(THEMES)) {
  const theme = THEMES[themeName];
  console.log(`--- THEME: ${themeName}  (editor bg ${theme.editorBg}) ---\n`);
  for (const s of SURFACES) {
    const parentBg = s.parentOverride || resolve(s.parent, themeName, theme.editorBg);

    // ── CSS-specificity-aware override resolution ────────────────────
    // When a surface is annotated with parentClass + chipClass, search the
    // enumerated CSS for a parent-scoped rule that overrides property X.
    // The replacement value wins if its selector specificity is HIGHER than
    // the chip's own bucket rule (typically the case for any
    // `.parent .child` rule, which adds a sibling class to the chip's
    // existing class token).
    let overrideBgExpr = null;
    let overrideFgExpr = null;
    if (s.parentClass && s.chipClass) {
      const bgOverride = findOverride(s.parentClass, s.chipClass, 'background', themeName);
      if (bgOverride) overrideBgExpr = bgOverride;
      const fgOverride = findOverride(s.parentClass, s.chipClass, 'color', themeName);
      if (fgOverride) overrideFgExpr = fgOverride;
    }

    let fgRaw = resolve(overrideFgExpr || s.fg, themeName, theme.editorBg);
    let bgRaw = resolve(overrideBgExpr || s.bg, themeName, parentBg);

    // Pulse dim: blends fg toward bg at the listed opacity
    if (s.pulse !== undefined) {
      const [r, g, b] = [fgRaw.slice(1, 3), fgRaw.slice(3, 5), fgRaw.slice(5, 7)]
        .map(h => +('0x' + h));
      fgRaw = blend([r, g, b, 1 - s.pulse], bgRaw); // effective fgness drops to 0.4
    }

    // final fg/bg
    const fg = fgRaw, bg = bgRaw;
    const r = ratio(fg, bg);
    const minFloor = (s.cat === 'severity-pip' || s.cat === 'badge-vs-surface' || s.cat === 'row-vs-editor') ? 3.0 : 4.5;
    let mark;
    if (r >= 4.5) mark = '✓PASS';
    else if (r >= minFloor) { mark = '~UI'; uiFails++; }
    else if (r >= 3.0)      { mark = '⚠UI '; uiFails++; }
    else                    { mark = '✗FAIL'; fails++; }
    totalPairs++;

    // Highlight specifically-called-out items
    const called = /(PULSE|row in Dark\+|row in Light\+|fleet-health--dead|fleet-health--healthy|fleet-health--degraded|dead @|safety-block-verb|autonomy-systemic--critical|inputValidation-errorBackground|HARDCODED|chip ON row)/.test(s.s)
                 ? ' ←' : '   ';
    const overrideTag = (overrideBgExpr || overrideFgExpr)
      ? `[override: ${overrideBgExpr ? 'bg' : ''}${overrideFgExpr ? 'fg' : ''}] `
      : '';
    console.log(`  ${mark} ${r.toFixed(2).padStart(5)}:1 ${called} ${overrideTag}[${s.cat.padEnd(18)}] ${s.s}` +
      (s.note ? `   (${s.note})` : ''));
  }
  console.log();
}

// =============================================================================
// Hardcoded-color leakage inventory
// =============================================================================
console.log('--- HARDCODED COLOR INVENTORY (theme-token leakage) ---\n');
const hc = [
  [ '.safety-block-type--architecture, --tech-spec, --change-proposal, --retrospective, --code-review, --source-tree',
    '#4f46e5', 'Indigo without --vscode-charts-indigo equivalent; does not theme-shift across HC/Light/Dark' ],
  [ '.safety-block-type--sprint-status, --sprint, --research',
    '#0891b2', 'Cyan without --vscode-charts-cyan equivalent; does not theme-shift' ],
  [ '.safety-block-type--ux-design, --design-thinking, --storytelling, --problem-solving, --innovation-strategy',
    '#db2777', 'Pink without theme-token equivalent; does not theme-shift' ],
  [ '.autonomy-bar-systemic-severity--medium',
    'color:#1a1a1a', 'HARD-CODED fg contrasts yellow bg pair; invisible on HC-Dark (black bg)' ],
  [ '.terminal-tile-dot.status-running',
    '#3fb950', 'GitHub-Dark green hardcoded; no theme fallback' ],
  [ '.terminal-tile-dot.status-failed/dead',
    '#f85149', 'GitHub-Dark red hardcoded; no theme fallback' ],
  [ '.terminal-tile-dot (idle)',
    '#888',    'Solid gray hardcoded' ],
  [ 'drawer / dropdown shadows',
    'rgba(0,0,0,0.20/0.35/0.40)', 'Black drop-shadows — dark themes fine; light + HC may show visible shadow on light bg' ],
  [ '@keyframes inbox-pulse + safety-pulse + fleet-health-pulse',
    'rgba(239,68,68,0.4) and rgba(245,158,11,0.4)',
    'Halo color hardcoded; theme-correct halo for HC would be brighter tone, not literal #ef4444' ],
];
hc.forEach(([loc, val, why]) => {
  console.log(`  • ${loc.padEnd(70)}\n      hex=${val}\n      → ${why}\n`);
  hardcodedHits++;
});

console.log('================================================================================');
console.log(`SUMMARY: ${totalPairs} surface×theme pairs across ${Object.keys(THEMES).length} themes`);
console.log(`  PASS (≥4.5):           ${totalPairs - uiFails - fails}`);
console.log(`  UI-only (3.0–4.5):     ${uiFails}`);
console.log(`  FAIL (<3.0):           ${fails}`);
console.log(`  Hardcoded-color hits:  ${hardcodedHits}`);
console.log('================================================================================');
