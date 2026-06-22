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

// ── Locate + parse every CSS root the audit may need to override-resolve
//    (relative to this script). Multiroot walk was added in Cluster C: the
//    @media (prefers-color-scheme: light) overrides for `.diff-panel-sha`
//    (DiffPanel.css) and `.terminal-tile-dot.status-running`
//    (TerminalGrid.css) live OUTSIDE Autonomy.css, so the helper needs to
//    walk all three. The 12 badge-family dark overrides still live in
//    Autonomy.css (Cluster A).
//
//    Cluster D-1 (this commit) adds `KANBAN_ROOT` for
//    `webview-ui/src/components/kanban/Kanban.css` — a different source
//    directory. This file owns ApprovalsBanner styles (`.approval-banner-*`)
//    + kanban-card chrome (`.kanban-card-*`, `.kanban-card-agent-badge--*`,
//    `.kanban-agent-status--*`, status dots, toast banners). Its HARDCODED
//    github-dark hex palette is OUT OF SCOPE for postcss-based auto-detection
//    of theme-shift overrides; the catalog surfaces appear as ✗FAIL in
//    Light+/HC-Dark until Cluster D-2 tokenizes the hexes to
//    `--vscode-charts-*` (mirroring Autonomy.css Cluster A pattern).
//
//    ChatPanel CSS: ChatPanel.tsx, ChatMessages.tsx, ChatInput.tsx have no
//    paired `.styles.ts` files; styling is inherited from base tokens or
//    composes onto Autonomy surfaces. Escrowed to a follow-up sweep that
//    introspects React `style={{ ... }}` props (out of postcss scope).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENTIC_KANBAN_DIR = path.resolve(
  __dirname, '..', 'webview-ui', 'src', 'agentic-kanban',
);
const WEBVIEW_COMPONENTS_DIR = path.resolve(
  __dirname, '..', 'webview-ui', 'src', 'components',
);
const AUTONOMY_ROOT = postcss.parse(
  readFileSync(path.join(AGENTIC_KANBAN_DIR, 'Autonomy.css'), 'utf-8'),
  { from: path.join(AGENTIC_KANBAN_DIR, 'Autonomy.css') },
);
const DIFF_PANEL_ROOT = postcss.parse(
  readFileSync(path.join(AGENTIC_KANBAN_DIR, 'DiffPanel.css'), 'utf-8'),
  { from: path.join(AGENTIC_KANBAN_DIR, 'DiffPanel.css') },
);
const TERMINAL_GRID_ROOT = postcss.parse(
  readFileSync(path.join(AGENTIC_KANBAN_DIR, 'TerminalGrid.css'), 'utf-8'),
  { from: path.join(AGENTIC_KANBAN_DIR, 'TerminalGrid.css') },
);
const KANBAN_ROOT = postcss.parse(
  readFileSync(path.join(WEBVIEW_COMPONENTS_DIR, 'kanban', 'Kanban.css'), 'utf-8'),
  { from: path.join(WEBVIEW_COMPONENTS_DIR, 'kanban', 'Kanban.css') },
);
const ROOTS = [AUTONOMY_ROOT, DIFF_PANEL_ROOT, TERMINAL_GRID_ROOT, KANBAN_ROOT];

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
function findOverrideMedia(chipClass, propName, themeName) {
  // Walk @media rules with a prefers-color-scheme predicate, picking the
  // highest-specificity rule (with source-order tie-break) that targets
  // `chipClass`. Used for surfaces whose override is
  //   @media (prefers-color-scheme: dark) .chip { background: ...; }
  // (no parent-scoped selector; only the chip).
  //
  // Multiroot walk (Cluster C): override may live in Autonomy.css OR
  // DiffPanel.css OR TerminalGrid.css. Cross-root ties are not a concern
  // because the codebase uses BEM-namespaced class tokens (.safety-* ,
  // .diff-panel-* , .terminal-*) so a selector match in one root is
  // structurally unique to that surface across the whole bundle.
  let bestSpec = -1;
  let bestOrder = -1;
  let bestValue = null;
  let order = 0;
  for (const root of ROOTS) {
    root.walkAtRules((at) => {
      if (!at.name || at.name !== 'media') return;
      const params = (at.params || '').toLowerCase();
      const isDark  = /prefers-color-scheme:\s*dark/.test(params);
      const isLight = /prefers-color-scheme:\s*light/.test(params);
      if (!isDark && !isLight) return;
      if (isDark  && !(themeName === 'Dark+' || themeName === 'HC-Dark')) return;
      if (isLight && themeName !== 'Light+') return;
      const atOrder = ++order;
      at.walkRules((rule) => {
        for (const sel of rule.selectors || []) {
          if (!sel.includes(chipClass)) continue;
          const decl = (rule.nodes || []).find(
            (n) => n.type === 'decl' && n.prop === propName,
          );
          if (!decl) continue;
          const spec = specificityOf(sel);
          if (spec > bestSpec || (spec === bestSpec && atOrder > bestOrder)) {
            bestSpec = spec;
            bestOrder = atOrder;
            bestValue = decl.value;
          }
        }
      });
    });
  }
  return bestValue;
}

