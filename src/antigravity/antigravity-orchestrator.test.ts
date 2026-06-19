/**
 * Regression guard for PONYTAIL_HEURISTICS injection into
 * antigravity-orchestrator's buildGuideContent.
 *
 * Contract being locked:
 *  - autonomous mode renders the verbal heuristic in the guide
 *  - default mode renders the verbal heuristic in the guide
 *  - interactive mode does NOT render the heuristic (halting is its task;
 *    injecting "is this necessary?" framing would push toward producing)
 *  - the verbatim PONYTAIL_HEURISTICS constant appears inline in
 *    autonomous + default output
 *  - all six hierarchy items render verbatim in autonomous + default
 *  - the existing BMAD framing (execution block, persona placeholder,
 *    grounding rule, workflow sections) still renders in all three modes
 *  - the conditional gate correctly reflects resolveExecutionMode
 *    (hints interactive=true -> interactive, autonomous=true -> autonomous,
 *    undefined -> default)
 */

import { describe, expect, it, vi } from 'vitest';

// Stub the persona + schema lookups so the test does not depend on a real
// BMAD install on disk. Both modules return placeholders that buildGuideContent
// can safely splice into the template.
//
// IMPORTANT: vi.mock factories are hoisted to the top of the file, so any
// top-level variables they reference would be accessed before initialization.
// Inline the mocks directly rather than referencing a top-level const.
vi.mock('../chat/agent-personas', () => ({
  getPersonaForArtifactType: () => undefined,
  formatFullAgentForPrompt: () => 'You are a BMAD methodology AI for this artifact.',
}));

vi.mock('../state/schema-validator', () => ({
  schemaValidator: {
    isInitialized: () => true,
    getSchemaContent: () => undefined,
    init: () => undefined,
  },
}));

// Minimal vscode mock — only Uri.file is touched in this test path
// (buildGuideContent itself doesn't call vscode, but its imports do).
vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ fsPath: p, path: p }),
  },
  workspace: {
    fs: {
      createDirectory: vi.fn(async () => {}),
      readFile: vi.fn(async () => new Uint8Array()),
      writeFile: vi.fn(async () => {}),
    },
  },
  commands: {
    getCommands: vi.fn(async () => []),
    executeCommand: vi.fn(async () => undefined),
  },
  ChatResponseStream: class {},
}));

import {
  buildGuideContent,
  resolveExecutionMode,
  type AntigravityWorkflowParams,
} from './antigravity-orchestrator';
import { PONYTAIL_HEURISTICS } from '../chat/ponytail-heuristics';

const baseParams: AntigravityWorkflowParams = {
  bmadPath: '/fake/bmad',
  projectRoot: '/fake/project',
  outputFolder: '/fake/project/.agileagentcanvas-context',
  task: 'Audit the artifact against Ponytail heuristics.',
  artifact: { type: 'product-vision', id: 'PV-1', title: 'Sample Vision' },
  outputFormat: 'json',
};

function callBuild(overrides: Partial<AntigravityWorkflowParams> = {}): string {
  return buildGuideContent({ ...baseParams, ...overrides });
}

// ────────────────────────────────────────────────────────────────────────────
// resolveExecutionMode — the gate that drives ponytailSection behavior
// ────────────────────────────────────────────────────────────────────────────

