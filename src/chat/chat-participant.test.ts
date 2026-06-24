// ─── Unit tests: /visual-plan chat command config gate ────────────────────────
// Verifies that handleVisualPlanCommand returns status:'disabled' when
// agileagentcanvas.visualPlan.enabled is false, and proceeds normally when enabled.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

// ── vi.hoisted: declare mock objects before vi.mock calls (hoisted to top) ──

const mockVisualPlanService = vi.hoisted(() => ({
  generate: vi.fn(),
  list: vi.fn(() => []),
  get: vi.fn(),
  addComment: vi.fn(),
  approve: vi.fn(),
  requestChanges: vi.fn(),
}));

const mockWorkflowImports = vi.hoisted(() => ({
  getWorkflowExecutor: vi.fn(),
  WorkflowExecutor: class {},
}));

const mockTools = vi.hoisted(() => ({
  sharedToolContext: {},
  getToolDefinitions: vi.fn(() => []),
}));

const mockToolExamples = vi.hoisted(() => ({
  TOOL_FEW_SHOT: {},
}));

const mockAiProvider = vi.hoisted(() => ({
  BmadModel: class {},
  selectModel: vi.fn(),
  streamChatResponse: vi.fn(),
  getNoModelMessage: vi.fn(() => 'No model available'),
  ChatMessage: class {},
}));

const mockJsonExtract = vi.hoisted(() => ({
  extractJson: vi.fn(),
}));

const mockPersonas = vi.hoisted(() => ({
  getPersonaForArtifactType: vi.fn(),
  formatFullAgentForPrompt: vi.fn(() => ''),
  loadAgentPersona: vi.fn(),
  clearPersonaCache: vi.fn(),
  AgentPersona: class {},
  loadAllAgentPersonas: vi.fn(() => []),
  formatAgentRoster: vi.fn(() => ''),
}));

const mockPonytail = vi.hoisted(() => ({
  PONYTAIL_HEURISTICS: '',
}));

const mockJira = vi.hoisted(() => ({
  JiraClient: class {},
}));

const mockActiveSession = vi.hoisted(() => ({
  setActiveChatSession: vi.fn(),
}));

const mockGraphify = vi.hoisted(() => ({
  loadReport: vi.fn(),
  detectGraphify: vi.fn(() => false),
}));

const mockGraphQuery = vi.hoisted(() => ({
  graphQuery: vi.fn(),
}));

const mockGraphLoader = vi.hoisted(() => ({
  loadGraph: vi.fn(),
  loadCommunities: vi.fn(),
  loadArchIndexMarkdown: vi.fn(),
}));

const mockCostTracker = vi.hoisted(() => ({
  costTracker: { log: vi.fn() },
}));

// ── Module mocks (hoisted above all imports) ────────────────────────────────

vi.mock('../state/artifact-store', () => ({
  ArtifactStore: class {},
  Epic: class {},
}));

vi.mock('../workflow/visual-plan-service', () => ({
  visualPlanService: mockVisualPlanService,
}));

vi.mock('../workflow/workflow-executor', () => mockWorkflowImports);

vi.mock('./agileagentcanvas-tools', () => mockTools);

vi.mock('./tool-examples', () => mockToolExamples);

vi.mock('./ai-provider', () => mockAiProvider);

vi.mock('../lib/json-extract', () => mockJsonExtract);

vi.mock('./agent-personas', () => mockPersonas);

vi.mock('./ponytail-heuristics', () => mockPonytail);

vi.mock('../integrations/jira-client', () => mockJira);

vi.mock('./active-session', () => mockActiveSession);

vi.mock('../integrations/graphify', () => mockGraphify);

vi.mock('../integrations/graphify/graph-query', () => mockGraphQuery);

vi.mock('../integrations/graphify/graph-loader', () => mockGraphLoader);

vi.mock('./cost-tracker', () => mockCostTracker);

// ── Imports (after all mocks) ───────────────────────────────────────────────

import { AgileAgentCanvasChatParticipant } from './chat-participant';
import { VISUAL_PLAN_DISABLED_MARKDOWN } from '../utils/visual-plan-config';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Override the vscode config mock so `.get('visualPlan.enabled')` returns the given value. */
function setVisualPlanEnabled(enabled: boolean): void {
  const config = vscode.workspace.getConfiguration();
  vi.mocked(config.get).mockImplementation(
    (key: string, defaultValue?: unknown) => {
      if (key === 'visualPlan.enabled') return enabled;
      return defaultValue;
    },
  );
}

function makeParticipant() {
  return new AgileAgentCanvasChatParticipant(
    {} as any,
    { extensionPath: '/fake/ext' } as vscode.ExtensionContext,
  );
}

/**
 * Wire the full enabled path so handleVisualPlanCommand flows end-to-end
 * and returns status:'generated'. Mock every dependency after the config
 * gate so the test asserts the exact result without a try/catch.
 */
function setupEnabledPath(): void {
  setVisualPlanEnabled(true);
  // Model selection succeeds
  mockAiProvider.selectModel.mockResolvedValue({ id: 'gpt-4', label: 'GPT-4' });
  // buildArtifactContext returns a non-empty context string
  vi.spyOn(
    AgileAgentCanvasChatParticipant.prototype as any,
    'buildArtifactContext',
  ).mockReturnValue('Project: test-project\nArtifacts: none');
  // generate resolves with a plan ID
  mockVisualPlanService.generate.mockResolvedValue('plan-test-001');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('handleVisualPlanCommand — config gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('returns status:disabled when visualPlan.enabled is false', async () => {
    setVisualPlanEnabled(false);

    const participant = makeParticipant();
    const mockStream = { markdown: vi.fn() } as unknown as vscode.ChatResponseStream;
    const mockToken = {} as vscode.CancellationToken;

    const result = await (participant as any).handleVisualPlanCommand(
      'build a dashboard',
      mockStream,
      mockToken,
    );

    expect(result).toEqual({
      metadata: { command: 'visual-plan', status: 'disabled' },
    });
    expect(mockStream.markdown).toHaveBeenCalledWith(
      VISUAL_PLAN_DISABLED_MARKDOWN,
    );
    // Gate blocked execution — model was never consulted
    expect(mockAiProvider.selectModel).not.toHaveBeenCalled();
  });

  it('completes successfully when visualPlan.enabled is true — returns status:generated', async () => {
    setupEnabledPath();

    const participant = makeParticipant();
    const mockStream = { markdown: vi.fn() } as unknown as vscode.ChatResponseStream;
    const mockToken = {} as vscode.CancellationToken;

    const result = await (participant as any).handleVisualPlanCommand(
      'build a dashboard',
      mockStream,
      mockToken,
    );

    // Exact result — no try/catch, no ambiguity
    expect(result).toEqual({
      metadata: { command: 'visual-plan', status: 'generated', planId: 'plan-test-001' },
    });
    // The full flow executed: header → gate → model → context → generate
    expect(mockStream.markdown).toHaveBeenCalledWith(
      expect.stringContaining('## Visual Plan'),
    );
    expect(mockStream.markdown).toHaveBeenCalledWith(
      expect.stringContaining('Plan generated'),
    );
    expect(mockAiProvider.selectModel).toHaveBeenCalled();
    expect(mockVisualPlanService.generate).toHaveBeenCalledWith({
      goal: 'build a dashboard',
      context: 'Project: test-project\nArtifacts: none',
      extensionPath: '/fake/ext',
    });
  });
});
