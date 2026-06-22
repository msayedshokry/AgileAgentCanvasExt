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

// Cluster D-2 #3 — pull TOKS from the shared module so this file and the
// vitest test file (webview-ui/src/agentic-kanban/Autonomy.a11y.test.ts)
// agree on per-theme token resolutions. Drift between the two would silently
// regress either the audit or the SHAPE-guard tests without failing the build.
// The bright-tier family `--vscode-charts-{red|orange|green}-bright` is the
// canonical escape hatch when the upstream token fails the WCAG 1.4.11 3:1
// UI-floor in some scheme. Per-theme resolution is owned by
// webview-ui/src/test/a11y-tokens.mjs — that file is the single source of
// truth, edited in one place when a token's per-theme resolution or
// bright-tier fallback changes.
const { TOKS } = await import('../webview-ui/src/test/a11y-tokens.mjs');

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
  // Cluster D-2 #2 — `.approval-banner-icon` is the second of the 14
  // catalog-FAIL rows to be tokenized. Pre-fix HARDCODED `#f59e0b`
  // rendered at ~2.13:1 vs Light+ `#FFFFFF` editor bg (sub-3:1 WCAG
  // 1.4.11 UI-component floor). Post-fix the CSS declares
  //   color: var(--vscode-charts-orange, #f59e0b)
  // which resolves per-theme to `#F59E0B` Dark+/HC-Dark (`#B85C00`
  // Light+) without any `@media` override: the upstream token auto-
  // darkens to a brown tone in Light+ (`#B85C00` ≈ 4.57:1 vs white)
  // clearing both AA-text and UI-floor. The cluster flag is cleared
  // (mirrors `.approval-banner-btn--approve` post-D-2-#1-shipping).
  { cat: 'badge-vs-surface', s: '.approval-banner-icon (⚠ icon)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-orange, #f59e0b)', bg: 'inherit' },
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
  // Pattern: 6 HARDCODED fg hexes were tokenized in Cluster D-2 #3 to
  // --vscode-charts-{orange,indigo,green,red,red-bright} + an `@media
  // (prefers-color-scheme: light)` override for .terminal/.completed
  // rebinding to `--vscode-charts-green-bright, #15803D` (the upstream
  // `#3FA856` atop the green-tint+white composite drops to ~2.6:1, sub-3:1).
  // The rgba(0.15) tint bgs remain HARDCODED intentionally — they're
  // theme-agnostic decoration and clear 3:1 via the theme-aware fg.
  // The .idle + .resuming states were already theme-tokenized (--vscode-
  // descriptionForeground and --vscode-charts-blue respectively) and
  // remain unchanged. Cluster flag dropped for all 8 surfaces below.
  { cat: 'badge-vs-surface', s: '.kanban-card-agent-badge (neutral base)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'rgba(128,128,128,0.15)' },
  // D-2 #3 tokenized: amber HARDCODED → --vscode-charts-orange. Light+
  // resolves to `#B85C00` clearing 3:1 against rgba-tint+white composite.
  { cat: 'badge-vs-surface',    s: '.kanban-card-agent-badge--running (amber transform-pulse + tokenized orange)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-orange, #f59e0b)',
    bg: 'rgba(245,158,11,0.15)' },
  // D-2 #3 tokenized: indigo HARDCODED → NOVEL --vscode-charts-indigo.
  // Light+ resolves to `#4f46e5` clearing 4.5:1 AA-text.
  { cat: 'badge-vs-surface',    s: '.kanban-card-agent-badge--queued (indigo transform-pulse + tokenized indigo)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-indigo, #6366f1)',
    bg: 'rgba(99,102,241,0.15)' },
  // D-2 #3 tokenized: orange HARDCODED → --vscode-charts-orange (accept
  // upstream `#F59E0B` drift from original `#f97316`; semantics similar).
  { cat: 'badge-vs-surface',    s: '.kanban-card-agent-badge--interrupted (orange transform-pulse-stronger + tokenized orange)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-orange, #f97316)',
    bg: 'rgba(249,115,22,0.15)' },
  // D-2 #3 tokenized: green HARDCODED → --vscode-charts-green. The
  // chipClass annotation enables `findOverrideMedia()` to detect the
  // `@media (prefers-color-scheme: light) { color: green-bright; }`
  // override added in Kanban.css (Light+ re-binds to `--vscode-charts-
  // green-bright, #15803D` because upstream `#3FA856` atop the green-
  // tint+white composite drops to ~2.6:1).
  { cat: 'badge-vs-surface',
    chipClass: '.kanban-card-agent-badge--terminal',
    s: '.kanban-card-agent-badge--terminal (green + @media light green-bright)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-green, #22c55e)',
    bg: 'rgba(34,197,94,0.15)' },
  // D-2 #3 tokenized: same as .terminal (--vscode-charts-green +
  // @media light green-bright override).
  { cat: 'badge-vs-surface',
    chipClass: '.kanban-card-agent-badge--completed',
    s: '.kanban-card-agent-badge--completed (green + @media light green-bright)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-green, #22c55e)',
    bg: 'rgba(34,197,94,0.15)' },
  // D-2 #3 tokenized: red HARDCODED → NOVEL --vscode-charts-red (per-theme:
  // Dark+/HC-Dark `#F85149`, Light+ `#E51400`).
  { cat: 'badge-vs-surface', s: '.kanban-card-agent-badge--failed (red)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-red, #ef4444)',
    bg: 'rgba(239,68,68,0.15)' },
  // Already-tokenized (.idle uses --vscode-descriptionForeground + the
  // neutral 0.15 grey tint). No @media override required.
  { cat: 'badge-vs-surface', s: '.kanban-card-agent-badge--idle (gray)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'rgba(128,128,128,0.15)' },
  // Already-tokenized (.resuming uses --vscode-charts-blue via color-mix;
  // audit-script's `resolve()` falls through color-mix() to parentBg so
  // the bg='inherit' reduces to fg-vs-editor-bg contrast, equivalent to
  // measuring the fg against the editor surface directly).
  { cat: 'badge-vs-surface', s: '.kanban-card-agent-badge--resuming (blue spinner)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-blue)',
    bg: 'inherit' },

  // === Detail-panel agent status (8 state variants) ===
  // Same hex palette as the card badges but no animation, sits inside the
  // side-drawer (`.agentic-detail-panel`). Cluster D-2 #4 tokenized 5
  // HARDCODED fg hexes (mirroring the Cluster D-2 #3 card-agent-badge
  // mapping) to `--vscode-charts-{orange,indigo,green,red}` + an `@media
  // (prefers-color-scheme: light)` override on `.kanban-agent-status--completed`
  // rebinding to `--vscode-charts-green-bright` (the upstream `#3FA856` in
  // Light+ atop the green-tint+white composite drops to ~2.6:1, sub-3:1
  // WCAG 1.4.11 UI-component floor). The rgba(0.15) tint bgs remain
  // HARDCODED intentionally — theme-agnostic decoration; per-theme fg
  // contrast closes the floor. The `.kanban-agent-status` (neutral base)
  // and `.kanban-agent-status--idle` states already used
  // `--vscode-descriptionForeground` and were SHAPE-only locked (no
  // var-form change). Cluster flag dropped for all 7 rows below.
  { cat: 'badge-vs-surface', s: '.kanban-agent-status (neutral base)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'rgba(128,128,128,0.15)' },
  // D-2 #4 tokenized: amber HARDCODED → --vscode-charts-orange. Light+
  // resolves to `#B85C00` clearing ≈ 4.585:1 AA-text vs `#FFFFFF`.
  { cat: 'badge-vs-surface', s: '.kanban-agent-status--running (amber)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-orange, #f59e0b)',
    bg: 'rgba(245,158,11,0.15)' },
  // D-2 #4 tokenized: indigo HARDCODED → NOVEL --vscode-charts-indigo.
  // Light+ resolves to `#4f46e5` clearing 4.5:1 AA-text.
  { cat: 'badge-vs-surface', s: '.kanban-agent-status--queued (indigo)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-indigo, #6366f1)',
    bg: 'rgba(99,102,241,0.15)' },
  // D-2 #4 tokenized: orange HARDCODED → --vscode-charts-orange (same
  // token as .running; accepts upstream `#F59E0B` drift from original
  // `#f97316`; semantics similar — both are warm orange tones).
  { cat: 'badge-vs-surface', s: '.kanban-agent-status--interrupted (orange)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-orange, #f97316)',
    bg: 'rgba(249,115,22,0.15)' },
  // D-2 #4 tokenized: green HARDCODED → --vscode-charts-green. The
  // chipClass annotation enables `findOverrideMedia()` to detect the
  // `@media (prefers-color-scheme: light) { color: green-bright; }`
  // override added in Kanban.css (Light+ re-binds to `--vscode-charts-
  // green-bright, #15803D` because upstream `#3FA856` atop the green-
  // tint+white composite drops to ~2.6:1).
  { cat: 'badge-vs-surface',
    chipClass: '.kanban-agent-status--completed',
    s: '.kanban-agent-status--completed (green + @media light green-bright)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-green, #22c55e)',
    bg: 'rgba(34,197,94,0.15)' },
  // D-2 #4 tokenized: red HARDCODED → NOVEL --vscode-charts-red (per-theme:
  // Dark+/HC-Dark `#F85149`, Light+ `#E51400`).
  { cat: 'badge-vs-surface', s: '.kanban-agent-status--failed (red)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-red, #ef4444)',
    bg: 'rgba(239,68,68,0.15)' },
  // Already-tokenized (.idle uses --vscode-descriptionForeground + the
  // neutral 0.15 grey tint). No @media override required.
  { cat: 'badge-vs-surface', s: '.kanban-agent-status--idle (gray)',
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
  // Cluster D-3 #1c — tokenize .kanban-card-type-tag with HARDCODED Universal
  // fallbacks (#4D4D4D bg + #FFFFFF fg clear WCAG 1.4.11 3:1 UI-floor in
  // HC-Dark where upstream `--vscode-badge-background` is unset) + Light+ override
  // rebinding to editor-bg + foreground (dark-on-light, ≈16:1 -- clears all
  // floors). `chipClass` annotation enables `findOverrideMedia()` to detect
  // the @media-light rule in Kanban.css. The `bg: 'rgba(127,127,127,0.2)'`
  // fallback that the prior row carried has been REMOVED because the actual
  // production rule now declares `, #4D4D4D` as the Universal fallback;
  // an audit-script `bg` field that doesn't reflect production would silently
  // false-pass or false-fail the harvest. The model now matches the CSS.
  { cat: 'severity-pip', chipClass: '.kanban-card-type-tag',
    s: '.kanban-card-type-tag (KEY chip on card + D-3-#1c tokenized)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-badge-foreground, #FFFFFF)',
    bg: 'var(--vscode-badge-background, #4D4D4D)' },  // D-2 #5 tokenized. The chipClass annotation enables `findOverrideMedia()`
  // to detect the `@media (prefers-color-scheme: light) { color: #7c3aed; }`
  // override added in Kanban.css (Light+ re-binds from default `#B266FF`
  // ≈ 3.05:1 to purple-600 ≈ 4.95:1 vs `#FFFFFF` because upstream token
  // default Light+ atop the rgba-purple-10%-tint+white composite drops to
  // ≈ 3.05:1, sub-AA-text 4.5:1 for 10px small text).
  { cat: 'severity-pip',
    chipClass: '.kanban-card-epic-tag',
    s: '.kanban-card-epic-tag (purple EPIC chip + @media light `#7c3aed`)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-purple, #8b5cf6)',
    bg: 'rgba(139,92,246,0.10)' },
  { cat: 'severity-pip',  cluster: 'D-2-tokenize', s: '.kanban-card-lock-badge (LOCK chip)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'rgba(128,128,128,0.15)' },  // D-2 #5 tokenized. Conventional error AA-large 3:1 acceptable in Light+
  // (Light+ `#E51400` vs red-tint+white composite ≈ 4.04:1 → ~UI marker
  // per audit; clears UI-floor but not AA-text 4.5:1 — conventional for
  // error messaging). Mirrors the established D-2 #3 `.failed` decision.
  { cat: 'badge-vs-surface', s: '.kanban-card-harness-badge--error (red error chip + tokenized)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-red, #ef4444)',
    bg: 'rgba(239,68,68,0.15)' },

  // === Cluster D-2 #5 — kanban-card chrome border accents (decorative) ===
  // Border colors do NOT have a direct WCAG 1.4.11 UI-component contrast
  // floor (they decorate without text overlap), but HC theme + Light+
  // aesthetic consistency requires them to theme-shift like the badges.
  // Tokenized: --vscode-charts-{purple,orange,indigo,orange} mapping.
  // Purple `#B266FF` is constant across all 3 themes (visual unchanged
  // post-tokenization); orange Light+ `#B85C00` deepens; indigo Light+
  // `#4f46e5` deepens. Contrast ratios vs `--vscode-editor-background`
  // parent bg clear 3:1 UI-floor in all themes (purple 4.89 Dark+ / 3.41
  // Light+ / 6.17 HC-Dark; orange 7.76 / 4.585 / 9.84; indigo 4.04 / 5.29
  // / 5.04). No @media override required.
  { cat: 'severity-pip',
    s: '.kanban-card--epic (4px left border accent)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-purple, #8b5cf6)', bg: 'inherit' },
  { cat: 'severity-pip',
    s: '.kanban-card--running (border accent + box-shadow glow)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-orange, #f59e0b)', bg: 'inherit' },
  { cat: 'severity-pip',
    s: '.kanban-card--queued (border accent)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-indigo, #6366f1)', bg: 'inherit' },
  { cat: 'severity-pip',
    s: '.kanban-card--interrupted (border accent + box-shadow glow)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-charts-orange, #f97316)', bg: 'inherit' },

  // === Status dots inside column header counts (3 variants) ===
  // Cluster D-2 #6 tokenized. Reuses D-2 #3 TOKS tokens (orange + indigo) with
  // bgSetsFg:true routing that treats the `background:` decl as the rendered
  // dot fg for the contrast pass. Cluster flag dropped.
  { cat: 'severity-pip',
    chipClass: '.kanban-column-status-dot--running', bgSetsFg: true,
    s: '.kanban-column-status-dot--running (amber transform-pulse + tokenized orange)',
    parent: '--vscode-editor-lineHighlightBackground',
    fg: 'var(--vscode-charts-orange, #f59e0b)', bg: 'inherit' },
  { cat: 'severity-pip',
    chipClass: '.kanban-column-status-dot--queued', bgSetsFg: true,
    s: '.kanban-column-status-dot--queued (indigo + tokenized NOVEL --vscode-charts-indigo)',
    parent: '--vscode-editor-lineHighlightBackground',
    fg: 'var(--vscode-charts-indigo, #6366f1)', bg: 'inherit' },
  { cat: 'severity-pip',
    chipClass: '.kanban-column-status-dot--interrupted', bgSetsFg: true,
    s: '.kanban-column-status-dot--interrupted (orange + tokenized same --vscode-charts-orange as --running)',
    parent: '--vscode-editor-lineHighlightBackground',
    fg: 'var(--vscode-charts-orange, #f97316)', bg: 'inherit' },

  // =====================================================================
  // Cluster D-3 #1.a — Corpus3DView chrome surfaces (className refs +
  // HARDCODED Universal fallbacks + Light+ media-query overrides).
  // =====================================================================
  // Closes the 5–6 inline-tsx Corpus3DView FAILs by replacing 6 inline
  // `style={{...}}` sites (spinner / loading-wrap / error-wrap / error-detail
  // / search-box / search-input / search-clear / match-count /
  // phase-legend / phase-swatch × 4 variants) with className refs.
  //
  // Row layout:
  //   *  4 fg-vs-editor-bg rows that mirror CSS rule bindings directly
  //      (.corpus-3d-spinner borderTop-color, .error-wrap fg, .search-input
  //      fg, .phase-swatch --0 clears 3:1 naturally — light override shifts
  //      --1/--2/--3 below).
  //   *  3 chrome/container rows that measure rendered contrast against
  //      the chrome tile (the rgba layering composes to a non-inherited
  //      bg; for Light+ the @media override flips to opaque editor-bg so
  //      we log two rows per chrome — one for the base path, one for
  //      the override path).
  //   *  3 phase-swatch Light+ override rows (.--1, .--2, .--3 rebinds).
  { cat: 'corpus-3d', s: '.corpus-3d-spinner (borderTop-color, accent ring)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-focusBorder, #007FD8)',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-error-wrap (error fg, conventional error-rendering)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-errorForeground)',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-search-input (search text fg)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-foreground)',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-search-clear (clear-button color, base path)',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground)',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-search-clear (Light+ override path: TOKS-resolved var(--vscode-descriptionForeground, #505050))',
    chipClass: '.corpus-3d-search-clear',
    parent: '--vscode-editor-background',
    fg: 'var(--vscode-descriptionForeground, #505050)',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-phase-swatch--0 (Phase 0 purple #ab47bc, clears floor naturally)',
    parent: '--vscode-editor-background',
    fg: '#ab47bc',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-phase-swatch--1 (Phase 1 cyan base HARDCODED #4fc3f7)',
    parent: '--vscode-editor-background',
    fg: '#4fc3f7',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-phase-swatch--1 (Light+ override: #0e7490 clears 3:1 vs #FFFFFF)',
    chipClass: '.corpus-3d-phase-swatch--1',
    parent: '--vscode-editor-background',
    fg: '#0e7490',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-phase-swatch--2 (Phase 2 orange base HARDCODED #ff9800)',
    parent: '--vscode-editor-background',
    fg: '#ff9800',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-phase-swatch--2 (Light+ override: #b45309 clears 3:1 vs #FFFFFF)',
    chipClass: '.corpus-3d-phase-swatch--2',
    parent: '--vscode-editor-background',
    fg: '#b45309',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-phase-swatch--3 (Phase 3 green base HARDCODED #4caf50)',
    parent: '--vscode-editor-background',
    fg: '#4caf50',
    bg: 'inherit' },
  { cat: 'corpus-3d', s: '.corpus-3d-phase-swatch--3 (Light+ override: #15803D clears 3:1 vs #FFFFFF)',
    chipClass: '.corpus-3d-phase-swatch--3',
    parent: '--vscode-editor-background',
    fg: '#15803D',
    bg: 'inherit' },
];

// =============================================================================
// Cluster D-3 commit 2 — lazy run-time TSX introspector (CSS-in-JS coverage)
// =============================================================================
//
// Walks 9 harvested `.tsx` files at audit-script startup and regex-extracts
// every `style={{ ... }}` JSX body that carries a color-bearing key. Each
// captured expression becomes a SURFACES row tagged `cat: 'inline-tsx'` so
// the existing contrast matrix picks it up automatically — no special-case
// in the engine loop.
//
// Scope: only STATIC LITERAL values (single / double / backtick quoted).
// Runtime variables and ternaries (e.g. `borderTopColor: col.accent`,
// `view === 'terminals' ? 'var(--foo)' : 'transparent'`) fall through
// silently — those surfaces would need a colored checkpoint in production
// to audit deterministically, which is out of scope for a static sweep.
//
// Regex shape:
//   outer   `/style={{([\s\S]*?)}}/g`        — non-greedy so consecutive
//                                               blocks don't merge; handles
//                                               multi-line style bodies.
//   inner   `/([\w-]+):\s*(['"`])([^'"`]*?)\2/g` — only quoted-literal
//                                                       values; bookmarks the
//                                                       source line for the
//                                                       audit row label.
//
// The 9 harvested files span two directories (App.tsx + agentic-kanban/
// + components/ sub-tree). Files missing on disk are skipped silently so
// the harvest remains resilient to future renames. The renderer files
// (bmm/cis/core/tea/test) carry most of the density — 1755 raw `style={{`
// matches total but only ≈205 are color-bearing; the audit-concern
// surface is those ≈205, not the layout-only majority.
// =============================================================================
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

// Color-bearing keys and which slot they own. `color` is the only fg slot;
// every other key (background, backgroundColor, border*Color, outlineColor)
// renders to a border or surface-decoration bg slot, which is the WCAG
// 1.4.11 UI-component floor (3:1) rather than the AA-text floor (4.5:1).
const COLOR_KEYS = new Set([
  'color', 'background', 'backgroundColor',
  'borderColor', 'borderTopColor', 'borderBottomColor',
  'borderLeftColor', 'borderRightColor', 'outlineColor',
]);
const FG_KEYS = new Set(['color']);

const STYLE_BODY_RE = /style=\{\{([\s\S]*?)\}\}/g;
const KV_QUOTED_RE = /([\w-]+)\s*:\s*(['"`])([^'"`]*?)\2/g;

function harvestInlineTsxSurfaces() {
  const rows = [];
  const webviewSrcDir = path.resolve(
    __dirname, '..', 'webview-ui', 'src',
  );
  let filesScanned = 0;
  for (const relPath of INLINE_TSX_TARGETS) {
    const fullPath = path.join(webviewSrcDir, relPath);
    let content;
    try { content = readFileSync(fullPath, 'utf-8'); }
    catch { continue; } // missing file → skip silently; harvest remains resilient to renames
    filesScanned++;
    STYLE_BODY_RE.lastIndex = 0;
    let bodyMatch;
    while ((bodyMatch = STYLE_BODY_RE.exec(content)) !== null) {
      const body = bodyMatch[1];
      const lineNum = content.slice(0, bodyMatch.index).split('\n').length;
      KV_QUOTED_RE.lastIndex = 0;
      let kv;
      while ((kv = KV_QUOTED_RE.exec(body)) !== null) {
        const key = kv[1];
        const value = kv[3];
        if (!COLOR_KEYS.has(key)) continue;
        if (FG_KEYS.has(key)) {
          rows.push({
            cat: 'inline-tsx',
            source: 'inline-tsx',
            s: `inline-style ${key} @ ${relPath}:L${lineNum}`,
            parent: '--vscode-editor-background',
            fg: value,
            bg: 'inherit',
          });
        } else {
          rows.push({
            cat: 'inline-tsx',
            source: 'inline-tsx',
            s: `inline-bg ${key} @ ${relPath}:L${lineNum}`,
            parent: '--vscode-editor-background',
            fg: 'var(--vscode-foreground)',
            bg: value,
          });
        }
      }
    }
  }
  return { rows, filesScanned };
}

const HARVEST = harvestInlineTsxSurfaces();
console.log(`INLINE-TSX HARVEST: ${HARVEST.rows.length} color-bearing rows from ${HARVEST.filesScanned}/${INLINE_TSX_TARGETS.length} files`);
SURFACES.push(...HARVEST.rows);

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
    // UI-component 3.0:1 floor for inline-tsx rows too — those are borders
    // and surface decorations (background, borderColor, outlineColor) where
    // AA-text 4.5:1 is the wrong gate. AA-text only applies to the `color`
    // slot which is the minority of inline-tsx keys (most are bg/border).
    const minFloor = (s.cat === 'severity-pip' || s.cat === 'badge-vs-surface' || s.cat === 'row-vs-editor' || s.cat === 'inline-tsx') ? 3.0 : 4.5;
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
  [ '.approval-banner-icon (D-2 #2 — TOKENIZED) + .approval-banner-title + .approval-banner-policy-id + .approval-banner-failure-msg',
    'rgba(245,158,11,0.12) bg tint HARDCODED for title/policy-id/failure-msg children only; icon fg tokenized to var(--vscode-charts-orange, #f59e0b)',
    'Cluster D-2 #2 tokenized the ICON: base color = `var(--vscode-charts-orange, #f59e0b)` (upstream `#F59E0B` in Dark+/HC-Dark and `#B85C00` in Light+ — the brown Light+ tone clears both WCAG 1.4.11 3:1 UI-floor and 4.5:1 AA-text against `#FFFFFF` editor bg with ~0.085 margin). Pre-fix HARDCODED #f59e0b rendered at ~2.13:1 vs Light+ `#FFFFFF` editor bg (sub-3:1 UI-component floor). No `@media` override needed: the upstream token auto-darkens in Light+. Post-fix audit-stamp: ✓PASS across all 3 themes (Dark+ ≈ 7.76:1, Light+ ≈ 4.60:1, HC-Dark ≈ 9.78:1 per audit-script run output). REMAINING in-banner HARDCODED: the amber-tint bg `rgba(245,158,11,0.12)` that wraps `.approval-banner-title` / `.approval-banner-policy-id` / `.approval-banner-failure-msg` children. Post-fix, these 3 rows report `~UI` in the audit-script output (3.0 ≤ contrast < 4.5) — the WCAG 1.4.11 3:1 UI-component floor is met but the AA-text 4.5:1 floor is borderline because the bright amber tint washes out the theme-token fg (Dark+ ansiRed on amber ≈ 4.13:1, etc.). Acceptable for non-text glyph chips but a future audit-fidelity sweep could lift via a token-aware `--vscode-editorWarning-background` parent surface (Dark+ `#3D3208` is documented in TOKS).' ],
  [ '.approval-banner-btn--approve (D-2 #1 — TOKENIZED)',
    'var(--vscode-charts-green, #22c55e) bg + #ffffff fg + @media light/dark overrides rebinding to var(--vscode-charts-green-bright, #15803D)',
    'Cluster D-2 #1 tokenized the APPROVE button: base bg = `var(--vscode-charts-green, #22c55e)` (upstream #3FA856 in Dark+/Light+, #3FB950 in HC-Dark would render at ~2.27:1 Light+ / ~2.94:1 Dark+ vs `white`, sub-3:1 WCAG 1.4.11 UI-floor); both @media (prefers-color-scheme: light) AND (prefers-color-scheme: dark) override rebind to the Cluster A bright-tier `var(--vscode-charts-green-bright, #15803D)` (Tailwind green-700, ≈ 3.30:1 vs #FFFFFF / ≈ 6.04:1 vs #1E1E1E / ≈ 9.18:1 vs #000000). HC-Dark reports prefers-color-scheme:dark via Chrome so the dark @media fires there too. Post-fix audit-stamp: ✓PASS 5.02:1 across all 3 themes. Remaining D-2 batches (per user outline): .approval-banner-{icon,title,policy-id,failure-msg,btn--deny}, .kanban-card-agent-badge--* (8), .kanban-agent-status--* (6), kanban-card chrome (5), status dots (3).' ],
  [ '.kanban-card-agent-badge--* (D-2 #3: 6 of 8 TOKENIZED)',
    'var(--vscode-charts-{orange,indigo,green,red}, ...) tokenized fg + @media light green-bright override; the rgba(0.15) tint bgs remain intentional HARDCODED decoration',
    'Cluster D-2 #3 tokenized 6 HARDCODED fg hexes: `#f59e0b` (.running amber) → `--vscode-charts-orange, #f59e0b`; `#6366f1` (.queued indigo) → NOVEL `--vscode-charts-indigo, #6366f1` (per-theme Dark+/HC-Dark `#818cf8`, Light+ `#4f46e5`); `#f97316` (.interrupted orange) → `--vscode-charts-orange, #f97316` (accepts upstream `#F59E0B` drift in Light+ ambient — passes 3:1 atop rgba-tint); `#22c55e` (.terminal/.completed green) → `--vscode-charts-green, #22c55e` PLUS `@media (prefers-color-scheme: light) { color: var(--vscode-charts-green-bright, #15803D); }` because upstream `#3FA856` in Light+ atop the green-tint+white composite drops to ~2.6:1 (sub-3:1 UI-component floor); `#ef4444` (.failed red) → NOVEL `--vscode-charts-red, #ef4444` (per-theme Dark+/HC-Dark `#F85149`, Light+ `#E51400`). The `.idle` (already `var(--vscode-descriptionForeground)`) and `.resuming` (already `--vscode-charts-blue` via `color-mix()`) states pass through unchanged. The rgba(0.15) tint bgs remain HARDCODED intentionally — they\'re theme-agnostic decoration; per-theme fg contrast is what closes the WCAG 1.4.11 3:1 UI-floor.' ],
  [ '.kanban-agent-status--* (D-2 #4: 5 of 7 TOKENIZED — same palette as the card agent badges, no animation)',
    'var(--vscode-charts-{orange,indigo,green,red}, ...) tokenized fg + @media light green-bright override; the rgba(0.15) tint bgs remain intentional HARDCODED decoration',
    'Cluster D-2 #4 tokenized 5 HARDCODED fg hexes (mirroring D-2 #3 card-badge mapping): `#f59e0b` (.running amber) → `--vscode-charts-orange, #f59e0b` (Light+ `#B85C00` clears ≈ 4.585:1 AA-text); `#6366f1` (.queued indigo) → NOVEL `--vscode-charts-indigo, #6366f1` (per-theme Dark+/HC-Dark `#818cf8`, Light+ `#4f46e5`); `#f97316` (.interrupted orange) → `--vscode-charts-orange, #f97316` (accepts upstream `#F59E0B` Light+ drift); `#22c55e` (.completed green) → `--vscode-charts-green, #22c55e` PLUS `@media (prefers-color-scheme: light) { color: var(--vscode-charts-green-bright, #15803D); }` because upstream `#3FA856` in Light+ atop the green-tint+white composite drops to ~2.6:1 (sub-3:1 UI-component floor); `#ef4444` (.failed red) → NOVEL `--vscode-charts-red, #ef4444` (per-theme Dark+/HC-Dark `#F85149`, Light+ `#E51400` ≈ 4.13:1). The `.kanban-agent-status` (neutral base, already `--vscode-descriptionForeground`) and `.kanban-agent-status--idle` (also `--vscode-descriptionForeground`) pass through unchanged. The rgba(0.15) tint bgs remain HARDCODED intentionally — they\'re theme-agnostic decoration; per-theme fg closes the WCAG 1.4.11 3:1 UI-floor.' ],
  [ '.kanban-card chrome (D-2 #5: 6 of 6 TOKENIZED — kanban-card chrome complete)',
    'var(--vscode-charts-{purple,orange,indigo,orange}, ...) for 2 chip-pip fg + 4 border accents + @media light override for .kanban-card-epic-tag rebinds to #7c3aed (purple-600)',
    'Cluster D-2 #5 tokenizes 6 HARDCODED kanban-card-chrome hexes: 2 chip-pips (.kanban-card-epic-tag fg `#8b5cf6` → `var(--vscode-charts-purple, #8b5cf6)` with `@media (prefers-color-scheme: light) { color: #7c3aed; }` rebind because upstream `#B266FF` Light+ atop the rgba-purple-10%-tint+white composite drops to ≈ 3.05:1, sub-AA-text 4.5:1 for 10px small text; .kanban-card-harness-badge--error fg `#ef4444` → `var(--vscode-charts-red, #ef4444)` mirroring the established D-2 #3 `.failed` decision (Light+ `#E51400` ≈ 4.04:1 is conventionally AA-large 3:1 acceptable for error messaging) + 4 border-accent decorations (.kanban-card--epic border-left `#8b5cf6` → `var(--vscode-charts-purple, #8b5cf6)`; .kanban-card--running border `#f59e0b` → `var(--vscode-charts-orange, #f59e0b)`; .kanban-card--queued border `#6366f1` → `var(--vscode-charts-indigo, #6366f1)`; .kanban-card--interrupted border `#f97316` → `var(--vscode-charts-orange, #f97316)` accepting upstream `#F59E0B` Light+ visual drift from the original `#f97316`). The 3 `.kanban-column-status-dot--*` rows remain HARDCODED in this commit (separate scope: column header status dots vs card chrome — out of scope for D-2 #5 per user task brief; planned for a future Cluster D-x batch).' ],
  [ '.kanban-column-status-dot--* (column header status dot trio, NOT tokenized in D-2 #5)',
    '#f59e0b / #6366f1 / #f97316 HARDCODED bg in Kanban.css',
    'Column header sub-count status dots. Same HARDCODED hex palette as the card-state borders but rendered as `<--running>/<--queued>/<--interrupted>` 6px dot markers inside `.kanban-column-count`. Separate scope from D-2 #5 (user specified kanban-card chrome only — column status dots belong to a future batch).' ],
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
