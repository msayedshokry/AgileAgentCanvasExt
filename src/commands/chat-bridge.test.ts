// ─────────────────────────────────────────────────────────────────────────────
// Regression tests for openChatWithResult provider resolution.
//
// Three bug classes covered here:
//   1) The priority chain used `?? _selectedProvider`, which only filters
//      null/undefined — so the literal 'auto' sentinel short-circuited and
//      forced every call into the silent clipboard fallback (filed under
//      "Visualize Plan button creates a JSON file but never reaches
//      chat/terminal"). Fixed by filtering 'auto' before the chain.
//   2) The `agileagentcanvas.chatProvider` setting is documented as the
//      workspace-level DEFAULT but the resolver was never reading it. Fixed
//      by inserting `chatProvider` into the chain — but
//   3) the original (2) fix inserted it ABOVE `_selectedProvider`, silently
//      overriding the user's active dropdown pick on every action. Symptom:
//      terminal pane opened with "Launching: claude …" regardless of which
//      provider the canvas dropdown or status bar Quick Pick showed, because
//      `chatProvider: 'claude'` was set in workspace settings and the
//      override was invisible in the UI. Fix: dropdown wins; admin default
//      acts as a true fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

// Minimal vscode surface needed by chat-bridge. Both `ProgressLocation`
// (consumed `as` an enum by `vscode.window.withProgress`) and
// `ConfigurationTarget` (consumed `as` an enum by `setSelectedProvider`)
// are required even though the tests don't assert on their values — the
// mock factory must return whatever properties the production code reads.
vi.mock('vscode', () => ({
  ProgressLocation: { Notification: 15, Window: 10, SourceControl: 1 },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  window: {
    withProgress: vi.fn(async (_opts: unknown, fn: () => Promise<unknown>) => fn()),
    createTerminal: vi.fn(() => ({
      show: vi.fn(),
      sendText: vi.fn(),
      name: 'stub',
    })),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
      update: vi.fn().mockResolvedValue(undefined),
    })),
    workspaceFolders: undefined,
    asRelativePath: vi.fn(),
  },
  commands: {
    getCommands: vi.fn().mockResolvedValue([]),
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
  env: {
    appName: 'Visual Studio Code',
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  },
}));

// antigravity sendSimplePrompt only runs when provider resolves to
// 'antigravity'. Stub to a deterministic "not supported" so any leaked
// path produces a clean clipboard result rather than a real call.
vi.mock('../antigravity/antigravity-orchestrator', () => ({
  sendSimplePrompt: vi.fn().mockResolvedValue(false),
}));

import {
  openChatWithResult,
  setSelectedProvider,
  getSelectedProvider,
  __clearProviderAvailabilityCache,
  type ChatProviderId,
} from './chat-bridge';

// Test-controlled: simulates what a user has configured for the workspace
// `agileagentcanvas.chatProvider` setting. Updated by specific tests; reset
// to 'auto' in beforeEach.
let mockWorkspaceChatProvider: ChatProviderId = 'auto';