describe('resolveExecutionMode — gating for PONYTAIL injection', () => {
  it('returns interactive when hints.interactive=true', () => {
    expect(resolveExecutionMode({ interactive: true })).toBe('interactive');
  });

  it('returns autonomous when hints.autonomous=true (interactive absent)', () => {
    expect(resolveExecutionMode({ autonomous: true })).toBe('autonomous');
  });

  it('returns default when only autonomous=true and interactive also true', () => {
    // First-match-wins: interactive beats autonomous.
    expect(resolveExecutionMode({ interactive: true, autonomous: true })).toBe(
      'interactive'
    );
  });

  it('returns default when no hints are supplied', () => {
    expect(resolveExecutionMode(undefined)).toBe('default');
    expect(resolveExecutionMode({})).toBe('default');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildGuideContent — autonomous mode (PONYTAIL INJECTED)
// ────────────────────────────────────────────────────────────────────────────

describe('buildGuideContent — autonomous mode (PONYTAIL injected)', () => {
  const guide = callBuild({ executionHints: { autonomous: true } });

  it('renders the verbatim PONYTAIL_HEURISTICS constant inline', () => {
    expect(guide).toContain(PONYTAIL_HEURISTICS);
  });

  it('renders the contextual "apply before adding code" callout header', () => {
    expect(guide).toContain('apply before adding code');
  });

  it('renders all six hierarchy items in the contextual callout', () => {
    expect(guide).toContain('Necessity');
    expect(guide).toContain('Standard Library');
    expect(guide).toContain('Native Platform');
    expect(guide).toContain('Existing Dependencies');
    expect(guide).toContain('Simplicity');
    expect(guide).toContain('Implementation');
  });

  it('renders all five NOT-lazy-about boundaries', () => {
    expect(guide).toContain('input validation at trust boundaries');
    expect(guide).toContain('error handling that surfaces real failures');
    expect(guide).toContain('security and accessibility fundamentals');
    expect(guide).toContain('calibration required by real hardware');
    expect(guide).toContain('anything explicitly requested by the user');
  });

  it('renders the verification rule with the one-liner exemption', () => {
    expect(guide).toContain('Trivial one-liners need no test');
  });

  it('preserves the autonomous execution-block framing', () => {
    expect(guide).toContain('Execution Mode: Autonomous');
    expect(guide).toContain('autonomous execution');
  });

  it('preserves the BMAD grounding rule and task presence', () => {
    expect(guide).toContain('BMAD Grounding Rule');
    expect(guide).toContain('Audit the artifact');
  });

  it('survives the no-artifact fallback (New artifact creation)', () => {
    const guide = callBuild({
      executionHints: { autonomous: true },
      artifact: null,
    });
    expect(guide).toContain(PONYTAIL_HEURISTICS);
    expect(guide).toContain('new artifact creation task');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildGuideContent — default mode (PONYTAIL INJECTED)
// ────────────────────────────────────────────────────────────────────────────

describe('buildGuideContent — default mode (PONYTAIL injected)', () => {
  const guide = callBuild({}); // no executionHints → default

  it('renders the verbatim PONYTAIL_HEURISTICS constant inline', () => {
    expect(guide).toContain(PONYTAIL_HEURISTICS);
  });

  it('renders the contextual "apply before adding code" callout header', () => {
    expect(guide).toContain('apply before adding code');
  });

  it('renders all six hierarchy items in the contextual callout', () => {
    expect(guide).toContain('Necessity');
    expect(guide).toContain('Standard Library');
    expect(guide).toContain('Native Platform');
    expect(guide).toContain('Existing Dependencies');
    expect(guide).toContain('Simplicity');
    expect(guide).toContain('Implementation');
  });

  it('renders the NOT-lazy-about boundaries (all five)', () => {
    expect(guide).toContain('input validation at trust boundaries');
    expect(guide).toContain('error handling that surfaces real failures');
    expect(guide).toContain('security and accessibility fundamentals');
    expect(guide).toContain('calibration required by real hardware');
    expect(guide).toContain('anything explicitly requested by the user');
  });

  it('preserves the standard (checkpoint-based) execution-block framing', () => {
    expect(guide).toContain('Execution Mode: Standard');
    expect(guide).toContain('Checkpoint-Based');
  });

  it('preserves the BMAD grounding rule and task presence', () => {
    expect(guide).toContain('BMAD Grounding Rule');
    expect(guide).toContain('Audit the artifact');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildGuideContent — interactive mode (PONYTAIL DELIBERATELY EXCLUDED)
// ────────────────────────────────────────────────────────────────────────────

describe('buildGuideContent — interactive mode (PONYTAIL excluded)', () => {
  const guide = callBuild({ executionHints: { interactive: true } });

  it('does NOT render the verbatim PONYTAIL_HEURISTICS constant', () => {
    expect(guide).not.toContain(PONYTAIL_HEURISTICS);
  });

  it('does NOT render the contextual "apply before adding code" header', () => {
    expect(guide).not.toContain('apply before adding code');
  });

  it('preserves the interactive-facilitator framing (halt + iterate)', () => {
    expect(guide).toContain('YOUR ROLE: Interactive Facilitator');
    expect(guide).toContain('Halt for user input');
    expect(guide).toContain('STOP. HALT. WAIT');
    expect(guide).toContain('interactive facilitator mode');
    expect(guide).toContain('Do NOT produce a complete artifact');
  });

  it('preserves the BMAD grounding rule and task presence', () => {
    expect(guide).toContain('BMAD Grounding Rule');
    expect(guide).toContain('Audit the artifact');
  });

  it('survives the no-artifact fallback (New artifact creation)', () => {
    const guide = callBuild({
      executionHints: { interactive: true },
      artifact: null,
    });
    expect(guide).not.toContain(PONYTAIL_HEURISTICS);
    expect(guide).toContain('new artifact creation task');
  });
});
