import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';
import { SafetyPanel } from './SafetyPanel';
import { ARTIFACT_TYPE_VARIANTS } from '../types';

// ── Mock vscode API ──────────────────────────────────────────────────────────

const postMessage = vi.fn();
vi.mock('../vscodeApi', () => ({
  vscode: { postMessage: (...args: any[]) => postMessage(...args) },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeCircuit(overrides: Partial<import('./SafetyPanel').SafetyCircuit> = {}): import('./SafetyPanel').SafetyCircuit {
  return {
    workflowId: 'aac-kanban-dev-executor',
    state: 'closed',
    failureCount: 0,
    ...overrides,
  };
}

function fakePolicy(overrides: Partial<import('./SafetyPanel').SafetyPolicy> = {}): import('./SafetyPanel').SafetyPolicy {
  return {
    id: 'required-fields',
    name: 'Required Fields Present',
    description: 'Required fields must have non-empty values',
    type: 'pre-flight',
    severity: 'blocking',
    ...overrides,
  };
}

function dispatchMessage(data: any) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data }));
  });
}

function clickSafety() {
  fireEvent.click(screen.getByRole('button', { name: /Safety/ }));
}

// ── Autonomy.css selector extraction (used by catalog-integrity 9a/9b) ───
//
// Reads Autonomy.css through postcss (a real CSS parser) and walks every
// Rule node to collect the variants of `.safety-block-type--<variant>`
// selectors. Two wins over the previous regex heuristic:
//
//   1. Comments stay where they belong. PostCSS parses `/* ... */` blocks
//      as Comment nodes distinct from Rule nodes, so `.walkRules(rule =>
//      ...)` never sees prose mentions of selector-shaped text. The
//      previous regex fragility against comma-joined comment prose is
//      gone by construction — there is no lookbehind/lookahead to
//      hack around.
//   2. Comma-separated selector lists are split for us. `rule.selectors`
//      returns each comma-separated selector as a trimmed string, so a
//      single rule with five bucket variants in one selector list yields
//      five iteration items instead of one regex match with bad groupings.
//
// The tiny inline regex inside the loop still serves a purpose: postcss
// surfaces raw selector strings like `.safety-block-type--story:hover`
// (compound selectors with pseudo-classes) and we want to extract JUST
// the variant token from the leading class name. The double-dash in
// the pattern guarantees the bare base class `.safety-block-type` (no
// `--variant` suffix) is safely ignored.
//
// The extraction runs ONCE at module load (test files are evaluated
// once per `vitest run`); repeated lookups during 9a/9b hit the cached
// Set without re-parsing the stylesheet.
const AUTONOMY_CSS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  './Autonomy.css',
);
const AUTONOMY_CSS_TEXT = readFileSync(AUTONOMY_CSS_PATH, 'utf-8');
const CSS_VARIANTS_IN_AUTONOMY = new Set<string>();
postcss.parse(AUTONOMY_CSS_TEXT, { from: AUTONOMY_CSS_PATH }).walkRules((rule) => {
  // `rule.selectors` is the comma-split, trimmed array of selector
  // strings (e.g. ['.safety-block-type--story',
  // '.safety-block-type--requirement']). Prose in `/* ... */` blocks
  // is on Comment nodes which this walker naturally skips.
  for (const selector of rule.selectors) {
    const match = selector.match(/^\.safety-block-type--([\w-]+)/);
    if (match) {
      CSS_VARIANTS_IN_AUTONOMY.add(match[1]);
    }
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SafetyPanel', () => {
  beforeEach(() => {
    postMessage.mockClear();
  });

  // ── Initial state ──────────────────────────────────────────────────────

  it('renders the safety button with shield icon', () => {
    render(<SafetyPanel />);
    expect(screen.getByText('🛡')).toBeTruthy();
    expect(screen.getByText('Safety')).toBeTruthy();
  });

  it('requests safety status on mount', () => {
    render(<SafetyPanel />);
    expect(postMessage).toHaveBeenCalledWith({ type: 'getSafetyStatus' });
  });

  it('does not show dropdown initially', () => {
    render(<SafetyPanel />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('button aria-expanded is false initially', () => {
    render(<SafetyPanel />);
    const btn = screen.getByRole('button', { name: /Safety/ });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  // ── Open / close ───────────────────────────────────────────────────────

  it('opens dropdown on button click', () => {
    render(<SafetyPanel />);
    clickSafety();
    expect(screen.getByRole('dialog')).toBeTruthy();
    const btn = screen.getByRole('button', { name: /Safety/ });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('requests safety status when opened', () => {
    render(<SafetyPanel />);
    postMessage.mockClear(); // clear mount request
    clickSafety();
    expect(postMessage).toHaveBeenCalledWith({ type: 'getSafetyStatus' });
  });

  it('closes dropdown on second button click', () => {
    render(<SafetyPanel />);
    clickSafety();
    clickSafety();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape key', () => {
    render(<SafetyPanel />);
    clickSafety();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on click outside', () => {
    render(<SafetyPanel />);
    clickSafety();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // ── Circuit list ───────────────────────────────────────────────────────

  it('shows circuit section header', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({ type: 'safetyStatus', circuits: [], policies: [] });
    expect(screen.getByText('⚡ Circuit Breakers')).toBeTruthy();
  });

  it('shows empty state when no circuits', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({ type: 'safetyStatus', circuits: [], policies: [] });
    expect(screen.getByText(/No circuit breakers active/)).toBeTruthy();
  });

  it('renders closed circuit with correct state', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus',
      circuits: [fakeCircuit({ state: 'closed', failureCount: 2 })],
      policies: [],
    });
    expect(screen.getByText(/Closed/)).toBeTruthy();
    expect(screen.getByText('2 fails')).toBeTruthy();
    expect(screen.getByText('aac-kanban-dev-executor')).toBeTruthy();
  });

  it('renders open circuit with danger styling', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus',
      circuits: [fakeCircuit({
        state: 'open', failureCount: 5,
        lastFailureReason: 'Terminal crashed', openedAt: Date.now(),
      })],
      policies: [],
    });
    expect(screen.getByText(/Open/)).toBeTruthy();
    expect(screen.getByText('5 fails')).toBeTruthy();
    expect(screen.getByText(/Terminal crashed/)).toBeTruthy();
    expect(screen.getByText('↻ Reset')).toBeTruthy();
  });

  it('renders half-open circuit with warning styling', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus',
      circuits: [fakeCircuit({ state: 'half-open', failureCount: 3 })],
      policies: [],
    });
    expect(screen.getByText(/Half-Open/)).toBeTruthy();
  });

  it('does not show reset button for closed circuits', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({ type: 'safetyStatus', circuits: [fakeCircuit({ state: 'closed' })], policies: [] });
    expect(screen.queryByText('↻ Reset')).toBeNull();
  });

  it('reset button posts kanban:safetyResetCircuit message', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus',
      circuits: [fakeCircuit({ state: 'open', workflowId: 'aac-kanban-review-guard' })],
      policies: [],
    });
    fireEvent.click(screen.getByText('↻ Reset'));
    expect(postMessage).toHaveBeenCalledWith({ type: 'kanban:safetyResetCircuit', workflowId: 'aac-kanban-review-guard' });
  });

  // ── Policy list ────────────────────────────────────────────────────────

  it('shows policy section header', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({ type: 'safetyStatus', circuits: [], policies: [] });
    expect(screen.getByText('📋 Policies')).toBeTruthy();
  });

  it('renders blocking policy with BLOCK badge', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({ type: 'safetyStatus', circuits: [], policies: [fakePolicy({ severity: 'blocking' })] });
    expect(screen.getByText('BLOCK')).toBeTruthy();
    expect(screen.getByText('Required Fields Present')).toBeTruthy();
    expect(screen.getByText('Pre-flight')).toBeTruthy();
  });

  it('renders advisory policy with ADVISE badge', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus', circuits: [],
      policies: [fakePolicy({ severity: 'advisory', type: 'post-flight', id: 'no-placeholders', name: 'No Placeholders' })],
    });
    expect(screen.getByText('ADVISE')).toBeTruthy();
    expect(screen.getByText('Post-flight')).toBeTruthy();
  });

  it('shows artifactType scope when present', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({ type: 'safetyStatus', circuits: [], policies: [fakePolicy({ artifactType: 'story' })] });
    expect(screen.getByText('story')).toBeTruthy();
  });

  it('shows policy description', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({ type: 'safetyStatus', circuits: [], policies: [fakePolicy()] });
    expect(screen.getByText('Required fields must have non-empty values')).toBeTruthy();
  });

  // ── Kill switch ────────────────────────────────────────────────────────

  it('shows kill switch button when dropdown is open', () => {
    render(<SafetyPanel />);
    clickSafety();
    expect(screen.getByText(/Kill Switch/)).toBeTruthy();
  });

  it('first kill switch click shows confirmation prompt', () => {
    render(<SafetyPanel />);
    clickSafety();
    fireEvent.click(screen.getByText(/Kill Switch/));
    expect(screen.getByText(/Click again to confirm/)).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'kanban:safetyKillSwitch' }),
    );
  });

  it('second kill switch click posts kill switch message', () => {
    render(<SafetyPanel />);
    clickSafety();
    fireEvent.click(screen.getByText(/Kill Switch/));
    fireEvent.click(screen.getByText(/Click again to confirm/));
    expect(postMessage).toHaveBeenCalledWith({ type: 'kanban:safetyKillSwitch' });
  });

  it('cancel button dismisses confirmation', () => {
    render(<SafetyPanel />);
    clickSafety();
    fireEvent.click(screen.getByText(/Kill Switch/));
    fireEvent.click(screen.getByText('Cancel'));
    // Back to initial kill switch state
    expect(screen.getByText(/Kill Switch/)).toBeTruthy();
    expect(screen.queryByText(/Click again to confirm/)).toBeNull();
  });

  it('safetyKillSwitchAck closes the dropdown', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({ type: 'safetyKillSwitchAck', timestamp: Date.now() });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // ── Badge ──────────────────────────────────────────────────────────────

  it('shows open circuit count badge when circuits are open', () => {
    render(<SafetyPanel />);
    dispatchMessage({
      type: 'safetyStatus',
      circuits: [
        fakeCircuit({ state: 'open', workflowId: 'wf-1' }),
        fakeCircuit({ state: 'open', workflowId: 'wf-2' }),
        fakeCircuit({ state: 'closed', workflowId: 'wf-3' }),
      ],
      policies: [],
    });
    // Badge is on the button (visible even when dropdown is closed)
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('does not show badge when no circuits are open', () => {
    render(<SafetyPanel />);
    dispatchMessage({ type: 'safetyStatus', circuits: [fakeCircuit({ state: 'closed' })], policies: [] });
    const badge = document.querySelector('.safety-panel-badge');
    expect(badge).toBeNull();
  });

  // ── Recent Blocks (blocked by policy X) ────────────────────────────────

  function fakeBlock(overrides: Partial<import('./SafetyPanel').SafetyBlock> = {}): import('./SafetyPanel').SafetyBlock {
    // Default artifactType to 'story' to match the 'S-1' id-space convention
    // used everywhere in this test file. Tests that want to exercise the
    // type-aware key disambiguation OR the "type absent" rendering path
    // override this explicitly.
    return {
      artifactId: 'S-1',
      artifactType: 'story',
      policyId: 'required-fields',
      failures: ['Story must have a title'],
      timestamp: Date.now(),
      ...overrides,
    };
  }

  it('shows Blocked-by-Policy section when recentBlocks is non-empty', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus',
      circuits: [],
      policies: [],
      recentBlocks: [fakeBlock()],
    });
    expect(screen.getByText(/Blocked by Policy/)).toBeTruthy();
  });

  it('does not show Blocked-by-Policy section when recentBlocks is empty', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({ type: 'safetyStatus', circuits: [], policies: [], recentBlocks: [] });
    expect(screen.queryByText(/Blocked by Policy/)).toBeNull();
  });

  it('renders artifactId, policyId, and failures for each block', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus',
      circuits: [],
      policies: [],
      recentBlocks: [fakeBlock({
        artifactId: 'S-42',
        policyId: 'schema-conformance',
        failures: ['Missing type field', 'Invalid status'],
      })],
    });
    expect(screen.getByText('S-42')).toBeTruthy();
    expect(screen.getByText('blocked by')).toBeTruthy();
    expect(screen.getByText('schema-conformance')).toBeTruthy();
    expect(screen.getByText(/Missing type field; Invalid status/)).toBeTruthy();
  });

  it('omits the colon reason when failures array is empty', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus', circuits: [], policies: [],
      recentBlocks: [fakeBlock({ failures: [] })],
    });
    expect(screen.queryByText(/^:/)).toBeNull();
  });

  it('renders multiple block entries when several recent', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus', circuits: [], policies: [],
      recentBlocks: [
        fakeBlock({ artifactId: 'S-1', policyId: 'required-fields' }),
        fakeBlock({ artifactId: 'S-2', policyId: 'schema-conformance' }),
        fakeBlock({ artifactId: 'S-3', policyId: 'no-placeholders' }),
      ],
    });
    expect(screen.getByText('S-1')).toBeTruthy();
    expect(screen.getByText('S-2')).toBeTruthy();
    expect(screen.getByText('S-3')).toBeTruthy();
    expect(screen.getByText('3 recent')).toBeTruthy();
  });

  // ── Per-entry dismiss button ───────────────────────────────────────────

  it('renders a ✕ dismiss button per block entry', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus', circuits: [], policies: [],
      recentBlocks: [fakeBlock()],
    });
    expect(screen.getByLabelText(/Dismiss block entry for S-1 \/ required-fields/)).toBeTruthy();
  });

  it('per-entry dismiss button posts kanban:safetyDismissBlock with artifactId, policyId, and timestamp', () => {
    render(<SafetyPanel />);
    clickSafety();
    const ts = Date.now();
    dispatchMessage({
      type: 'safetyStatus', circuits: [], policies: [],
      recentBlocks: [fakeBlock({ artifactId: 'S-A1', policyId: 'required-fields', timestamp: ts })],
    });
    postMessage.mockClear();
    fireEvent.click(screen.getByLabelText(/Dismiss block entry for S-A1 \/ required-fields/));
    expect(postMessage).toHaveBeenCalledWith({
      type: 'kanban:safetyDismissBlock',
      artifactId: 'S-A1',
      policyId: 'required-fields',
      timestamp: ts,
    });
  });

  it('aria-label includes artifactId and policyId for accessibility', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus', circuits: [], policies: [],
      recentBlocks: [fakeBlock({ artifactId: 'S-XYZ', policyId: 'token-budget' })],
    });
    expect(screen.getByLabelText('Dismiss block entry for S-XYZ / token-budget')).toBeTruthy();
  });

  // ── Clear All link ────────────────────────────────────────────────────

  it('renders a Clear all link in the section header when there are blocks', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus', circuits: [], policies: [],
      recentBlocks: [fakeBlock()],
    });
    expect(screen.getByText('Clear all')).toBeTruthy();
  });

  it('Clear all link posts kanban:safetyClearAllBlocks message', () => {
    render(<SafetyPanel />);
    clickSafety();
    dispatchMessage({
      type: 'safetyStatus', circuits: [], policies: [],
      recentBlocks: [fakeBlock(), fakeBlock({ artifactId: 'S-2' })],
    });
    postMessage.mockClear();
    fireEvent.click(screen.getByText('Clear all'));
    expect(postMessage).toHaveBeenCalledWith({ type: 'kanban:safetyClearAllBlocks' });
  });

