// =============================================================================
// Shared color-token table for the Agile Agent Canvas accessibility audit.
//
// SHARED MODULE consumed by:
//   1. scripts/a11y-surface-sweep.mjs          (Node CLI; runs directly via `node`)
//   2. webview-ui/src/agentic-kanban/Autonomy.a11y.test.ts  (Vitest)
//
// Both consumers MUST agree on the per-theme token resolutions — drift
// between them would silently regress the audit or the SHAPE-guard tests
// without failing the build. This file is the single source of truth;
// edit it in one place when a token's resolution or bright-tier
// fallback changes, and both consumers pick up the change automatically.
//
// Edit pattern: when adding a new --vscode-charts-* token, add it to
// `TOKS` below. If you add a NOVEL token (one not in the canonical VS
// Code upstream palette), be sure to also document the rationale in
// the per-token comment so future maintainers can audit the choice.
//  // Tokens added (with commit attribution):
  //   - charts-{red|orange|green}-bright         Cluster A
  //   - charts-green-bright                       Cluster D-2 #1 (.btn--approve)
  //   - charts-orange (Universal fallback)       Cluster D-2 #2 (.approval-banner-icon)
  //   - charts-indigo (NOVEL — `blue` is upstream blue, not indigo)  Cluster D-2 #3 (.kanban-card-agent-badge--queued)
  //   - charts-red (Universal fallback)          Cluster D-2 #3 (.kanban-card-agent-badge--failed)
  //   - charts-pink / charts-cyan                 Cluster D-2 #3 (refactor: shared TOKS table required these per-theme resolutions to light up test-file cross-theme contrast assertions that previously resolved to the Universal-fallback hex)
// =============================================================================

