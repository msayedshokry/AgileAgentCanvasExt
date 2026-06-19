/**
 * Terminal Executor Step Definitions
 * Cucumber step definitions for testing Windows-specific terminal executor behavior
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// ─── Context ────────────────────────────────────────────────────────────────

interface TerminalTestContext {
  // Module references (loaded via proxyquire)
  module: any;
  isPowerShell: ((shell: string) => boolean) | null;
  shellQuote: ((s: string) => string) | null;

  // Current test state
  currentShell: string;
  lastQuoteResult: string;
  lastIsPowerShellResult: boolean;
  sentCommand: string | null;
  tempFileCreated: string | null;
  promptFileArg: string | null;

  // Mock tracking
  createTerminalCalls: number;
  sendTextCalls: string[];

  // Config overrides
  promptLength: 'long' | 'short';
  cliArgs: string[] | null;
  /** Override the provider returned by getSelectedProvider(). Default: 'claude'. */
  selectedProvider: string;

  // Sanitization test state
  lastSanitizeResult: string;
  hasCustomArtifactId: boolean;
  customArtifactId: string;
}

const contexts = new WeakMap<BmadWorld, TerminalTestContext>();

function getCtx(world: BmadWorld): TerminalTestContext {
  let ctx = contexts.get(world);
  if (!ctx) {
    ctx = {
      module: null,
      isPowerShell: null,
      shellQuote: null,
      currentShell: '/bin/bash',
      lastQuoteResult: '',
      lastIsPowerShellResult: false,
      sentCommand: null,
      tempFileCreated: null,
      promptFileArg: null,
      createTerminalCalls: 0,
      sendTextCalls: [],
      promptLength: 'long',
      cliArgs: null,
      selectedProvider: 'claude',
      lastSanitizeResult: '',
      hasCustomArtifactId: false,
      customArtifactId: '',
    };
    contexts.set(world, ctx);
  }
  return ctx;
}

/**
 * Create a mock vscode with the current shell setting and terminal mocking.
 */
function buildMockVscode(world: BmadWorld): any {
  const ctx = getCtx(world);

  return {
    ...world.vscode,
    TerminalLocation: {
      Panel: 1,
      Editor: 2,
      Split: 3,
    },
    env: {
      ...world.vscode.env,
      shell: ctx.currentShell,
    },
    window: {
      ...world.vscode.window,
      createTerminal: (options?: any) => {
        ctx.createTerminalCalls++;
        const mockTerminal = {
          name: options?.name || 'test-terminal',
          show: () => {},
          sendText: (text: string, addNewLine?: boolean) => {
            ctx.sendTextCalls.push(text);
          },
          dispose: () => {},
          processId: Promise.resolve(12345),
          exitStatus: undefined,
          onDidWriteData: (_cb: any) => ({ dispose: () => {} }),
          onDidChangeName: (_cb: any) => ({ dispose: () => {} }),
          onDidCloseTerminal: (_cb: any) => ({ dispose: () => {} }),
        };
        return mockTerminal;
      },
      onDidCloseTerminal: () => ({ dispose: () => {} }),
    },
    workspace: {
      ...world.vscode.workspace,
      workspaceFolders: [
        {
          uri: { scheme: 'file', authority: '', path: 'C:/Users/test/my-project', query: '', fragment: '', fsPath: 'C:\\Users\\test\\my-project' },
          name: 'test-project',
          index: 0,
        },
      ],
      getConfiguration: (section?: string) => {
        const cfg: any = {
          get: (key: string, defaultValue?: any) => {
            if (key === 'outputFolder') return '.agileagentcanvas-context';
            if (key === 'graphify.pythonPath') return 'python';
            return defaultValue;
          },
          has: () => false,
          inspect: () => undefined,
          update: async () => {},
        };
        return cfg;
      },
    },
  };
}

/**
 * Load the terminal-executor module via proxyquire with mocked dependencies.
 */
