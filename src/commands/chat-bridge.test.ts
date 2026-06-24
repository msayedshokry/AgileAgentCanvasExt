// ─────────────────────────────────────────────────────────────────────────────
// Regression test for openChatWithResult provider resolution.
//
// Bug: the priority chain used `?? _selectedProvider`, which only filters
// null/undefined — so when the user had never picked a provider in the
// dropdown, the literal string 'auto' short-circuited the chain and forced
// doOpenChat('auto', ...) into the silent clipboard fallback (filed under
// "Visualize Plan button creates a JSON file but never reaches chat/terminal").
//
// Fix: filter 'auto' out of `_selectedProvider` before the chain, so it falls
// through to settings → detected IDE → copilot.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
} from './chat-bridge';

describe('openChatWithResult — provider resolution', () => {
  beforeEach(() => {
    // Reset to the default every test so the chain's sentinel-fall-through
    // path is what gets exercised (the bug only manifested under 'auto').
    setSelectedProvider('auto');
    __clearProviderAvailabilityCache();
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
});