export const TOKS = {
  // Aliases — VS Code ships both kebab-case `editor-background` and camelCase `editorBackground`.
  // Both resolve to the editor canvas surface color per theme.
  '--vscode-editorBackground':         { 'Dark+': '#1E1E1E', 'Light+': '#FFFFFF', 'HC-Dark': '#000000' },
  '--vscode-editor-background':        { 'Dark+': '#1E1E1E', 'Light+': '#FFFFFF', 'HC-Dark': '#000000' },
  '--vscode-editor-foreground':        { 'Dark+': '#D4D4D4', 'Light+': '#1F1F1F', 'HC-Dark': '#FFFFFF' },
  '--vscode-foreground':               { 'Dark+': '#CCCCCC', 'Light+': '#1F1F1F', 'HC-Dark': '#FFFFFF' },
  '--vscode-descriptionForeground':    { 'Dark+': '#8B8B8B', 'Light+': '#717171', 'HC-Dark': '#FFFFFF' },
  '--vscode-errorForeground':          { 'Dark+': '#F48771', 'Light+': '#CE5017', 'HC-Dark': '#F48771' },
  '--vscode-focusBorder':              { 'Dark+': '#007FD8', 'Light+': '#007FD8', 'HC-Dark': '#F38518' },

  // Canonical VS Code upstream chart palette (`blue`, `green`, `orange`, `purple`, `yellow`).
  // Only `red` is missing upstream — augmented as NOVEL for Cluster D-2 #3.
  '--vscode-charts-blue':              { 'Dark+': '#1E80E0', 'Light+': '#1E80E0', 'HC-Dark': '#1E80E0' },
  '--vscode-charts-green':             { 'Dark+': '#3FA856', 'Light+': '#3FA856', 'HC-Dark': '#3FB950' },
  '--vscode-charts-orange':            { 'Dark+': '#F59E0B', 'Light+': '#B85C00', 'HC-Dark': '#F59E0B' },
  // Cluster D-2 #3 — `--vscode-charts-red` does NOT ship in upstream VS
  // Code's charts palette. We declare per-theme resolutions modeled
  // after GitHub-dark/light/HC tones (Dark+/HC-Dark `#F85149` matches
  // the existing terminal `.status-failed` dot fallback; Light+ `#E51400`
  // is a dark-red tone that clears 4.5:1 AA-text against the
  // `--vscode-editor-foreground` #FFFFFF editor bg in Light+).
  '--vscode-charts-red':               { 'Dark+': '#F85149', 'Light+': '#E51400', 'HC-Dark': '#F85149' },
  '--vscode-charts-yellow':            { 'Dark+': '#CA8A04', 'Light+': '#B58900', 'HC-Dark': '#CA8A04' },
  '--vscode-charts-purple':            { 'Dark+': '#B266FF', 'Light+': '#B266FF', 'HC-Dark': '#B266FF' },
  // Cluster D-2 #3 — `--vscode-charts-pink` does NOT ship in upstream VS
  // Code's charts palette. We declare per-theme resolutions modeled after
  // Tailwind's pink-400 / pink-700 family: Dark+/HC-Dark `#f472b6` (lighter
  // pink, clears 3:1 vs `#1E1E1E`/`#000000`); Light+ `#db2777` (deep pink,
  // clears 4.5:1 AA-text vs `#FFFFFF`). The Universal `#db2777` fallback
  // (the pink-bucket signature hex used by `.safety-block-type--ux-design`
  // + sibling chip classes) preserves the visual identity in themes that
  // omit the token.
  '--vscode-charts-pink':             { 'Dark+': '#f472b6', 'Light+': '#db2777', 'HC-Dark': '#f472b6' },
  // Cluster D-2 #3 — NOVEL `--vscode-charts-cyan` token. Upstream VS Code
  // palette has no cyan-anchor (only `blue / green / orange / purple / yellow`).
  // The .safety-block-type--sprint-status / --sprint / --research chip-palette
  // uses `#0891b2` (Tailwind cyan-600) as its signature hex. We declare
  // per-theme resolutions mirroring the chip-palette resolver pattern:
  // Dark+/HC-Dark `#22d3ee` (Tailwind cyan-400, lighter bright-cyan tone
  // that clears 3:1 vs the editor bg); Light+ `#0891b2` (deep cyan clears
  // 4.5:1 AA-text vs `#FFFFFF`). Universal fallback preserves identity.
  '--vscode-charts-cyan':             { 'Dark+': '#22d3ee', 'Light+': '#0891b2', 'HC-Dark': '#22d3ee' },
  // Cluster D-2 #3 — NOVEL `--vscode-charts-indigo` token. Upstream
  // VS Code palette has `-blue` (which is BLUE `#1E80E0`, not indigo).
  // The .kanban-card-agent-badge--queued surface uses `#6366f1` (true
  // indigo); we declare per-theme resolutions mirroring the token-test
  // cluster D-3's chip-palette test (test-file TOKS row from Cluster D-3
  // commit 0): Dark+/HC-Dark `#818cf8` (lighter indigo, clears 3:1 vs
  // `#1E1E1E`/`#000000`); Light+ `#4f46e5` (deep indigo, clears 4.5:1
  // vs `#FFFFFF`). The Universal `#6366f1` fallback preserves the
  // visual identity in themes that omit the token.
  '--vscode-charts-indigo':            { 'Dark+': '#818cf8', 'Light+': '#4f46e5', 'HC-Dark': '#818cf8' },

  // Bright-tier escape-hatch tokens — Cluster A pattern. Used when the
  // canonical upstream token fails the WCAG 1.4.11 3:1 UI-floor in
  // some scheme (e.g. Light+ `--vscode-charts-green` resolves to
  // `#3FA856` which renders at ~2.27:1 vs `#FFFFFF` editor bg — sub-3:1
  // UI-component floor). Theme-aware overrides (e.g. `@media
  // (prefers-color-scheme: light)`) rebind to these `*-bright` values
  // via `var(--vscode-charts-X-bright, #fb)` so theme authors can opt
  // in to a custom resolution. All bright-tier Universal hexes are
  // identical across themes so a single `prefers-color-scheme: dark`
  // block catches HC-Dark too (Chrome reports HC-Dark as `:dark`).
  '--vscode-charts-red-bright':        { 'Dark+': '#B91C1C', 'Light+': '#B91C1C', 'HC-Dark': '#B91C1C' },
  '--vscode-charts-orange-bright':     { 'Dark+': '#B45309', 'Light+': '#B45309', 'HC-Dark': '#B45309' },
  '--vscode-charts-green-bright':      { 'Dark+': '#15803D', 'Light+': '#15803D', 'HC-Dark': '#15803D' },

  // Terminal ANSI palette — used by .approval-banner-policy-id and the
  // terminal-grid running dots.
  '--vscode-terminal-ansiRed':         { 'Dark+': '#E06C75', 'Light+': '#A1260D', 'HC-Dark': '#E06C75' },
  '--vscode-terminal-ansiGreen':       { 'Dark+': '#98C379', 'Light+': '#1A8E3E', 'HC-Dark': '#98C379' },
  '--vscode-terminal-ansiYellow':      { 'Dark+': '#E5C07B', 'Light+': '#915E1D', 'HC-Dark': '#E5C07B' },

  // Validation backgrounds — used by safety-block row chrome.
  '--vscode-inputValidation-errorBackground':   { 'Dark+': '#5A1D1D', 'Light+': '#FCD9D9', 'HC-Dark': '' },
  '--vscode-inputValidation-warningBackground': { 'Dark+': '#4A3018', 'Light+': '#FCE5C5', 'HC-Dark': '' },
  '--vscode-editorInfo-background':             { 'Dark+': '#2A2A3D', 'Light+': '#DDE7F3', 'HC-Dark': '' },
  '--vscode-editorWarning-background':          { 'Dark+': '#3D3208', 'Light+': '#FCEDD0', 'HC-Dark': '' },

  // Generic surface / chrome / button tokens.
  '--vscode-badge-background':                 { 'Dark+': '#4D4D4D', 'Light+': '#B4B4B4', 'HC-Dark': '' },
  '--vscode-badge-foreground':                 { 'Dark+': '#FFFFFF', 'Light+': '#FFFFFF', 'HC-Dark': '#FFFFFF' },
  '--vscode-textLink-foreground':               { 'Dark+': '#3794FF', 'Light+': '#0563C1', 'HC-Dark': '#F38518' },
  '--vscode-button-background':                 { 'Dark+': '#0E639C', 'Light+': '#005FB8', 'HC-Dark': '' },
  '--vscode-button-foreground':                 { 'Dark+': '#FFFFFF', 'Light+': '#FFFFFF', 'HC-Dark': '#FFFFFF' },
  '--vscode-button-secondaryBackground':        { 'Dark+': '#3A3D41', 'Light+': '#E5E5E5', 'HC-Dark': '' },
  '--vscode-button-secondaryForeground':        { 'Dark+': '#CCCCCC', 'Light+': '#1F1F1F', 'HC-Dark': '#FFFFFF' },
  '--vscode-button-secondaryHoverBackground':   { 'Dark+': '#45494E', 'Light+': '#DCDCDC', 'HC-Dark': '' },
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
  '--vscode-notifications-background':          { 'Dark+': '#252526', 'Light+': '#F2F2F2', 'HC-Dark': '#000000' },
  '--vscode-notifications-foreground':          { 'Dark+': '#CCCCCC', 'Light+': '#1F1F1F', 'HC-Dark': '#FFFFFF' },
  '--vscode-notifications-border':              { 'Dark+': '#454545', 'Light+': '#DCDCDC', 'HC-Dark': '#6FC3DF' },
  '--vscode-panel-border':                      { 'Dark+': '#252526', 'Light+': '#DCDCDC', 'HC-Dark': '#6FC3DF' },
  '--vscode-editor-lineHighlightBackground':    { 'Dark+': '#262626', 'Light+': '#F0F0F0', 'HC-Dark': '#000000' },
  '--vscode-input-placeholderForeground':       { 'Dark+': '#A6A6A6', 'Light+': '#717171', 'HC-Dark': '#FFFFFF' },
};

// Bright-tier Universal-fallback hexes — mirrors the literal after the
// comma in `var(--vscode-charts-X-bright, #hex)`. Used by BOTH
// (a) the SHAPE guard in Autonomy.a11y.test.ts (locks the hex literal
// against silent future-replacements) AND (b) the per-selector
// contrast loop (locks the math without re-typing per-bucket values).
export const BRIGHT_HEX = {
  red:    '#B91C1C',
  orange: '#B45309',
  green:  '#15803D',
};