// ════════════════════════════════════════════════════════════════════════
//  ARTIFACT_TYPE_VARIANTS — catalog integrity
// ════════════════════════════════════════════════════════════════════════
//
// Top-level integrity guard for the BMAD catalogue keyset exported from
// `../types.ts`. Conceptually distinct from "Recent Blocks rendering"
// (which tests per-block DOM contracts); this block tests the catalogue
// itself — the canonical list of every artifactType variant the panel
// recognises.
//
// Without this guard, a silent DELETION from ARTIFACT_TYPE_VARIANTS
// would simply shrink the parameterized loop in `Recent Blocks —
// artifactType surfacing` without surfacing a regression (the loop
// iterates `Object.keys(...)` at runtime, so a pruned keyset just
// produces fewer test assertions). The hardcoded REQUIRED_BMAD_KEYS
// list below pins every entry EXPLICITLY so any required-key
// deletion triggers a clear test failure with a triage-friendly
// message pointing at the missing key.
//
// List maintenance contract: REQUIRED_BMAD_KEYS is EXHAUSTIVE —
// it mirrors every entry in ARTIFACT_TYPE_VARIANTS (canonical home
// in `webview-ui/src/types.ts`). Adding a new variant to the const
// Record is a two-line edit (one in types.ts, one here); removing a
// variant is two deletion lines but is INTENTIONALLY blocking here
// so accidental regressions are caught loudly.
describe('ARTIFACT_TYPE_VARIANTS — catalog integrity', () => {
  // Canonical 50-entry list, ordered to mirror the const Record
  // bucket order in `../types.ts` so a side-by-side diff
  // surfaces obvious misalignment. Keep this list in sync with
  // `src/state/schema-validator.ts` `ARTIFACT_TYPE_TO_SCHEMA`
  // and the `BmadArtifactTypeMap` kebab-case canonical forms.
  const REQUIRED_BMAD_KEYS = [
    // ── Stories / work breakdown (blue bucket) ─────────────────
    'story', 'task', 'requirement', 'use-case', 'use-cases',
    'additional-req', 'nfr-assessment',
    // ── Planning / strategy (purple bucket) ───────────────
    'epic', 'epics', 'vision', 'prd', 'product-brief',
    'project-overview', 'project-context', 'requirements',
    'readiness-report', 'fit-criteria', 'success-metrics',
    // ── Architecture / system (indigo bucket) ───────────────
    'architecture', 'tech-spec', 'change-proposal', 'retrospective',
    'code-review', 'source-tree',
    // ── Test / verification (yellow bucket) ─────────────────────
    'test-case', 'test-cases', 'test-strategy', 'test-design',
    'test-design-qa', 'test-design-architecture', 'test-summary',
    'test-coverage', 'test-review', 'atdd-checklist',
    'traceability-matrix', 'test-framework', 'ci-pipeline',
    'automation-summary', 'epic-test-strategy',
    // ── Risk / quality gate (red bucket) ─────────────────
    'risk', 'risks', 'definition-of-done',
    // ── Operational / sprint tracking (cyan bucket) ───────────────
    'sprint-status', 'sprint',
    // ── Design / CIS module (pink bucket) ───────────────────
    'ux-design', 'design-thinking', 'storytelling',
    'problem-solving', 'innovation-strategy',
    // ── Research ───────────────────
    'research',
  ] as const;

  it('7a) every REQUIRED_BMAD_KEYS entry is present in ARTIFACT_TYPE_VARIANTS (pin the catalogue against deletions)', () => {
    for (const k of REQUIRED_BMAD_KEYS) {
      expect(
        ARTIFACT_TYPE_VARIANTS,
        `Required BMAD key "${k}" is missing from ARTIFACT_TYPE_VARIANTS — was it intentionally deleted? If so, remove it from REQUIRED_BMAD_KEYS in this test as well.`,
      ).toHaveProperty(k);
    }
  });

  it('7b) REQUIRED_BMAD_KEYS length matches ARTIFACT_TYPE_VARIANTS length (no orphan additions, no hidden deletions)', () => {
    // This is the second half of the integrity guard: not only must
    // every required key exist, the catalogue must also be EXACTLY
    // the right size. An orphan addition (a new entry pushed into
    // the const Record but missing from REQUIRED) surfaces here as
    // a length mismatch with a clear "you added a variant but did
    // not pin it in the test" signal. A wholesale deletion would
    // already fail 7a above via per-key toHaveProperty assertions.
    expect(Object.keys(ARTIFACT_TYPE_VARIANTS).length).toBe(
      REQUIRED_BMAD_KEYS.length,
    );
  });
  // INTENTIONAL NARROWING (locked). The 48-key `ArtifactType` discriminated
  // union contains three values that are deliberately EXCLUDED from the
  // curated `ARTIFACT_TYPE_VARIANTS` Record above (`architecture-decision`,
  // `nfr`, `system-component`). Each excluded value has no corresponding
  // `.safety-block-type--<variant>` rule in `Autonomy.css` because they
  // were intentionally skipped when the chip-colour palette was curated
  // to the 7 buckets (blue/green/purple/indigo/yellow/red/cyan/pink).
  // Adding any of these keys to the const Record without also adding the
  // matching CSS rule + WCAG AA cross-theme contrast validation would
  // silently regress a11y on the chip badge variant set (see the
  // `scripts/a11y-surface-sweep.mjs` cluster-D audit matrices). The
  // runtime fallback at the chip-class lookup site in `SafetyPanel.tsx >
  // artifactTypeClass` first lowercases input, then does an `in` check;
  // unmapped types return `undefined` and the JSX renders the bare
  // base-class `.safety-block-type` chip with NO `--variant` modifier,
  // preserving the text payload verbatim. The case-insensitive
  // `toLowerCase()` matters: `Architecture-Decision` (capitalised) also
  // falls through this path even if a contributor thinks they added
  // matching strict-equality support.
  //
  // Triple-locking for any future widening:
  //   1. drop the corresponding string from EXCLUDED_FROM_ARTIFACT_TYPE_VARIANTS,
  //   2. update the INTENTIONAL NARROWING JSDoc block on
  //      ARTIFACT_TYPE_VARIANTS in `webview-ui/src/types.ts`,
  //   3. add a `.safety-block-type--<variant>` rule in `Autonomy.css`
  //      with `var(--vscode-charts-X, #fb)` token + WCAG validation,
  //   4. add the new key to REQUIRED_BMAD_KEYS in this file in the
  //      appropriate bucket order.
  // Skipping any of the four steps trips an integrity invariant loudly
  // with an attribution message naming all required steps.
  const EXCLUDED_FROM_ARTIFACT_TYPE_VARIANTS = [
    'architecture-decision',
    'nfr',
    'system-component',
  ] as const;

  it('7c_a) EXCLUDED_FROM_ARTIFACT_TYPE_VARIANTS is non-empty — empty-pass guard', () => {
    // Silent empty-pass guard: an accidentally emptied exclusion list
    // (e.g. a maintainer mid-widening) would otherwise let every loop in
    // 7c_b run zero times. Fails loudly to point at the JSDoc.
    expect(
      EXCLUDED_FROM_ARTIFACT_TYPE_VARIANTS.length,
      'EXCLUDED_FROM_ARTIFACT_TYPE_VARIANTS is empty. To widen the catalogue, see the JSDoc on ARTIFACT_TYPE_VARIANTS in webview-ui/src/types.ts (step 1 says: drop the corresponding string from this list).',
    ).toBeGreaterThan(0);
  });

  it('7c_b) INTENTIONAL NARROWING: the three valid ArtifactType values below are locked as EXCLUDED from ARTIFACT_TYPE_VARIANTS', () => {
    // Single bulk check: no const-Record key is in the hardcoded
    // exclusion list. Catches the "re-added by accident" failure mode
    // with one assertion that produces a single attribution message
    // naming every leaked key.
    const recordKeys = Object.keys(ARTIFACT_TYPE_VARIANTS);
    const leakedKeys = recordKeys.filter(
      k => (EXCLUDED_FROM_ARTIFACT_TYPE_VARIANTS as readonly string[]).includes(k),
    );
    expect(
      leakedKeys,
      leakedKeys.length === 0
        ? 'OK \u2014 no excluded key leaked into ARTIFACT_TYPE_VARIANTS.'
        : `Found ${leakedKeys.length} excluded key(s) re-added to ARTIFACT_TYPE_VARIANTS: ${leakedKeys.join(', ')}. To widen: drop each leaked key from EXCLUDED_FROM_ARTIFACT_TYPE_VARIANTS in 7c (step 1), AND update the INTENTIONAL NARROWING JSDoc block in webview-ui/src/types.ts (step 2), AND add the matching .safety-block-type--<variant> rule in Autonomy.css (step 3), AND add each leaked key to REQUIRED_BMAD_KEYS in the corresponding bucket (step 4).`,
    ).toEqual([]);

    // Per-key attribution message: each excluded value gets an explicit
    // `not.toHaveProperty` assertion. If the const Record contains the
    // key, vitest's failure message points at the offender directly.
    for (const k of EXCLUDED_FROM_ARTIFACT_TYPE_VARIANTS) {
      expect(ARTIFACT_TYPE_VARIANTS)
        .not.toHaveProperty(k);
    }
  });

  // ─────────── CSS bucket parity (Q7 of the previous review round) ───────────
  //
  // Closes the regression gap where the JS-side keyset and the CSS-side
  // bucket selectors could drift out of sync. If a variant exists in the
  // const Record but has no `.safety-block-type--<variant>` rule in
  // Autonomy.css, the chip renders with base styling only — silently
  // losing its color tint. If a CSS rule exists for a variant the
  // const Record no longer recognises, it is dead CSS and bloats the
  // bundle. Both directions are caught here.
  //
  // Tests below use `CSS_VARIANTS_IN_AUTONOMY`, populated at module
  // load through postcss's walkRules (see the extraction comment above
  // for the rationale and the elimination of the previous regex
  // fragility against comma-joined comment prose).
  it('9a) every ARTIFACT_TYPE_VARIANTS key has a corresponding `.safety-block-type--<key>` selector in Autonomy.css', () => {
    for (const k of Object.keys(ARTIFACT_TYPE_VARIANTS)) {
      expect(
        CSS_VARIANTS_IN_AUTONOMY.has(k),
        `Const Record has key "${k}" but no .safety-block-type--${k} rule in Autonomy.css — chip will render with no color tint. Add a CSS rule for ${k} (or remove the key from the const Record if unintended).`,
      ).toBe(true);
    }
  });

  it('9b) every `.safety-block-type--<variant>` selector in Autonomy.css has a matching ARTIFACT_TYPE_VARIANTS entry (no orphan rules)', () => {
    const declaredKeys = new Set(Object.keys(ARTIFACT_TYPE_VARIANTS));
    const orphanSelectors = [...CSS_VARIANTS_IN_AUTONOMY].filter(
      sel => !declaredKeys.has(sel),
    );
    // Selectors must be rendered with the full prefix so the failure
    // message accurately points the operator at the offending rule(s).
    // The capture group in the regex is the bare variant name (no
    // `.safety-block-type--` prefix), so we re-attach it per-item
    // rather than naively `join`-ing onto a single bare prefix
    // (which would only prefix the second-and-later elements).
    const orphanRuleList = orphanSelectors
      .map(s => `.safety-block-type--${s}`)
      .join(', ');
    expect(
      orphanSelectors,
      `Found orphan CSS selector(s) ${orphanRuleList} in Autonomy.css with no matching ARTIFACT_TYPE_VARIANTS entry. Either add the variant to the const Record (and to REQUIRED_BMAD_KEYS) or delete the CSS rule.`,
    ).toEqual([]);
  });

  // Fast-triage cardinality check: cheaper than the per-key loops in
  // 9a/9b when the failure mode is a wholesale drift (e.g. someone
  // forked the file and removed a whole bucket). The actual subset
  // relationships are enforced by 9a + 9b; this is defense-in-depth
  // with a cheaper diagnostic signal for obvious breaks.
  it('9c) declared keyset and CSS bucket set have identical cardinality', () => {
    expect(CSS_VARIANTS_IN_AUTONOMY.size).toBe(
      Object.keys(ARTIFACT_TYPE_VARIANTS).length,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════
//  Recent Blocks — dedicated rendering coverage
// ════════════════════════════════════════════════════════════════════════
//
// Organised along the four dimensions the user explicitly asked for:
//   1. Empty list — section is hidden, no list DOM
//   2. Single entry — exactly one .safety-block, exact text content
//   3. Multiple entries — exactly N .safety-block nodes, array order
//   4. Failures formatting — single / multiple / empty / very-long
//
// These build on the per-feature tests above but assert the WIRE shape
// (DOM count, text content, ordering) rather than behaviour (clicks).
describe('Recent Blocks — rendering', () => {
    // ── 1. Empty list ─────────────────────────────────────────────────────
    it('1) hides the section DOM entirely when recentBlocks is empty', () => {
      render(<SafetyPanel />);
      clickSafety();
      // Dispatch a realistic mixed payload: non-empty circuits AND policies
      // alongside an EMPTY recentBlocks. Proves the test is scoped to the
      // recentBlocks section specifically — other sections still render
      // their own `.safety-section-meta` spans.
      dispatchMessage({
        type: 'safetyStatus',
        circuits: [
          fakeCircuit({ state: 'open', workflowId: 'wf-A' }),
          fakeCircuit({ state: 'closed', workflowId: 'wf-B' }),
        ],
        policies: [
          fakePolicy({ id: 'required-fields' }),
          fakePolicy({ id: 'no-placeholders' }),
          fakePolicy({ id: 'schema-conformance' }),
        ],
        recentBlocks: [],
      });
      // No "Blocked by Policy" section header
      expect(screen.queryByText(/Blocked by Policy/)).toBeNull();
      // No list container
      expect(document.querySelector('.safety-blocks-list')).toBeNull();
      // No block rows
      expect(document.querySelectorAll('.safety-block').length).toBe(0);
      // No "X recent" count badge — matches the exact rendering pattern
      // `<count> recent` produced by the panel (no other UI matches this).
      expect(screen.queryByText(/^\d+ recent$/)).toBeNull();
      // Other sections ARE still rendered (proves the assertion is scoped
      // — the absence is genuinely recentBlocks-driven, not driven by an
      // empty overall payload).
      expect(screen.getByText(/\d+ open · \d+ total/)).toBeTruthy();
      expect(screen.getByText('3 total')).toBeTruthy();
    });

    // ── 2. Single entry ───────────────────────────────────────────────────
    it('2) renders exactly one .safety-block row for a single entry', () => {
      render(<SafetyPanel />);
      clickSafety();
      const ts = 1_700_000_000_000;
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({
          artifactId: 'S-SOLO',
          policyId: 'required-fields',
          failures: ['Story must have a title'],
          timestamp: ts,
        })],
      });
      expect(document.querySelectorAll('.safety-block').length).toBe(1);
      // Header count renders singular "recent" (no plural "s") — same word
      // either way, so verify the exact text "1 recent".
      expect(screen.getByText('1 recent')).toBeTruthy();
      // All four core elements are present
      expect(screen.getByText('S-SOLO')).toBeTruthy();
      expect(screen.getByText('blocked by')).toBeTruthy();
      expect(screen.getByText('required-fields')).toBeTruthy();
      expect(screen.getByText(': Story must have a title')).toBeTruthy();
    });

    // ── 3. Multiple entries ───────────────────────────────────────────────
    it('3) renders exactly N .safety-block rows in array order for multiple entries', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [
          fakeBlock({ artifactId: 'S-A', policyId: 'required-fields' }),
          fakeBlock({ artifactId: 'S-B', policyId: 'schema-conformance' }),
          fakeBlock({ artifactId: 'S-C', policyId: 'no-placeholders' }),
          fakeBlock({ artifactId: 'S-D', policyId: 'token-budget' }),
        ],
      });
      // Exactly 4 block rows
      const rows = document.querySelectorAll('.safety-block');
      expect(rows.length).toBe(4);
      // Array order preserved — each artifact appears in its expected DOM index
      const artifactCells = Array.from(rows).map(
        r => r.querySelector('.safety-block-artifact')?.textContent,
      );
      expect(artifactCells).toEqual(['S-A', 'S-B', 'S-C', 'S-D']);
      // Count meta shows "4 recent"
      expect(screen.getByText('4 recent')).toBeTruthy();
    });

    // ── 4. Failures formatting ────────────────────────────────────────────
    it('4a) single failure renders as ": <reason>"', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ failures: ['No title provided'] })],
      });
      expect(screen.getByText(': No title provided')).toBeTruthy();
    });

    it('4b) multiple failures are joined with "; " separator', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ failures: ['Missing type field', 'Invalid status', 'Empty title'] })],
      });
      expect(screen.getByText(': Missing type field; Invalid status; Empty title')).toBeTruthy();
      // The full joined string is also set as the title attribute for hover preview
      const reasonEl = document.querySelector('.safety-block-reason');
      expect(reasonEl?.getAttribute('title')).toBe('Missing type field; Invalid status; Empty title');
    });

    it('4c) empty failures array omits the ": " prefix entirely', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ failures: [] })],
      });
      // No `.safety-block-reason` element should be rendered when failures is empty
      expect(document.querySelector('.safety-block-reason')).toBeNull();
      // And nothing in the row should start with ":"
      const rows = document.querySelectorAll('.safety-block');
      rows.forEach(row => {
        expect(row.textContent?.startsWith(':')).toBe(false);
      });
    });

    // ── Bonus: React-key disambiguation via timestamp ────────────────────
    //
    // The component builds React keys as
    //   `${artifactId}-${policyId}-${timestamp}`
    // Two real-world buffer pushes with the same (artifactId, policyId)
    // but distinct Date.now() values (e.g. NEEDS_FIXES re-evaluation
    // saving the same violation twice) MUST render as two separate rows
    // or React will warn about duplicate keys. This test exercises that
    // contract explicitly.
    it('5) duplicate (artifactId, policyId) tuples with distinct timestamps render as separate rows', () => {
      render(<SafetyPanel />);
      clickSafety();
      const ts1 = 1_700_000_000_000;
      const ts2 = ts1 + 5; // 5ms later — clearly different timestamp
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [
          fakeBlock({
            artifactId: 'S-DUP', policyId: 'required-fields',
            failures: ['first attempt'], timestamp: ts1,
          }),
          fakeBlock({
            artifactId: 'S-DUP', policyId: 'required-fields',
            failures: ['second attempt'], timestamp: ts2,
          }),
        ],
      });
      // Two DOM rows despite identical (artifactId, policyId)
      const rows = document.querySelectorAll('.safety-block');
      expect(rows.length).toBe(2);
      // Each row shows its own failure message — proves React didn't
      // collapse them into a single row from duplicate-key matching.
      expect(screen.getByText(': first attempt')).toBeTruthy();
      expect(screen.getByText(': second attempt')).toBeTruthy();
      // Row count meta reflects both entries.
      expect(screen.getByText('2 recent')).toBeTruthy();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  //  artifactType surfacing + type-aware key disambiguation
  // ════════════════════════════════════════════════════════════════════════
  //
  // The IPC payload carries artifactType (captured by the tracker from
  // the harness `findings` event). The webview renders it next to the
  // artifactId AND includes it in the React key, so two entries that
  // share an artifactId across different types (e.g. an epic and a
  // story both named "artifact_001") remain distinct rows instead of
  // triggering React's duplicate-key warning + DOM collapse.
  describe('Recent Blocks — artifactType surfacing', () => {
    it('6a) renders .safety-block-type badge when artifactType is present', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'S-T', artifactType: 'story' })],
      });
      const badge = document.querySelector('.safety-block-type');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('story');
      expect(badge?.getAttribute('title')).toBe('Artifact type: story');
    });

    it('6b) renders different artifactType labels for different types', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [
          fakeBlock({ artifactId: 'E-1', artifactType: 'epic' }),
          fakeBlock({ artifactId: 'S-2', artifactType: 'story' }),
        ],
      });
      expect(screen.getByText('epic')).toBeTruthy();
      expect(screen.getByText('story')).toBeTruthy();
    });

    it('6b1) applies --story modifier class when artifactType is "story"', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'S-S', artifactType: 'story' })],
      });
      const chip = document.querySelector('.safety-block-type');
      expect(chip).not.toBeNull();
      expect(chip?.className).toContain('safety-block-type--story');
    });

    it('6b2) applies --epic modifier class when artifactType is "epic"', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'E-E', artifactType: 'epic' })],
      });
      const chip = document.querySelector('.safety-block-type');
      expect(chip?.className).toContain('safety-block-type--epic');
    });

    it('6b3) applies --task modifier class when artifactType is "task"', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'T-T', artifactType: 'task' })],
      });
      const chip = document.querySelector('.safety-block-type');
      expect(chip?.className).toContain('safety-block-type--task');
    });

    it('6b4) unrecognised artifactType renders with base class only (no --unknown modifier — surfaces as TS-typed absence)', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'X-X', artifactType: 'document' })],
      });
      const chip = document.querySelector('.safety-block-type');
      // Per the "unknown types surface as a TS compile-time error" contract,
      // the helper returns `undefined` for unmapped types and the chip
      // renders with ONLY the base `.safety-block-type` class — there is
      // intentionally NO `safety-block-type--unknown` class in either
      // JSX output or the stylesheet. Cross-version extension payloads
      // therefore surface an unstyled-but-legible chip rather than
      // silently emitting an unauthorised CSS class.
      expect(chip).not.toBeNull();
      expect(chip?.classList.contains('safety-block-type')).toBe(true);
      expect(chip?.className).not.toMatch(/safety-block-type--/);
      // Text content is preserved verbatim — typing monotonic, we
      // don't drop cross-version data.
      expect(chip?.textContent).toBe('document');
    });

    it('6b5) artifactType matching is case-insensitive (uppercase input → mapped variant)', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'S-CASE', artifactType: 'STORY' })],
      });
      const chip = document.querySelector('.safety-block-type');
      // Uppercase input still resolves to the story variant
      expect(chip?.className).toContain('safety-block-type--story');
      expect(chip?.textContent).toBe('STORY'); // text preserved verbatim
    });

    it('6b6) base .safety-block-type class is preserved alongside the variant modifier', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'S-BASE', artifactType: 'story' })],
      });
      const chip = document.querySelector('.safety-block-type');
      // Both classes present — base for shared chip styling, modifier for color
      expect(chip?.classList.contains('safety-block-type')).toBe(true);
      expect(chip?.classList.contains('safety-block-type--story')).toBe(true);
    });

    it('6b7) cross-type dispatch yields distinct visual modifier classes per row', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [
          fakeBlock({ artifactId: 'E-1', artifactType: 'epic' }),
          fakeBlock({ artifactId: 'S-2', artifactType: 'story' }),
          fakeBlock({ artifactId: 'T-3', artifactType: 'task' }),
        ],
      });
      const chips = document.querySelectorAll('.safety-block-type');
      expect(chips.length).toBe(3);
      const modifierClasses = Array.from(chips).map(c => {
        const match = c.className.match(/safety-block-type--(\w+)/);
        return match ? match[1] : null;
      });
      // Each row gets the right variant
      expect(modifierClasses).toEqual(['epic', 'story', 'task']);
    });

    it('6c) omits .safety-block-type badge when artifactType is absent', () => {
      render(<SafetyPanel />);
      clickSafety();
      // Explicitly undefined → simulates a payload from an older extension
      // that doesn't capture artifactType.
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactType: undefined })],
      });
      expect(document.querySelector('.safety-block-type')).toBeNull();
    });

    it('6d) React key includes artifactType to prevent cross-type key collision', () => {
      render(<SafetyPanel />);
      clickSafety();
      // Pathological scenario: an epic and a story share the same id
      // (e.g. legacy import artifact_001 reproduced across types) AND
      // collide on policyId + timestamp. With artifactType in the key,
      // both render as distinct rows.
      const ts = 1_700_000_000_000;
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [
          fakeBlock({
            artifactId: 'artifact_001', artifactType: 'epic',
            policyId: 'required-fields', failures: ['No title'], timestamp: ts,
          }),
          fakeBlock({
            artifactId: 'artifact_001', artifactType: 'story',
            policyId: 'required-fields', failures: ['No type'], timestamp: ts,
          }),
        ],
      });
      const rows = document.querySelectorAll('.safety-block');
      expect(rows.length).toBe(2);
      // Different type labels visible — proves neither row was collapsed
      // and the React keys were distinct (otherwise React would warn
      // and the second entry would clobber the first).
      expect(screen.getByText('epic')).toBeTruthy();
      expect(screen.getByText('story')).toBeTruthy();
      expect(screen.getByText(': No title')).toBeTruthy();
      expect(screen.getByText(': No type')).toBeTruthy();
      expect(screen.getByText('2 recent')).toBeTruthy();
    });

    it('6e) dismissed button still posts kanban:safetyDismissBlock when artifactType is present', () => {
      // Regression guard: the React key change must NOT alter the
      // dismiss IPC payload (which already carries artifactId +
      // policyId + timestamp).
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({
          artifactId: 'S-D', artifactType: 'story', policyId: 'required-fields',
          timestamp: 1_700_000_000_000,
        })],
      });
      postMessage.mockClear();
      fireEvent.click(screen.getByLabelText(/Dismiss block entry for S-D \/ required-fields/));
      expect(postMessage).toHaveBeenCalledWith({
        type: 'kanban:safetyDismissBlock',
        artifactId: 'S-D',
        policyId: 'required-fields',
        timestamp: 1_700_000_000_000,
      });
      // artifactType is intentionally NOT sent in the dismiss request —
      // the timestamp disambiguates, and the tracker does the match.
    });

    // ── BMAD catalogue coverage (post-`as const` exhaustive keyset) ──
    //
    // These tests pin the new types added to ARTIFACT_TYPE_VARIANTS so
    // the chip palette stays exhaustive against the BMAD schema catalogue
    // (see `src/state/schema-validator.ts` `ARTIFACT_TYPE_TO_SCHEMA`).
    // Each test asserts BOTH that the modified modifier class is
    // present AND that the text is preserved verbatim.
    it('6f) test-case renders with safety-block-type--test-case (yellow bucket)', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'TC-1', artifactType: 'test-case' })],
      });
      const chip = document.querySelector('.safety-block-type');
      expect(chip?.className).toContain('safety-block-type--test-case');
      expect(chip?.textContent).toBe('test-case');
    });

    it('6g) change-proposal renders with safety-block-type--change-proposal (indigo bucket)', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'CP-1', artifactType: 'change-proposal' })],
      });
      const chip = document.querySelector('.safety-block-type');
      expect(chip?.className).toContain('safety-block-type--change-proposal');
      expect(chip?.textContent).toBe('change-proposal');
    });

    it('6h) vision renders with safety-block-type--vision (purple planning bucket)', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'V-1', artifactType: 'vision' })],
      });
      const chip = document.querySelector('.safety-block-type');
      expect(chip?.className).toContain('safety-block-type--vision');
      expect(chip?.textContent).toBe('vision');
    });

    it('6i) ux-design renders with safety-block-type--ux-design (pink design bucket)', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'UX-1', artifactType: 'ux-design' })],
      });
      const chip = document.querySelector('.safety-block-type');
      expect(chip?.className).toContain('safety-block-type--ux-design');
      expect(chip?.textContent).toBe('ux-design');
    });

    it('6j) risk renders with safety-block-type--risk (red bucket)', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'R-1', artifactType: 'risk' })],
      });
      const chip = document.querySelector('.safety-block-type');
      expect(chip?.className).toContain('safety-block-type--risk');
      expect(chip?.textContent).toBe('risk');
    });

    it('6k) sprint-status renders with safety-block-type--sprint-status (cyan ops bucket)', () => {
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [fakeBlock({ artifactId: 'SP-1', artifactType: 'sprint-status' })],
      });
      const chip = document.querySelector('.safety-block-type');
      expect(chip?.className).toContain('safety-block-type--sprint-status');
      expect(chip?.textContent).toBe('sprint-status');
    });

    // ── Parameterized regression coverage ──
    //
    // Iterates the *exported* ARTIFACT_TYPE_VARIANTS keyset so a
    // silent deletion from the keyset (e.g. someone removes
    // `'architecture'` while refactoring) surfaces here immediately,
    // rather than only when a user happens to dispatch that
    // artifactType. Combined with the per-bucket sampler tests
    // above, the panel is exercised against every entry in the
    // canonical catalogue on every test run. Camel-case and
    // kebab-case keys are both covered because the membership check
    // lowercases input, so the test passes the canonical form and
    // confirms the rendered className suffix matches regardless of
    // shape.
    describe('parameterized: every ARTIFACT_TYPE_VARIANTS entry renders with the right modifier class', () => {
      for (const variant of Object.keys(ARTIFACT_TYPE_VARIANTS) as Array<keyof typeof ARTIFACT_TYPE_VARIANTS>) {
        it(`6m) artifactType="${variant}" → safety-block-type--${variant} modifier is present`, () => {
          render(<SafetyPanel />);
          clickSafety();
          dispatchMessage({
            type: 'safetyStatus', circuits: [], policies: [],
            recentBlocks: [fakeBlock({
              artifactId: `ART-${variant}`,
              artifactType: variant,
            })],
          });
          const chip = document.querySelector('.safety-block-type');
          expect(chip).not.toBeNull();
          // Both the base class AND the variant modifier must be present
          // (matches `variant ? 'safety-block-type safety-block-type--${variant}' : 'safety-block-type'`)
          expect(chip?.classList.contains('safety-block-type')).toBe(true);
          expect(chip?.classList.contains(`safety-block-type--${variant}`)).toBe(true);
          // No `--unknown` sentinel ever appears
          expect(chip?.className).not.toMatch(/safety-block-type--unknown/);
          // Text preserved verbatim — including hyphens and casing
          expect(chip?.textContent).toBe(variant);
          // Title attribute carries the canonical tag for hover-preview
          expect(chip?.getAttribute('title')).toBe(`Artifact type: ${variant}`);
        });
      }
    });

    it('6l) case-insensitive lookup works for multi-word kebab-case types', () => {
      // Locks the case-insensitive contract for kebab-case entries that
      // differ from camelCase (e.g. nfr-assessment, fit-criteria, ci-pipeline).
      // Mixed-case input lowercases and resolves to the canonical
      // kebab-case form during the `in`-operator membership check.
      render(<SafetyPanel />);
      clickSafety();
      dispatchMessage({
        type: 'safetyStatus', circuits: [], policies: [],
        recentBlocks: [
          fakeBlock({ artifactId: 'TC-2', artifactType: 'NFR-ASSESSMENT' }),
          fakeBlock({ artifactId: 'TC-3', artifactType: 'CI-PIPELINE' }),
          fakeBlock({ artifactId: 'TC-4', artifactType: 'Product-Brief' }),
        ],
      });
      const chips = document.querySelectorAll('.safety-block-type');
      expect(chips.length).toBe(3);
      const variants = Array.from(chips).map(c => {
        const m = c.className.match(/safety-block-type--([\w-]+)/);
        return m ? m[1] : null;
      });
      // Each resolves to the canonical lowercase kebab-case form
      expect(variants).toEqual(['nfr-assessment', 'ci-pipeline', 'product-brief']);
      // Text content preserved verbatim (uppercase input → uppercase display)
      const texts = Array.from(chips).map(c => c.textContent);
      expect(texts).toEqual(['NFR-ASSESSMENT', 'CI-PIPELINE', 'Product-Brief']);
    });
  });
});