function loadModule(world: BmadWorld): any {
  const ctx = getCtx(world);
  const mockVscode = buildMockVscode(world);

  ctx.module = proxyquire('../../src/workflow/terminal-executor', {
    vscode: mockVscode,
    '../utils/logger': {
      createLogger: () => ({
        info: () => {},
        error: () => {},
        debug: () => {},
        warn: () => {},
      }),
    },
    '../trace/trace-recorder': {
      getTraceRecorder: () => ({
        record: async () => {},
      }),
    },
    // Stub kanban-verdict to prevent loading vscode-dependent getOutputFolder()
    './kanban-verdict': {
      sanitizeId: (id: string) => id.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
      resultFilePath: (folder: string, artifactId: string, workflowId: string) =>
        `${folder}/_terminal-output/${artifactId}-${workflowId}-result.json`,
      readVerdictFile: () => undefined,
      getOutputFolder: () => '.agileagentcanvas-context',
      normalizeVerdict: (parsed: any) => ({ verdict: 'UNKNOWN', raw: parsed }),
      extractVerdictFromText: () => undefined,
    },
    './concurrency-queue': {
      concurrencyQueue: {
        release: () => {},
        tryAcquire: () => true,
        isLocked: () => false,
        acquire: () => true,
      },
    },
    '../commands/chat-bridge': {
      getSelectedProvider: () => ctx.selectedProvider,
      listAvailableProviders: async () => [{ id: 'claude', available: true, name: 'Claude' }],
      // Test mock mirrors the production headless invocations (see
      // src/commands/chat-bridge.ts CHAT_COMMANDS). Headless CLIs require
      // the prompt as a positional arg value, not via stdin.
      CHAT_COMMANDS: {
        claude: {
          // Mirrors production: claude --permission-mode acceptEdits
          //                     --output-format json -p <prompt>
          // Note: production shape (no --bare) preserves project CLAUDE.md /
          // hooks / MCP — see src/commands/chat-bridge.ts note block.
          terminalLaunch: (prompt: string) =>
            ctx.cliArgs || [
              'claude',
              '--permission-mode', 'acceptEdits',
              '--output-format', 'json',
              '-p', prompt,
            ],
        },
        codex: {
          // Mirrors production: codex exec --ask-for-approval never
          //                     --sandbox workspace-write <prompt>
          terminalLaunch: (prompt: string) => [
            'codex',
            'exec',
            '--ask-for-approval', 'never',
            '--sandbox', 'workspace-write',
            prompt,
          ],
        },
        'gemini-cli': {
          // Mirrors production: gemini --yolo --output-format json -p <prompt>
          terminalLaunch: (prompt: string) => [
            'gemini',
            '--yolo',
            '--output-format', 'json',
            '-p', prompt,
          ],
        },
        opencode: {
          // Mirrors production: opencode run --model auto --format json <prompt>
          terminalLaunch: (prompt: string) => [
            'opencode',
            'run',
            '--model', 'auto',
            '--format', 'json',
            prompt,
          ],
        },
      },
    },
  });

  return ctx.module;
}

// ─── GIVEN ──────────────────────────────────────────────────────────────────

Given('a fresh terminal executor context', function (this: BmadWorld) {
  const ctx = getCtx(this);
  ctx.currentShell = '/bin/bash';
  ctx.lastQuoteResult = '';
  ctx.lastIsPowerShellResult = false;
  ctx.sentCommand = null;
  ctx.tempFileCreated = null;
  ctx.promptFileArg = null;
  ctx.createTerminalCalls = 0;
  ctx.sendTextCalls = [];
  ctx.promptLength = 'long';
  ctx.cliArgs = null;
  ctx.selectedProvider = 'claude';
  ctx.module = null;
  ctx.isPowerShell = null;
  ctx.shellQuote = null;
});

Given('the VS Code shell is {string}', function (this: BmadWorld, shell: string) {
  const ctx = getCtx(this);
  ctx.currentShell = shell;
  // Reload module with the new shell setting
  const mod = loadModule(this);
  ctx.module = mod;
});

Given('the chat-bridge returns CLI args for claude', function (this: BmadWorld) {
  const ctx = getCtx(this);
  // Mirrors the production claude headless shape (besides the prompt,
  // which the mock appends). Spec:
  //   code.claude.com/docs/en/headless
  ctx.cliArgs = [
    'claude',
    '--permission-mode', 'acceptEdits',
    '--output-format', 'json',
  ];
  // Reload module with the new args
  const mod = loadModule(this);
  ctx.module = mod;
});

Given('the artifact ID contains a space', function (this: BmadWorld) {
  const ctx = getCtx(this);
  ctx.hasCustomArtifactId = true;
  ctx.customArtifactId = 'Epic 2';
});

Given('the terminal provider is {string}', function (this: BmadWorld, provider: string) {
  const ctx = getCtx(this);
  ctx.selectedProvider = provider;
  // Reload module with the new provider selection
  const mod = loadModule(this);
  ctx.module = mod;
});


Given('the prompt length is short \\(< 8192 chars\\)', function (this: BmadWorld) {
  const ctx = getCtx(this);
  ctx.promptLength = 'short';
});

