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

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as vscode from 'vscode';

// Minimal vscode surface needed by chat-bridge. Both `ProgressLocation`
// (consumed `as` an enum by `vscode.window.withProgress`) and
// `ConfigurationTarget` (consumed `as` an enum by `setSelectedProvider`)
// are required even though the tests don't assert on their values — the
// mock factory must return whatever properties the production code reads.
//
// `createTerminal` now exposes `processId: Promise.resolve(1234)` so the
// race-guard `await term.processId` in `sendToTerminal` resolves cleanly
// in tests (omitting it would hang sendToTerminal forever). `env.shell:
// '/bin/bash'` keeps isPowerShell() false by default; specific tests
// override via `Object.assign(vscode.env, { shell: 'pwsh.exe' })`.
vi.mock('vscode', () => ({
  ProgressLocation: { Notification: 15, Window: 10, SourceControl: 1 },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  window: {
    withProgress: vi.fn(async (_opts: unknown, fn: () => Promise<unknown>) => fn()),
    createTerminal: vi.fn(() => ({
      show: vi.fn(),
      sendText: vi.fn(),
      name: 'stub',
      processId: Promise.resolve(1234),
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
    shell: '/bin/bash',
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
  shellQuote,
  isPowerShell,
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

// ─────────────────────────────────────────────────────────────────────────────
// Regression tests for shellQuote + sendToTerminal.
//
// Symptom (Windows/PowerShell): the terminal HUD shows "Launching: claude …"
// but the typed command sits at the prompt without being executed. Root
// cause had two layers:
//   1) `term.sendText` was called before PowerShell finished initializing,
//      causing the inline text to buffer without submitting. Fix: await
//      `term.processId` before `sendText` (the shell process is ready once
//      the processId promise resolves).
//   2) The local shellQuote used POSIX single-quote escaping
//      (`'\''` for embedded `'`), which PowerShell does NOT parse the same
//      way as bash. A second bug class hid behind layer 1: even if PowerShell
//      HAD executed the typed command, prompts containing apostrophes
//      would have been tokenized into multiple arguments. Fix: detect the
//      user's shell via `vscode.env.shell` and switch to PowerShell's
//      native double-quote + backtick escaping for the PowerShell family.
// ─────────────────────────────────────────────────────────────────────────────

describe('shellQuote — cross-shell quoting', () => {
  beforeEach(() => {
    Object.assign(vscode.env, { shell: '/bin/bash' });
  });

  // ── Safe ASCII passes through untouched on both shells ─────────────────
  it('returns safe ASCII identifier unquoted on bash', () => {
    expect(shellQuote('claude')).toBe('claude');
    expect(shellQuote('--permission-mode')).toBe('--permission-mode');
    expect(shellQuote('-p')).toBe('-p');
    expect(shellQuote('json')).toBe('json');
    expect(shellQuote('claude-code/feature/g3')).toBe('claude-code/feature/g3');
  });

  it('returns safe ASCII identifier unquoted on PowerShell', () => {
    Object.assign(vscode.env, { shell: 'pwsh.exe' });
    expect(shellQuote('claude')).toBe('claude');
    expect(shellQuote('--permission-mode')).toBe('--permission-mode');
    expect(shellQuote('json')).toBe('json');
  });

  // ── Strings needing quoting: bash gets '...' ────────────────────────────
  it('wraps with POSIX single quotes on bash for strings with spaces or special chars', () => {
    expect(shellQuote('hello world')).toBe("'hello world'");
    // `a.b/c_d` is wholly in the safe-ASCII regex `[A-Za-z0-9_\\-./:=]`
    // (every char is a class member — letters under `[A-Za-z]` include
    //  uppercase `D`, plus digits, dot, slash, underscore) so it passes through
    // unquoted. This is the over-quoting-drift guard.
    expect(shellQuote('a.b/c_d')).toBe('a.b/c_d');
    // `@` is NOT in the safe-ASCII regex → triggers single-quote wrapping.
    expect(shellQuote('hello @world')).toBe("'hello @world'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");  // POSIX single-quote escape
  });

  // ── Same strings on PowerShell: double quote + backtick escape ──────────
  it('wraps with double quotes on PowerShell for strings with spaces', () => {
    Object.assign(vscode.env, { shell: 'pwsh.exe' });
    expect(shellQuote('hello world')).toBe('"hello world"');
  });

  it('escapes $, " and ` in PowerShell double-quote mode', () => {
    Object.assign(vscode.env, { shell: 'pwsh' });
    // `$` would otherwise expand as a variable inside PowerShell double quotes.
    expect(shellQuote('$abc')).toBe('"`$abc"');
    // `"` would otherwise close the string prematurely.
    expect(shellQuote('a"b')).toBe('"a`"b"');
    // `` ` `` would otherwise be a PowerShell escape-sequence trigger.
    expect(shellQuote('a`b')).toBe('"a``b"');
    // Mixed — `$x "y" \`z` becomes backtick-prefixed per char that needs
    // escape, then wrapped in double quotes. The expected literal contains
    // NO `\\` escapes — the implementation emits a single ` before each
    // `$`, `"`, or `` ` ``, and a literal `\` is treated by PowerShell as
    // a printable character inside double-quoted strings (no escape
    // prose), so emitting `\` in the cmdLine would be wrong on PowerShell.
    expect(shellQuote('$x "y" `z')).toBe('"`$x `"y`" ``z"');
  });

  it('does NOT escape single quotes inside PowerShell mode (they are literal in "...")', () => {
    Object.assign(vscode.env, { shell: 'pwsh.exe' });
    // PowerShell double quotes treat ' as a literal — no escaping needed,
    // unlike POSIX single quotes where ' inside ' is a problem.
    expect(shellQuote("it's")).toBe('"it\'s"');
  });

  it('handles empty string identically on both shells', () => {
    expect(shellQuote('')).toBe("''");
    Object.assign(vscode.env, { shell: 'pwsh.exe' });
    expect(shellQuote('')).toBe("''");
  });

  it('detects PowerShell from vscode.env.shell for the family of variants', () => {
    expect(isPowerShell()).toBe(false);
    (vscode.env as { shell: string }).shell = '/bin/bash';
    expect(isPowerShell()).toBe(false);
    (vscode.env as { shell: string }).shell = '/usr/bin/zsh';
    expect(isPowerShell()).toBe(false);
    (vscode.env as { shell: string }).shell = 'powershell.exe';
    expect(isPowerShell()).toBe(true);
    (vscode.env as { shell: string }).shell = 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    expect(isPowerShell()).toBe(true);
    (vscode.env as { shell: string }).shell = '/usr/local/bin/pwsh';
    expect(isPowerShell()).toBe(true);
    (vscode.env as { shell: string }).shell = 'pwsh.exe';
    expect(isPowerShell()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Race-guard + cmdLine-shape e2e through openChatWithResult.
// Exercises the `claude` terminalLaunch branch directly (mocked
// getCommands returns [] so cmd.hasPanel() is false → falls through to
// sendToTerminal). Asserts:
//   1) processId is awaited BEFORE sendText fires,
//   2) the final cmdLine matches the canonical shape and uses the shell-mode
//      quoting that matches vscode.env.shell.
// ─────────────────────────────────────────────────────────────────────────────

describe('openChatWithResult — terminal launch path (sendToTerminal)', () => {
  // Per-test capture: replace the default createTerminal mock with one whose
  // sendText spy we can introspect. `processId` is exposed via a getter so
  // the spy is actually invoked when production code reads `term.processId`
  // (a direct property assignment would bypass the spy).
  // Typed as the unconstrained `Mock` rather than `MockInstance<T>` — vitest
  // 2.x constrains the generic to `Procedure | Constructable`, which a tuple
  // like `[string, boolean]` does not satisfy (TS2344/TS2707/TS2322) AND
  // makes `Mock<Procedure | Constructable>` itself un-callable from a getter
  // (TS2348 "is not callable. Did you mean to include 'new'?"). The plain
  // `Mock` from vitest (no generic — defaults to a callable `unknown` return)
  // extends `T` so both the direct call (`processIdSpy()`) AND the assertions
  // (`toHaveBeenCalled`, `mock.calls`, `mockClear`, `invocationCallOrder`)
  // type-check. Runtime shape and assertion semantics are unchanged.
  let sendTextSpy: Mock;
  let processIdSpy: Mock;
  let processIdPromise: Promise<number | undefined>;

  beforeEach(() => {
    setSelectedProvider('auto');
    __clearProviderAvailabilityCache();
    mockWorkspaceChatProvider = 'auto';
    Object.assign(vscode.env, { shell: '/bin/bash' });

    sendTextSpy = vi.fn();
    processIdPromise = Promise.resolve(1234);
    processIdSpy = vi.fn(() => {
      // Spy on read access of `term.processId` — production code does
      // `await term.processId`, which translates to a property read. By
      // exposing `processId` as a getter that invokes this spy, we record
      // that the read path was actually traversed (not just that the
      // promise resolved).
      return processIdPromise;
    });

    // NOTE: `processId` is a GETTER so the spy fires on .processId read.
    // A direct `processId: processIdPromise` field would skip the spy,
    // making the production code's read invisible to test instrumentation.
    vi.mocked(vscode.window.createTerminal).mockReturnValue({
      show: vi.fn(),
      sendText: sendTextSpy,
      name: 'stub',
      get processId() { processIdSpy(); return processIdPromise; },
    } as unknown as vscode.Terminal);
  });

  // ── The race guard: processId is awaited before sendText fires ──────────
  // Strengthens the weaker \"before/after ordering\" check below by
  // proving the await is the actual gating primitive: if the shell
  // process id is still resolving, sendText MUST NOT fire. This is
  // the version that catches a regression that removes the \"await\".
  it('does not call sendText until processId resolves (real race-guard semantics)', async () => {
    // Swap in a processId promise that we control — initially hung.
    let resolveProcessId!: (pid: number | undefined) => void;
    processIdPromise = new Promise<number | undefined>((resolve) => {
      resolveProcessId = resolve;
    });

    const hung = openChatWithResult({ provider: 'claude', query: 'hello world' });

    // Yield liberally so any racing sendText would have had ample time.
    // 50ms is well past PowerShell's typical warm-up window — more than
    // enough microtask turns for a buggy implementation to call sendText
    // before the await resolves.
    await new Promise(r => setTimeout(r, 50));

    expect(processIdSpy).toHaveBeenCalled();
    expect(sendTextSpy).not.toHaveBeenCalled();

    // Resolve the processId — production code's await now unblocks and
    // sendText fires. This proves the await IS the gating primitive
    // (removing it would have caused sendText to fire on the first call).
    resolveProcessId(1234);
    await hung;

    expect(sendTextSpy).toHaveBeenCalledTimes(1);
  });

  // ── Ordering tie-breaker (complements the strengthened test above) ────
  it('records processId read before sendText call (microtask ordering)', async () => {
    await openChatWithResult({ provider: 'claude', query: 'hello world' });
    sendTextSpy.mockClear();
    processIdSpy.mockClear();

    await openChatWithResult({ provider: 'claude', query: 'hello world' });
    expect(processIdSpy).toHaveBeenCalled();
    expect(sendTextSpy).toHaveBeenCalled();
    // Both calls settle in microtask order — we observe that the
    // recorded call index of `processIdSpy` is <= that of `sendTextSpy`.
    const processOrder = processIdSpy.mock.invocationCallOrder[0] ?? 0;
    const sendTextOrder = sendTextSpy.mock.invocationCallOrder[0] ?? 0;
    expect(processOrder).toBeLessThanOrEqual(sendTextOrder);
  });

  // ── Interactive canvas: claude opens its TUI; no headless flags ────────
  // The canvas path uses terminalLaunch('claude' without -p, so the
  // cmdLine is just 'claude' — no flags, no prompt. The user interacts
  // with claude's TUI directly. Headless flags are only added by
  // terminal-executor.ts for the kanban/agentic path.
  it('on bash, claude terminal-launch opens TUI interactively (no headless flags)', async () => {
    await openChatWithResult({ provider: 'claude', query: 'hello world' });
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    const [cmdLine, addNewLine] = sendTextSpy.mock.calls[0] as [string, boolean];
    expect(cmdLine).toBe('claude');
    expect(addNewLine).toBe(true);
  });

  it('on PowerShell, claude terminal-launch opens TUI interactively (no headless flags)', async () => {
    Object.assign(vscode.env, { shell: 'pwsh.exe' });
    await openChatWithResult({ provider: 'claude', query: 'hello world' });
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    const [cmdLine, addNewLine] = sendTextSpy.mock.calls[0] as [string, boolean];
    expect(cmdLine).toBe('claude');
    expect(addNewLine).toBe(true);
  });

  // ── Long-prompt branch: bash stdin-redirect shape (`claude < file`) ───────
  // When the prompt is long (>8 KiB), sendToTerminal writes it to a temp
  // file and redirects stdin: `claude < /tmp/aac-prompt-....md`. The flags
  // from terminalLaunch are just `['claude']`, so no flags appear between
  // the command and the redirect.
  it('on bash with a long prompt (>8 KiB), emits `claude < file` stdin-redirect shape', async () => {
    const longPrompt = 'A'.repeat(8_500);
    await openChatWithResult({ provider: 'claude', query: longPrompt });
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    const [cmdLine] = sendTextSpy.mock.calls[0] as [string, boolean];
    // Shape: `claude < <quoted-path>aac-prompt-[\w-]+.md<quoted-path>`
    expect(cmdLine).toMatch(/^claude < ['"]?.*aac-prompt-[\w-]+\.md['"]?$/);
    // No headless flags leak into the interactive path.
    expect(cmdLine).not.toMatch(/--permission-mode/);
    expect(cmdLine).not.toMatch(/--output-format/);
    expect(cmdLine).not.toMatch(/ -p /);
    expect(cmdLine).not.toMatch(/Get-Content/);
  });

  // ── Long-prompt branch: PowerShell call-operator shape ───────────────────
  it('on PowerShell with a long prompt (>8 KiB), emits `Get-Content -Raw | & claude` shape', async () => {
    Object.assign(vscode.env, { shell: 'pwsh.exe' });
    const longPrompt = 'B'.repeat(8_500);
    await openChatWithResult({ provider: 'claude', query: longPrompt });
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    const [cmdLine] = sendTextSpy.mock.calls[0] as [string, boolean];
    // Shape: `Get-Content -Raw <path> | & claude`
    expect(cmdLine).toMatch(/^Get-Content -Raw ['"]?.*aac-prompt-[\w-]+\.md['"]? \| & claude$/);
    // No headless flags leak into the interactive path.
    expect(cmdLine).not.toMatch(/--permission-mode/);
    expect(cmdLine).not.toMatch(/--output-format/);
    expect(cmdLine).not.toMatch(/ -p /);
    expect(cmdLine).not.toMatch(/ < /);
  });

  // ── Long-prompt branch: prompt itself is NOT duplicated inline ──────────
  it('long-prompt branch does not duplicate the prompt inline (avoids re-encoding)', async () => {
    const longPrompt = 'Ctx-' + 'X'.repeat(8_500) + '-End';
    await openChatWithResult({ provider: 'claude', query: longPrompt });
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    const [cmdLine] = sendTextSpy.mock.calls[0] as [string, boolean];
    expect(cmdLine).not.toContain('Ctx-');
    expect(cmdLine).not.toContain('-End');
  });

  // ── Terminal paste provider ('terminal') echoes the prompt ────────────
  it('terminal paste provider echoes the prompt', async () => {
    await openChatWithResult({ provider: 'terminal', query: 'hello world' });
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    const [cmdLine] = sendTextSpy.mock.calls[0] as [string, boolean];
    expect(cmdLine).toBe("echo 'hello world'");
  });
});