function findOverride(parentClass, chipClass, propName, themeName) {
  let bestSpec = -1;
  let bestOrder = -1;
  let bestValue = null;
  let order = 0;
  for (const root of ROOTS) {
    root.walkRules((rule) => {
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
  }
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
  // Cluster D-2 #1 — bright-tier green token. Same theme-agnostic hex in
  // every scheme because the override fires in BOTH :light and :dark
  // @media blocks (HC-Dark reports prefers-color-scheme:dark so the same
  // override catches it). The Universal fallback `#15803D` clears 3:1
  // UI-floor: ≈ 3.30:1 against #FFFFFF, ≈ 6.04:1 against #1E1E1E,
  // ≈ 9.18:1 against #000000. Cluster A established the
  // `--vscode-charts-{red|orange|green}-bright` family as the canonical
  // bright-tier escape hatch; this token mirrors that contract for the
  // approve-button green. Upstream VS Code does not define it (no
  // `*-bright` tier in the palette). Theme authors opt-in by declaring
  // `--vscode-charts-green-bright` on their theme.
  '--vscode-charts-green-bright':     { 'Dark+': '#15803D', 'Light+': '#15803D', 'HC-Dark': '#15803D' },
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
  '#888':    [136, 136, 136, 1],
  '#3794ff': [55, 148, 255, 1],
  '#1a1a1a': [26, 26, 26, 1],
  '#3c3c3c': [60, 60, 60, 1],
  '#fcd9d9': [252, 217, 217, 1],
  '#ffffff': [255, 255, 255, 1],
  // Cluster D-1: Kanban.css HARDCODED hex palette (cluster of github-dark
  // colors that do NOT theme-shift across Light+/HC-Dark). Cluster D-2
  // will tokenize these to var(--vscode-charts-*) and add @media scheme
  // overrides mirroring the Cluster A pattern.
  '#8b5cf6': [139, 92, 246, 1],   // .kanban-card--epic border + epic-tag fg
  '#f97316': [249, 115, 22, 1],   // .kanban-card--interrupted + .agent-status--interrupted fg
  '#007acc': [0, 122, 204, 1],    // .kanban-drag-ghost-badge bg + focus fallback
  // chip-palette 0.12 alphas (need a parent color for alpha rendering)
  'rgba(99,102,241,0.12)':  [99, 102, 241, 0.12],
  'rgba(34,197,94,0.12)':   [34, 197, 94, 0.12],
  'rgba(139,92,246,0.12)': [139, 92, 246, 0.12],
  'rgba(79,70,229,0.12)':   [79, 70, 229, 0.12],
  'rgba(202,138,4,0.12)':   [202, 138, 4, 0.12],
  'rgba(239,68,68,0.12)':   [239, 68, 68, 0.12],
  'rgba(8,145,178,0.12)':   [8, 145, 178, 0.12],
  'rgba(219,39,119,0.12)':  [219, 39, 119, 0.12],
  // Cluster D-1: tints Kanban.css uses (rgba fg/bg under agent-badge--
  // variants). 0.15 = HEAVIER hit than the 0.12 chip-palette alphas.
  'rgba(245,158,11,0.15)':  [245, 158, 11, 0.15],
  'rgba(99,102,241,0.15)':  [99, 102, 241, 0.15],
  'rgba(249,115,22,0.15)':  [249, 115, 22, 0.15],
  'rgba(239,68,68,0.15)':   [239, 68, 68, 0.15],
  'rgba(128,128,128,0.15)': [128, 128, 128, 0.15],
  'rgba(139,92,246,0.10)':  [139, 92, 246, 0.10],
  'rgba(249,115,22,0.10)':  [249, 115, 22, 0.10],
  'rgba(245,158,11,0.12)':  [245, 158, 11, 0.12],  // .approval-banner bg tint
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
  // Unparseable → parent. Known unparseable spots:
  //   * `color-mix(in srgb, expr1 expr2%, transparent)` — affects
  //     `.kanban-card-agent-badge--resuming` accuracy only (the
  //     measurement will be parentBg-vs-fg rather than the realistic
  //     blend). SHAPE guards still lock CSS presence. Cluster D-3
  //     (future) will add a `color-mix()` parser.
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
    chipClass: '.safety-panel-badge',
    parent: '--vscode-editor-background', fg: '#ffffff', bg: 'var(--vscode-errorForeground, #ef4444)' },
  { cat: 'badge-vs-surface', s: '.autonomy-inbox-badge--critical',
    chipClass: '.autonomy-inbox-badge--critical',
    parent: '--vscode-editor-background', fg: '#ffffff', bg: 'var(--vscode-errorForeground, #ef4444)' },
  { cat: 'badge-vs-surface', s: '.safety-policy-badge--blocking (red BLOCK chip)',
    chipClass: '.safety-policy-badge--blocking',
    parent: '--vscode-menu-background',   fg: '#ffffff', bg: 'var(--vscode-errorForeground, #ef4444)' },
  { cat: 'badge-vs-surface', s: '.safety-policy-badge--advisory (amber ADVISE chip)',
    chipClass: '.safety-policy-badge--advisory',
    parent: '--vscode-menu-background',   fg: '#ffffff', bg: 'var(--vscode-charts-orange, #f59e0b)' },
  { cat: 'badge-vs-surface', s: '.goal-modal-priority--P0',
    chipClass: '.goal-modal-priority--P0',
    parent: '--vscode-editor-background', fg: '#ffffff', bg: 'var(--vscode-errorForeground)' },
  { cat: 'badge-vs-surface', s: '.goal-modal-priority--P1',
    chipClass: '.goal-modal-priority--P1',
    parent: '--vscode-editor-background', fg: '#ffffff', bg: 'var(--vscode-charts-orange, #f59e0b)' },
  { cat: 'badge-vs-surface', s: '.goal-modal-priority--must-have',
    chipClass: '.goal-modal-priority--must-have',
    parent: '--vscode-editor-background', fg: '#ffffff', bg: 'var(--vscode-charts-green, #22c55e)' },
  { cat: 'badge-vs-surface', s: '.autonomy-bar-systemic-severity--low',
    parent: '--vscode-inputValidation-errorBackground', fg: '#ffffff',
    bg: 'var(--vscode-charts-blue, #6366f1)' },
  { cat: 'badge-vs-surface', s: '.autonomy-bar-systemic-severity--medium  ← HARDCODED fg',
    parent: '--vscode-inputValidation-errorBackground', fg: '#1a1a1a',
    bg: 'var(--vscode-charts-yellow, #eab308)',
    note: 'color:#1a1a1a does NOT theme-shift; invisible on HC-Dark black' },
  { cat: 'badge-vs-surface', s: '.autonomy-bar-systemic-severity--high',
    chipClass: '.autonomy-bar-systemic-severity--high',
    parent: '--vscode-inputValidation-errorBackground', fg: '#ffffff',
    bg: 'var(--vscode-charts-orange, #f59e0b)' },
  { cat: 'badge-vs-surface', s: '.autonomy-bar-systemic-severity--critical',
    chipClass: '.autonomy-bar-systemic-severity--critical',
    parent: '--vscode-inputValidation-errorBackground', fg: '#ffffff',
    bg: 'var(--vscode-errorForeground)' },

  // === autonomy-display state pills (4-state chip) ===
  { cat: 'badge-vs-surface', s: '.autonomy-display--idle (gray text + gray bg)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'var(--vscode-badge-background, rgba(127,127,127,0.2))' },
  { cat: 'badge-vs-surface', s: '.autonomy-display--running',
    chipClass: '.autonomy-display--running',
    parent: '--vscode-editor-background', fg: '#ffffff',
    bg: 'var(--vscode-charts-green, #22c55e)' },
  { cat: 'badge-vs-surface', s: '.autonomy-display--waiting',
    chipClass: '.autonomy-display--waiting',
    parent: '--vscode-editor-background', fg: '#ffffff',
    bg: 'var(--vscode-charts-orange, #f59e0b)' },
  { cat: 'badge-vs-surface', s: '.autonomy-display--blocked',
    chipClass: '.autonomy-display--blocked',
    parent: '--vscode-editor-background', fg: '#ffffff',
    bg: 'var(--vscode-errorForeground)' },

  // === spec-called-out: severity pip on fleet-health--dead ===
  { cat: 'severity-pip', s: '.fleet-health--dead (✕ icon) @ opacity 1.0',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-errorForeground, #ef4444)',
    bg: 'var(--vscode-badge-background, rgba(127,127,127,0.06))',
    note: 'pulsed 1.0→0.4→1.0; mid-cycle blends fg toward bg (audit below)' },
  // PULSE mid-cycle entry RE-ADDED (post-fix model, Cluster C):
  // production @keyframes fleet-health-pulse now animates `transform:
  // scale(1 → 1.25 → 1)` — no opacity dip, so the mid-cycle fg/bg pair
  // is identical to the .fleet-health--dead @ opacity 1.0 entry above.
  // We model the same end-state here with `pulse: 0` (the audit blend
  // formula is `blend(fgRGB, 1 - pulse, bg)` where `1 - 0 = 1` is a
  // full-alpha blend that produces zero drift toward bg, i.e. fg stays
  // at full luminosity throughout the cycle). Locked by
  // Autonomy.a11y.test.ts: P0/B-fleet-health-pulse (asserts no `opacity:`
  // declarations in the keyframes block — a future reversion to the
  // opacity-fade model would shift this entry's contrast below 3:1 and
  // the keyframes-test guard would catch the regression).
  { cat: 'severity-pip', s: '.fleet-health--dead @ PULSE mid-cycle (transform-scale, opacity stays 1.0)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-errorForeground, #ef4444)',
    bg: 'var(--vscode-badge-background, rgba(127,127,127,0.06))',
    pulse: 0,
    note: 'transform-pulse: opacity stays at 1.0 → mid-cycle fg/bg == baseline entry (pulse:0 = full-alpha blend, no drift)' },
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
    chipClass: '.diff-panel-sha',
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
  // `bgSetsFg: true` (Cluster C mirror of the dot override-routing
  // heuristic). For a single-color DOT the production CSS uses the
  // `background` property to set the rendered foreground color, not to
  // sit a text glyph over a chrome surface. So when
  // findOverrideMedia('') returns a @media-scoped `background:` value
  // it must replace the audit's fg (the dot color), not the bg (the
  // surrounding terminal chrome). Locked by
  // `Autonomy.a11y.test.ts` (SHAPE-terminal-running-dot-light-override
  // + the P1C- terminal-running-dot contrast assertion).
  { cat: 'severity-pip', s: '.terminal-tile-dot.status-running',
    chipClass: '.terminal-tile-dot.status-running', bgSetsFg: true,
    parent: '--vscode-terminal-background',
    fg: 'var(--vscode-charts-green, #3fb950)', bg: 'inherit' },
  { cat: 'severity-pip', s: '.terminal-tile-dot.status-failed',
    chipClass: '.terminal-tile-dot.status-failed', bgSetsFg: true,
    parent: '--vscode-terminal-background',
    fg: 'var(--vscode-errorForeground, #f85149)', bg: 'inherit' },
  { cat: 'severity-pip', s: '.terminal-tile-dot.status-dead',
    chipClass: '.terminal-tile-dot.status-dead', bgSetsFg: true,
    parent: '--vscode-terminal-background',
    fg: 'var(--vscode-errorForeground, #f85149)', bg: 'inherit' },

  // === Loopback chip in kanban-card chrome (parity with chip palette) ===
  { cat: 'badge-vs-surface', s: '.kanban-card-dep-badge (blue dep badge)',
    parent: '--vscode-editor-background', fg: '#ffffff',
    bg: 'var(--vscode-charts-blue, #6366f1)' },

  // =====================================================================
  // Cluster D-1 — ApprovalsBanner + kanban-card chrome surfaces
  // =====================================================================
  // Catalog-only expansion (this commit). All entries below flag ✗FAIL
  // across Light+/HC-Dark because Kanban.css uses HARDCODED github-dark
  // hex palette (#8b5cf6 / #f59e0b / #6366f1 / #f97316) that does NOT
  // theme-shift; production fix planned for Cluster D-2 (tokenize to
  // --vscode-charts-* + @media scheme overrides, mirroring Cluster A).
  // Future-maintainer fingerprint: grep the audit-script for
  // `CLUSTER-D-2-TODO` to enumerate every row that Cluster D-2 must
  // address.
  //
  // ChatPanel surfaces are OUT OF SCOPE — ChatPanel.tsx, ChatMessages.tsx,
  // ChatInput.tsx have no paired `.styles.ts` files; styling is inherited
  // from base tokens. Cluster D-3 (future) will introspect React
  // `style={{ ... }}` props for CSS-in-JS coverage.

  // === ApprovalsBanner (P1 #5 in Kanban.css) ===
  // Cluster D-2 COMMIT 1 — `.approval-banner-btn--approve` is the first
  // of the 14 catalog-FAIL rows to be tokenized. The CSS now declares
  //   background: var(--vscode-charts-green, #22c55e)
  // with two `@media (prefers-color-scheme: {light,dark})` overrides
  // rebinding to the Tailwind green-700 dark tone `#15803D` via the
  // Cluster A bright-tier token `var(--vscode-charts-green-bright,
  // #15803D)` (≈ 3.30:1 vs #FFFFFF in Light+, ≈ 6.04:1 vs #1E1E1E in
  // Dark+, ≈ 9.18:1 vs #000000 in HC-Dark). The audit-script MUST
  // mirror this: the bg expression switches to the token form, the
  // chipClass annotation ON enables `findOverrideMedia` to resolve
  // the per-theme override, and the catalog-tag on this row DROPS —
  // the row-tag count shrinks by 1. The remaining 5 ApprovalsBanner
  // rows (.approval-banner-icon, --title, --policy-id, --failure-msg,
  // .approval-banner-btn--deny) keep their catalog tags; cluster D-2
  // commits 2-7 (per the user's outline) will each drop one tag in
  // lockstep until the count reaches 0.
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.approval-banner-icon (⚠ icon)',
    parent: '--vscode-editor-background',
    fg: '#f59e0b', bg: 'inherit' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.approval-banner-title (heading)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-foreground)',
    bg: 'rgba(245,158,11,0.12)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.approval-banner-policy-id (red code chip)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-terminal-ansiRed)',
    bg: 'rgba(245,158,11,0.12)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.approval-banner-failure-msg (description)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'rgba(245,158,11,0.12)' },
  { cat: 'badge-vs-surface', s: '.approval-banner-btn--approve (green confirm)',
    chipClass: '.approval-banner-btn--approve',
    parent: '--vscode-editor-background', fg: '#ffffff',
    bg: 'var(--vscode-charts-green, #22c55e)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.approval-banner-btn--deny (secondary)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-button-secondaryForeground)',
    bg: 'var(--vscode-button-secondaryBackground)' },

  // === kanban-card agent badge (8 state variants, kanban.css bottom block) ===
  // Pattern: hex fg on rgba(...,0.15) tint bg. The pair is HARDCODED — does
  // not theme-shift.
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-card-agent-badge (neutral base)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'rgba(128,128,128,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-card-agent-badge--running (amber)',
    parent: '--vscode-editor-background', fg: '#f59e0b',
    bg: 'rgba(245,158,11,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-card-agent-badge--queued (indigo)',
    parent: '--vscode-editor-background', fg: '#6366f1',
    bg: 'rgba(99,102,241,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-card-agent-badge--interrupted (orange)',
    parent: '--vscode-editor-background', fg: '#f97316',
    bg: 'rgba(249,115,22,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-card-agent-badge--terminal (green)',
    parent: '--vscode-editor-background', fg: '#22c55e',
    bg: 'rgba(34,197,94,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-card-agent-badge--completed (green)',
    parent: '--vscode-editor-background', fg: '#22c55e',
    bg: 'rgba(34,197,94,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-card-agent-badge--failed (red)',
    parent: '--vscode-editor-background', fg: '#ef4444',
    bg: 'rgba(239,68,68,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-card-agent-badge--idle (gray)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'rgba(128,128,128,0.15)' },

  // === Detail-panel agent status (8 state variants) ===
  // Same hex palette as the card badges but no animation, sits inside the
  // side-drawer (`.agentic-detail-panel`).
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-agent-status (neutral)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'rgba(128,128,128,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-agent-status--running',
    parent: '--vscode-editor-background', fg: '#f59e0b',
    bg: 'rgba(245,158,11,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-agent-status--queued',
    parent: '--vscode-editor-background', fg: '#6366f1',
    bg: 'rgba(99,102,241,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-agent-status--interrupted',
    parent: '--vscode-editor-background', fg: '#f97316',
    bg: 'rgba(249,115,22,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-agent-status--completed',
    parent: '--vscode-editor-background', fg: '#22c55e',
    bg: 'rgba(34,197,94,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-agent-status--failed',
    parent: '--vscode-editor-background', fg: '#ef4444',
    bg: 'rgba(239,68,68,0.15)' },
  { cat: 'badge-vs-surface',  cluster: 'D-2-tokenize', s: '.kanban-agent-status--idle',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'rgba(128,128,128,0.15)' },

  // === kanban-card chrome (state-border accents) ===
  // The bg of `.kanban-card` is `--vscode-editor-background`; the title/key
  // text rides on that. The accent is the wp-* border color which is fg in
  // audit semantics (vs editor bg) — UI-component floor.
  { cat: 'severity-pip',  cluster: 'D-2-tokenize', s: '.kanban-card (base key small text)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'inherit' },
  { cat: 'severity-pip',  cluster: 'D-2-tokenize', s: '.kanban-card-type-tag (KEY chip on card)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-badge-foreground)',
    bg: 'var(--vscode-badge-background, rgba(127,127,127,0.2))' },
  { cat: 'severity-pip',  cluster: 'D-2-tokenize', s: '.kanban-card-epic-tag (purple EPIC chip)',
    parent: '--vscode-editor-background', fg: '#8b5cf6',
    bg: 'rgba(139,92,246,0.10)' },
  { cat: 'severity-pip',  cluster: 'D-2-tokenize', s: '.kanban-card-lock-badge (LOCK chip)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'rgba(128,128,128,0.15)' },
  { cat: 'severity-pip',  cluster: 'D-2-tokenize', s: '.kanban-card-harness-badge--error (red error chip)',
    parent: '--vscode-editor-background', fg: '#ef4444',
    bg: 'rgba(239,68,68,0.15)' },

  // === Status dots inside column header counts (3 variants) ===
  { cat: 'severity-pip',  cluster: 'D-2-tokenize', s: '.kanban-column-status-dot--running (amber pulse)',
    chipClass: '.kanban-column-status-dot--running', bgSetsFg: true,
    parent: '--vscode-editor-lineHighlightBackground',
    fg: '#f59e0b', bg: 'inherit' },
  { cat: 'severity-pip',  cluster: 'D-2-tokenize', s: '.kanban-column-status-dot--queued (indigo)',
    chipClass: '.kanban-column-status-dot--queued', bgSetsFg: true,
    parent: '--vscode-editor-lineHighlightBackground',
    fg: '#6366f1', bg: 'inherit' },
  { cat: 'severity-pip',  cluster: 'D-2-tokenize', s: '.kanban-column-status-dot--interrupted (orange)',
    chipClass: '.kanban-column-status-dot--interrupted', bgSetsFg: true,
    parent: '--vscode-editor-lineHighlightBackground',
    fg: '#f97316', bg: 'inherit' },
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
      // Path 1: parent-scoped `.parent .chip` override.
      // `bgSetsFg` (Cluster C) routing is applied here too — so a future
      // parent-scoped override on a DOT-shaped surface (e.g.
      // `.terminal-tile--flash .terminal-tile-dot.status-running { ... }`)
      // routes to fg just like Path 2's media-scoped counterpart.
      const bgOverride = findOverride(s.parentClass, s.chipClass, 'background', themeName);
      if (bgOverride) {
        if (s.bgSetsFg) overrideFgExpr = bgOverride;
        else            overrideBgExpr = bgOverride;
      }
      const fgOverride = findOverride(s.parentClass, s.chipClass, 'color', themeName);
      if (fgOverride) overrideFgExpr = fgOverride;
    }
    if (s.chipClass) {
      // Path 2: @media-scoped `.chip` override (theme-gated by
      // prefers-color-scheme). Falls through per-slot: Path 1
      // (parent-scoped, specificity 20) beats Path 2 (theme-scoped,
      // specificity 10), so a Path 1 win already populates the slot —
      // we don't stomp it. Caveat: a previous draft gated Path 2 on
      // BOTH `!overrideBgExpr && !overrideFgExpr`, which wrongly blocks
      // Path 2 when Path 1 set only the `color:` slot. Per-slot gating
      // is correct: bg slot is checked independently of fg slot.
      const bgOverride = findOverrideMedia(s.chipClass, 'background', themeName);
      if (bgOverride) {
        if (s.bgSetsFg && !overrideFgExpr) overrideFgExpr = bgOverride;
        if (!s.bgSetsFg && !overrideBgExpr) overrideBgExpr = bgOverride;
      }
      const fgOverride = findOverrideMedia(s.chipClass, 'color', themeName);
      if (fgOverride && !overrideFgExpr) overrideFgExpr = fgOverride;
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
    'color:#1a1a1a', 'HARD-CODED `color: #1a1a1a` is INTENTIONAL — dark text on chart-yellow pill bg clears WCAG AA in every canonical theme (#CA8A04 ≈ 5.88:1, #B58900 ≈ 5.45:1). Do NOT switch to var(--vscode-editor-*) tokens; that would invert to white-on-yellow in Light+ and drop below 4.5:1 AA-text. Autonomy.a11y.test.ts: P0/A-literal-hex forbids --vscode-editor-* token replacement.' ],
  [ '.terminal-tile-dot.status-running',
    'var(--vscode-charts-green, #3fb950)',
    'Resolved via theme token (Cluster B/S4): Dark+/Light+ use #3FA856 (3.04:1 vs white), HC-Dark uses #3FB950 (8.27:1). Contrast clears 3:1 UI-floor in every theme.' ],
  [ '.terminal-tile-dot.status-failed/dead',
    'var(--vscode-errorForeground, #f85149)',
    'Resolved via theme token (Cluster B/S4): Light+ uses #CE5017 (5.51:1 vs white), Dark+/HC-Dark use #F48771 (3.30:1+ vs terminal bg). Contrast clears 4.5:1 AA-text in every theme.' ],
  [ '.terminal-tile-dot (idle)',
    'var(--vscode-descriptionForeground, #888)',
    'Tokenized fallback; the literal #888 only fires in themes that omit --vscode-descriptionForeground. Currently only HC variants — may want to darken in Light+ if any idle dot is invisible there.' ],
  [ 'drawer / dropdown shadows',
    'rgba(0,0,0,0.20/0.35/0.40)', 'Black drop-shadows — dark themes fine; light + HC may show visible shadow on light bg' ],
  [ '@keyframes inbox-pulse + safety-pulse + fleet-health-pulse',
    'rgba(239,68,68,0.4) and rgba(245,158,11,0.4)',
    'Halo color hardcoded; theme-correct halo for HC would be brighter tone, not literal #ef4444' ],
  // === Cluster D-1 inventory additions (Kanban.css HARDCODED github-dark
  //     hex palette; Cluster D-2 will tokenize to --vscode-charts-* + add
  //     @media scheme overrides mirroring the Cluster A pattern) ===
  [ '.approval-banner-icon + .approval-banner-title + .approval-banner-policy-id + .approval-banner-failure-msg',
    'rgba(245,158,11,0.12) bg tint + #f59e0b icon + var(--vscode-terminal-ansiRed) policy-id',
    'Banner bg is a HARDCODED amber tint; icon fg is HARDCODED #f59e0b (does not theme-shift to Dark+/HC-Dark + Light+). The vscode-token policy-id and descriptionForeground inside the tint bg also fails AA in Light+ (amber tint blends toward white, vscode-token fg drops below 4.5:1). Cluster D-2 target.' ],
  [ '.approval-banner-btn--approve (D-2 #1 — TOKENIZED)',
    'var(--vscode-charts-green, #22c55e) bg + #ffffff fg + @media light/dark overrides rebinding to var(--vscode-charts-green-bright, #15803D)',
    'Cluster D-2 #1 tokenized the APPROVE button: base bg = `var(--vscode-charts-green, #22c55e)` (upstream #3FA856 in Dark+/Light+, #3FB950 in HC-Dark would render at ~2.27:1 Light+ / ~2.94:1 Dark+ vs `white`, sub-3:1 WCAG 1.4.11 UI-floor); both @media (prefers-color-scheme: light) AND (prefers-color-scheme: dark) override rebind to the Cluster A bright-tier `var(--vscode-charts-green-bright, #15803D)` (Tailwind green-700, ≈ 3.30:1 vs #FFFFFF / ≈ 6.04:1 vs #1E1E1E / ≈ 9.18:1 vs #000000). HC-Dark reports prefers-color-scheme:dark via Chrome so the dark @media fires there too. Post-fix audit-stamp: ✓PASS 5.02:1 across all 3 themes. Remaining D-2 batches (per user outline): .approval-banner-{icon,title,policy-id,failure-msg,btn--deny}, .kanban-card-agent-badge--* (8), .kanban-agent-status--* (6), kanban-card chrome (5), status dots (3).' ],
  [ '.kanban-card-agent-badge--* (8 state variants: running/queued/interrupted/terminal/completed/failed/idle/resuming)',
    '#f59e0b / #6366f1 / #f97316 / #22c55e / #ef4444 / var(--vscode-descriptionForeground) (HARDCODED hexes on rgba(..,0.15) tint bgs)',
    'Bright hex fg on hex-tint 0.15-alpha bg blends near-white in Light+ (each variant drops to ~1.3-2.4:1 fg-vs-bg in Light+). Cluster D-2 will tokenize + add @media (prefers-color-scheme: light) override lowering the bgs to transparent + boosting fg via --vscode-charts-mid.' ],
  [ '.kanban-agent-status--* (detail-panel badge — same palette as the card agent badges, no animation)',
    'same as above',
    'Mirror of the card agent-badge inventory. Cluster D-2 will tokenize identically.' ],
  [ '.kanban-card-epic-tag + .kanban-card-harness-badge--error + .kanban-column-status-dot--*',
    '#8b5cf6 / #ef4444 / #f59e0b (HARDCODED hex fg on alpha tint bg)',
    'Card chrome accents. Cluster D-2 will tokenize to --vscode-charts-purple / --vscode-errorForeground / --vscode-charts-orange.' ],
  [ '.kanban-card--epic + .kanban-card--running + .kanban-card--queued + .kanban-card--interrupted (border)',
    '#8b5cf6 / #f59e0b / #6366f1 / #f97316 HARDCODED border color',
    'No theme-shift. Cluster D-2 will tokenize. Note: border colors do not have a direct UI contrast floor in the audit matrix (they decorate without text), but HC theme + Light+ aesthetic consistency requires them to theme-shift like the badges.' ],
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