describe('openChatWithResult — provider resolution', () => {
  beforeEach(() => {
    // Reset to the default every test so the chain's sentinel-fall-through
    // path is what gets exercised (the bug only manifested under 'auto').
    setSelectedProvider('auto');
    __clearProviderAvailabilityCache();
    mockWorkspaceChatProvider = 'auto';

    // Override the vscode config mock so the workspace-level
    // `agileagentcanvas.chatProvider` setting can be varied per test. The
    // default `get` returns the per-key default — so `chatProviderSelected`
    // still defaults to 'auto' (matching fresh-install behavior) and other
    // config reads are unaffected.
    vi.mocked(vscode.workspace.getConfiguration).mockImplementation(
      (_section?: string) => ({
        get: vi.fn((key: string, defaultValue: unknown) => {
          if (key === 'chatProvider') return mockWorkspaceChatProvider;
          return defaultValue;
        }),
        update: vi.fn().mockResolvedValue(undefined),
        // WorkspaceConfiguration requires `has` + `inspect` even though
        // production code here never calls them.
        has: vi.fn().mockReturnValue(false),
        inspect: vi.fn().mockReturnValue(undefined),
      // The interface's overloaded `get<T>(section, defaultValue): T` vs
      // `get<T>(section): T | undefined` signatures can't be expressed in a
      // test stub — cast once to satisfy the type checker; runtime semantics
      // only need `get` to honor `chatProvider`.
      }) as unknown as vscode.WorkspaceConfiguration,
    );
  });

  // ── Regression: 'auto' must fall through, never pin ──────────────────────
  it('falls through _selectedProvider="auto" instead of pinning on the literal string', async () => {
    expect(getSelectedProvider()).toBe('auto');
    const result = await openChatWithResult({ query: 'hello' });
    // The resolved provider is a real chat provider, NOT the sentinel 'auto'
    // (which would have meant doOpenChat fell through every branch to the
    // no-op clipboard fallback).
    expect(result.provider).not.toBe('auto');
    // For stock VS Code with no extra commands registered, detectIdeForChat()
    // resolves to 'copilot'.
    expect(result.provider).toBe('copilot');
  });

  // ── Guard: explicit override still wins over everything ─────────────────
  it('still respects an explicit non-auto opts.provider override', async () => {
    const result = await openChatWithResult({ provider: 'claude', query: 'hi' });
    expect(result.provider).toBe('claude');
  });

  // ── Guard: a hand-picked non-auto _selectedProvider is honored ──────────
  it('respects a non-auto _selectedProvider set after startup', async () => {
    setSelectedProvider('claude');
    expect(getSelectedProvider()).toBe('claude');
    const result = await openChatWithResult({ query: 'hi' });
    expect(result.provider).toBe('claude');
  });

  // ── NEW: explicit override wins even when workspace chatProvider is set ──
  it('respects an explicit opts.provider override even when workspace chatProvider is set', async () => {
    mockWorkspaceChatProvider = 'claude';
    setSelectedProvider('omp');
    const result = await openChatWithResult({ provider: 'codex', query: 'hi' });
    expect(result.provider).toBe('codex');
  });

  // ── NEW: workspace chatProvider is honored when dropdown is auto ─────────
  it('honors a workspace-level chatProvider when _selectedProvider is "auto"', async () => {
    mockWorkspaceChatProvider = 'claude';
    setSelectedProvider('auto');
    const result = await openChatWithResult({ query: 'hi' });
    // Workspace default 'claude' wins; resolver no longer falls through to
    // detected 'copilot'.
    expect(result.provider).toBe('claude');
  });

  // ── REGRESSION: dropdown pick MUST win over workspace admin default ─────
  // Symptom: terminal pane opened with "Launching: claude …" regardless of
  // the dropdown pick, because `chatProvider: 'claude'` was silently
  // sitting ABOVE `_selectedProvider` in the resolution chain. The status
  // bar and dropdown UI only display `_selectedProvider` — the override was
  // completely invisible to the user, who then thought the picker was
  // broken. Fix: dropdown (user's pick) wins; admin default is a fallback.
  it('REGRESSION: dropdown pick wins over workspace-level chatProvider when both are set', async () => {
    mockWorkspaceChatProvider = 'claude';
    setSelectedProvider('omp');
    const result = await openChatWithResult({ query: 'hi' });
    // `_selectedProvider` is the user's intentional pick; the workspace
    // admin default is a FALLBACK, not an override.
    expect(result.provider).toBe('omp');
  });

  // ── NEW: user dropdown pick wins when workspace chatProvider is auto ─────
  it('falls through workspace chatProvider="auto" so user dropdown pick is honored', async () => {
    mockWorkspaceChatProvider = 'auto';
    setSelectedProvider('omp');
    const result = await openChatWithResult({ query: 'hi' });
    // Sentinel 'auto' must not pin; user's 'omp' pick wins.
    expect(result.provider).toBe('omp');
  });
});