// ─── WHEN ───────────────────────────────────────────────────────────────────

When('I check if the shell is PowerShell', function (this: BmadWorld) {
  const ctx = getCtx(this);
  // Access isPowerShell through the loaded module
  const mod = ctx.module || loadModule(this);
  ctx.lastIsPowerShellResult = mod.isPowerShell();
});

When('I quote the path {string}', function (this: BmadWorld, path: string) {
  const ctx = getCtx(this);
  const mod = ctx.module || loadModule(this);
  ctx.lastQuoteResult = mod.shellQuote(path);
});

When('I execute a terminal workflow with a long prompt', async function (this: BmadWorld) {
  const ctx = getCtx(this);
  const mod = ctx.module || loadModule(this);
  const executor = new mod.TerminalExecutor();

  const artifact = {
    id: ctx.hasCustomArtifactId ? ctx.customArtifactId : 'EPIC-1',
    type: 'epic',
    title: 'Test Epic',
    status: 'backlog',
    description: 'B'.repeat(9000), // 9000 chars — exceeds 8192 long-prompt threshold
  };

  await executor.executeTerminalWorkflow('epic-enhancement', artifact, {});
  ctx.sentCommand = ctx.sendTextCalls[0] || null;
  // Reset custom artifact flag after use
  ctx.hasCustomArtifactId = false;
  ctx.customArtifactId = '';
});

When('I sanitize the ID {string}', function (this: BmadWorld, id: string) {
  const ctx = getCtx(this);
  const mod = ctx.module || loadModule(this);
  ctx.lastSanitizeResult = mod.sanitizeId(id);
});

When('I execute a terminal workflow with a short prompt', async function (this: BmadWorld) {
  const ctx = getCtx(this);
  const mod = ctx.module || loadModule(this);
  const executor = new mod.TerminalExecutor();

  const artifact = {
    id: 'STORY-1',
    type: 'story',
    title: 'Test Story',
    status: 'backlog',
    description: 'Short description.',
  };

  await executor.executeTerminalWorkflow('story-enhancement', artifact, {});
  ctx.sentCommand = ctx.sendTextCalls[0] || null;
});

// ─── THEN ───────────────────────────────────────────────────────────────────

Then('the result should be true', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastIsPowerShellResult, true,
    `Expected isPowerShell() to return true for shell "${ctx.currentShell}"`);
});

Then('the result should be false', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastIsPowerShellResult, false,
    `Expected isPowerShell() to return false for shell "${ctx.currentShell}"`);
});

Then('the quoted result should be {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastQuoteResult, expected,
    `Expected quoted result "${expected}", got "${ctx.lastQuoteResult}"`);
});

Then('the quoted result should contain {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastQuoteResult.includes(expected),
    `Expected quoted result to contain "${expected}", got "${ctx.lastQuoteResult}"`);
});

Then('sendText should have been called', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.sendTextCalls.length > 0,
    'Expected sendText to have been called at least once');
});

Then('the sent command should contain {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.sentCommand, 'Expected a sent command, but none was recorded');
  assert.ok(ctx.sentCommand!.includes(expected),
    `Expected sent command to contain "${expected}", got "${ctx.sentCommand}"`);
});

Then('the sent command should not contain {string}', function (this: BmadWorld, unexpected: string) {
  const ctx = getCtx(this);
  if (ctx.sentCommand) {
    assert.ok(!ctx.sentCommand.includes(unexpected),
      `Expected sent command NOT to contain "${unexpected}", got "${ctx.sentCommand}"`);
  }
});

Then('the sent command should start with {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.sentCommand, 'Expected a sent command, but none was recorded');
  assert.ok(ctx.sentCommand!.startsWith(expected),
    `Expected sent command to start with "${expected}", got "${ctx.sentCommand}"`);
});

Then('the sanitized result should be {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastSanitizeResult, expected,
    `Expected sanitized result "${expected}", got "${ctx.lastSanitizeResult}"`);
});

Then('the temp filename should contain {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.sentCommand, 'Expected a sent command, but none was recorded');
  assert.ok(ctx.sentCommand!.includes(expected),
    `Expected temp filename to contain "${expected}", got "${ctx.sentCommand}"`);
});

Then('the temp filename should not contain {string}', function (this: BmadWorld, unexpected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.sentCommand, 'Expected a sent command, but none was recorded');
  assert.ok(!ctx.sentCommand!.includes(unexpected),
    `Expected temp filename NOT to contain "${unexpected}", got "${ctx.sentCommand}"`);
});
