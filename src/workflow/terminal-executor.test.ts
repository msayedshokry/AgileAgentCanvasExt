// Regression test — lock down the terminal-agent prompt contract.
//
// `buildTerminalPrompt` is the single source of the prompt string sent to
// headless CLIs (claude/codex/aider/opencode/pi) running BMAD
// workflows. The Ponytail minimalist-heuristics constant must be
// concatenated into that prompt so headless runs honor the same
// "laziest senior developer" discipline as the chat and ACP paths. A
// drop of the PONYTAIL_HEURISTICS concatenation — or any rewrite of
// buildTerminalPrompt that forgets the BMAD framing — must break this
// test, not pass silently.
//
// Exported as part of the regression contract; if you intentionally
// change buildTerminalPrompt, update this file in the same commit.
//
// Note: this is a *forward-looking guard*. The PONYTAIL_HEURISTICS
// concatenation in buildTerminalPrompt is part of the recommended
// injection plan (see audit). Until that injection lands, the
// PONYTAIL-bearing assertions will fail — that's the regression guard
// doing its job, not a bug in the test.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PONYTAIL_HEURISTICS } from '../chat/ponytail-heuristics';
import {
    captureWorkspaceSnapshot,
    diffWorkspaceSnapshots,
    TerminalExecutor,
    outputTail,
} from './terminal-executor';
import { window } from 'vscode';

// ── Additional module mocks for the long-prompt staging tests ────────────────
// The e2e staging test drives executeTerminalWorkflow, which pulls in the
// chat-bridge provider resolution + observability modules. Mock them so the
// test is hermetic and provider selection is deterministic ('pi').

// Mutable holder so tests can flip the shell flavor per test.
const chatBridgeMockState = vi.hoisted(() => ({ isPowerShell: false }));
const harnessMockState = vi.hoisted(() => ({ outputFolder: '.agileagentcanvas-context', resolution: undefined as any, trustBlock: undefined as string | undefined, override: undefined as string | undefined }));
vi.mock('./harness/board-harness', () => ({
    resolveBoardHarness: async (override?: string) => { harnessMockState.override = override; return harnessMockState.resolution; },
    getPermissionPosture: () => 'sandboxed',
    resolveEffectivePosture: async () => 'sandboxed',
    agentRunBlockReason: () => harnessMockState.trustBlock,
}));

// NOTE: chat-bridge and trace-recorder live OUTSIDE src/workflow — mock paths
// must be resolved from this test file (src/workflow/…) as '../commands/…' and
// '../trace/…'. Wrong-path vi.mock() silently no-ops, which made earlier
// versions of these tests run against the real modules.
vi.mock('../commands/chat-bridge', () => ({
    getSelectedProvider: () => 'pi',
    listAvailableProviders: async () => [{ id: 'pi', available: true, name: 'Pi' }],
    shellQuote: (s: string) => (/^[A-Za-z0-9_\-./:=]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'"),
    isPowerShell: () => chatBridgeMockState.isPowerShell,
    CHAT_COMMANDS: {
        pi: { terminalLaunch: (q: string) => ['pi', q] },
        claude: { terminalLaunch: (q: string) => ['claude', 'q', q] },
    },
}));
vi.mock('../trace/trace-recorder', () => ({
    getTraceRecorder: () => ({ record: vi.fn(), flushAll: vi.fn() }),
}));
vi.mock('./agent-health-monitor', () => ({
    agentHealthMonitor: { registerCheck: vi.fn(), deregisterCheck: vi.fn() },
}));
vi.mock('./terminal-health-checks', () => ({
    createTerminalHealthChecks: () => [],
}));
vi.mock('./concurrency-queue', () => ({
    concurrencyQueue: {
        release: vi.fn(),
        tryAcquire: vi.fn(() => true),
        isLocked: vi.fn(() => false),
    },
}));
vi.mock('./kanban-verdict', () => ({
    sanitizeId: (id: string) => id.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
    resultFilePath: (folder: string, artifactId: string, workflowId: string) =>
        `${folder}/_terminal-output/${artifactId}-${workflowId}-result.json`,
    readVerdictFile: () => undefined,
    getOutputFolder: () => harnessMockState.outputFolder,
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

// terminal-executor.ts imports vscode at top-level. In a Node-only
// Vitest environment the `vscode` module resolves as the type defs
// (no runtime implementer), so we must stub it. The stubs cover the
// surface walked during module-load by transitive imports
// (concurrency-queue, agent-health-monitor, chat-bridge, etc.) so a
// missing symbol surfaces a clear assertion failure, not a cryptic
// "X is not a function" runtime error.
vi.mock('vscode', () => {
    class EventEmitter {
        event() { return { dispose: () => undefined }; }
        fire() { /* no-op */ }
        dispose() { /* no-op */ }
    }
    return {
        EventEmitter,
        workspace: {
            // Set to [] (not undefined) — transitive modules iterate over
            // .workspaceFolders and treat undefined as a fatal error.
            workspaceFolders: [],
            getConfiguration: vi.fn(() => ({
                get: vi.fn((key: string, defaultVal: unknown) => defaultVal),
            })),
            fs: {
                createDirectory: vi.fn(async () => undefined),
                writeFile: vi.fn(async () => undefined),
                readFile: vi.fn(async () => Buffer.from('')),
                delete: vi.fn(async () => undefined),
            },
        },
        window: {
            showInformationMessage: vi.fn(async () => undefined),
            showErrorMessage: vi.fn(async () => undefined),
            showWarningMessage: vi.fn(async () => undefined),
            createTerminal: vi.fn(() => ({
                show: vi.fn(),
                sendText: vi.fn(),
                dispose: vi.fn(),
                name: 'mocked-terminal',
                processId: Promise.resolve(undefined),
                onDidWriteData: vi.fn(() => ({ dispose: () => undefined })),
            })),
            onDidCloseTerminal: vi.fn(() => ({ dispose: () => undefined })),
            terminals: [],
            activeTextEditor: undefined,
        },
        commands: {
            getCommands: vi.fn(async () => []),
            executeCommand: vi.fn(async () => undefined),
        },
        Uri: {
            file: (p: string) => ({ fsPath: p, scheme: 'file' }),
            joinPath: (_base: unknown, ...parts: string[]) => ({
                fsPath: parts.join('/'),
                scheme: 'file',
            }),
        },
        TerminalLocation: { Panel: 1, Editor: 2 },
        env: { shell: 'bash' },
        ExtensionContext: class {},
        Disposable: class { dispose() { /* no-op */ } },
    };
});

// ── Imports (after mocks — module receives stubbed vscode) ───────────────────

import { buildTerminalPrompt, buildResumePrompt } from './terminal-executor';
import { getHarnessAdapter } from './harness/harness-adapters';
harnessMockState.resolution = { kind: 'cli', adapter: getHarnessAdapter('pi')!, binary: 'pi', reason: 'test' };

// ── Tests ───────────────────────────────────────────────────────────────────

const SAMPLE_ARTIFACT = {
    type: 'story',
    id: 'STORY-1-1',
    title: 'Test story',
};
const SAMPLE_OUTPUT_FOLDER = '/workspace/.agileagentcanvas-context';

describe('buildTerminalPrompt — BMAD framing regression', () => {
    // ponytail: every test in this block exists because users kept hitting
    // "card stuck at in-progress" because the agent treated the verdict
    // JSON write as busywork instead of as the core deliverable. The fix
    // is structural — the verdict contract must be the FIRST instruction
    // the model sees, before the BMAD narrative overloads the context.
    // These tests pin that ordering.

    it('verdict contract appears in the FIRST 500 characters (model sees it on first read)', () => {
        const prompt = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );
        const head = prompt.slice(0, 500);
        expect(head).toMatch(/verdict/);
        expect(head).toMatch(/MUST/);
    });

    it('places the verdict contract BEFORE the BMAD workflow narrative', () => {
        const prompt = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );
        const verdictIdx = prompt.indexOf('verdict contract');
        const bmadIdx = prompt.indexOf('You are executing a BMAD methodology workflow');
        // ponytail: if either index is -1 the test fails — both must be present.
        expect(verdictIdx).toBeGreaterThan(-1);
        expect(bmadIdx).toBeGreaterThan(-1);
        expect(verdictIdx).toBeLessThan(bmadIdx);
    });

    it('the verdict file path appears in the first 500 chars (model can see it immediately)', () => {
        const prompt = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );
        const head = prompt.slice(0, 500);
        // The path includes the sanitized artifactId + workflowId.
        expect(head).toContain('STORY-1-1-dev-story-result.json');
    });

    it('sections the prompt with the canonical BMAD headers (no regression)', () => {
        const prompt = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );
        expect(prompt).toContain('## Workflow');
        expect(prompt).toContain('## Artifact Context');
        expect(prompt).toContain('## Instructions');
        expect(prompt).toContain('verdict');
    });

    it('produces identical output on repeated calls (purity contract)', () => {
        // A non-deterministic prompt would silently destabilise the
        // verdict-file polling loop and the cost estimator (which
        // captures promptLength). Locking down idempotence catches any
        // future refactor that accidentally introduces state.
        const a = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );
        const b = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );
        expect(a).toBe(b);
    });

    it('populates the workflow/artifact identification fields correctly', () => {
        const prompt = buildTerminalPrompt(
            'code-review',
            { type: 'review', id: 'CR-1' },
            SAMPLE_OUTPUT_FOLDER,
        );

        expect(prompt).toContain('**Workflow ID:** code-review');
        expect(prompt).toContain('**Artifact Type:** review');
        expect(prompt).toContain('**Artifact ID:** CR-1');
    });

    it('falls back to "unknown" labels when type and id are undefined', () => {
        // Use an empty object literal rather than a TS cast — exercises
        // the same fallback (artifact?.type || 'unknown') without the
        // `as unknown as` smell.
        const prompt = buildTerminalPrompt(
            'dev-story',
            { type: undefined, id: undefined } as unknown as Record<string, unknown>,
            SAMPLE_OUTPUT_FOLDER,
        );

        expect(prompt).toContain('**Artifact Type:** unknown');
        expect(prompt).toContain('**Artifact ID:** unknown');
    });

    it('renders the skillContent branch when provided', () => {
        const skillContent = [
            '## Step 1',
            'Read the artifact.',
            '## Step 2',
            'Apply review checklist.',
        ].join('\n');

        const prompt = buildTerminalPrompt(
            'code-review',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
            skillContent,
        );

        expect(prompt).toContain('## Workflow Definition (authoritative');
        expect(prompt).toContain('Step 1');
        expect(prompt).toContain('Apply review checklist.');
    });

    it('surfaces metadata.fixRequests verbatim from the artifact', () => {
        // The verdict-contract block asks the agent to "address EVERY
        // one before reporting completion" — so the prompt must
        // actually contain the fixRequests list. Locks down the
        // existing fixRequests handling contract.
        const artifactWithFixes = {
            type: 'story',
            id: 'STORY-3-1',
            title: 'Fresh from review',
            metadata: {
                fixRequests: [
                    'add unit tests for pagination edge case',
                    'handle null user object in /login',
                ],
            },
        };

        const prompt = buildTerminalPrompt(
            'dev-story',
            artifactWithFixes,
            SAMPLE_OUTPUT_FOLDER,
        );

        expect(prompt).toContain('add unit tests for pagination edge case');
        expect(prompt).toContain('handle null user object in /login');
        expect(prompt).toContain('address EVERY one');
    });
});

describe('buildTerminalPrompt — PONYTAIL_HEURISTICS regression guard', () => {
    it('concatenates the full PONYTAIL_HEURISTICS constant into the terminal prompt', () => {
        const prompt = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );

        // The constant must appear verbatim — partial inclusion or
        // stripped phrasing would silently degrade the discipline.
        expect(prompt).toContain(PONYTAIL_HEURISTICS);
    });

    it('preserves every mandatory hierarchy item', () => {
        const prompt = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );

        expect(prompt).toContain('## Ponytail'); // section header marker
        expect(prompt).toContain('1. **Necessity**');
        expect(prompt).toContain('2. **Standard Library**');
        expect(prompt).toContain('3. **Native Platform**');
        expect(prompt).toContain('4. **Existing Dependencies**');
        expect(prompt).toContain('5. **Simplicity**');
        expect(prompt).toContain('6. **Implementation**');
    });

    it('preserves the NOT-Lazy-About exception boundaries', () => {
        const prompt = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );

        expect(prompt).toContain('Input validation at trust boundaries');
        expect(prompt).toContain('Error handling that prevents data loss');
        expect(prompt).toContain('Security and accessibility');
        expect(prompt).toContain('Calibration required by real hardware');
        expect(prompt).toContain('Anything explicitly requested by the user');
    });

    it('preserves the verification rule (one-liner exemption included)', () => {
        const prompt = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );

        expect(prompt).toContain('Non-trivial logic MUST leave one runnable check');
        expect(prompt).toContain('Trivial one-liners require no test');
    });

    it('injects PONYTAIL alongside the skillContent branch', () => {
        const skillContent = '## Step 1\nVerify checklist.';

        const prompt = buildTerminalPrompt(
            'code-review',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
            skillContent,
        );

        expect(prompt).toContain(PONYTAIL_HEURISTICS);
        expect(prompt).toContain('Step 1');
        expect(prompt).toContain('Verify checklist.');
    });

    it('injects PONYTAIL even when artifact fields are undefined', () => {
        // Guard against "no artifact → no discipline" regressions.
        const prompt = buildTerminalPrompt(
            'dev-story',
            { type: undefined, id: undefined } as unknown as Record<string, unknown>,
            SAMPLE_OUTPUT_FOLDER,
        );

        expect(prompt).toContain(PONYTAIL_HEURISTICS);
        expect(prompt).toContain('**Artifact Type:** unknown');
    });
});

// ── Race-guard regression — VS Code terminal launch order ────────────────────
//
// Same class of bug that bit chat-bridge.sendToTerminal: on Windows/PowerShell,
// `vscode.window.createTerminal()` returns BEFORE the shell subprocess is
// attached to stdin. If `terminal.sendText(cmdLine, true)` fires synchronously
// after createTerminal, the typed text sits at the prompt without a CR/LF that
// PowerShell accepts as "submit" and the CLI agent never starts. The fix is
// to `await terminal.processId` BEFORE sendText — processId resolves once
// VS Code has spawned the shell subprocess.
//
// This is a structural, source-level test (cheap, deterministic, no need to
// mock the full TerminalExecutor surface area) that locks down the ordering
// invariant: a future refactor that accidentally reorders the two statements
// will fail this test, not silently reintroduce the PowerShell bug.

describe('TerminalExecutor — VS Code terminal race guard (structural)', () => {
    it('awaits terminal.processId BEFORE terminal.sendText (kanban-agentic-path PowerShell guard)', () => {
        const src = readFileSync(
            resolve(__dirname, 'terminal-executor.ts'),
            'utf-8',
        );

        // Narrow to the executeTerminalWorkflow method so any future
        // ptyBackend.write / spawnSession ordering elsewhere in the file
        // doesn't shadow the assertion.
        const methodStart = src.indexOf('async executeTerminalWorkflow');
        expect(methodStart).toBeGreaterThan(-1);
        const methodBody = src.slice(methodStart);

        // Locate both anchors within the method body. The search strings
        // include the trailing semicolon so prose documentation that
        // happens to mention the function signature (e.g. a comment
        // like "// `sendText(cmdLine, true)` …") cannot create a false
        // positive — only actual code statements end the call site with
        // a `;`. This is defense-in-depth alongside the more natural
        // choice of placing the test fix in the offender (the comment).
        const awaitPidIdx = methodBody.indexOf('pid = await terminal.processId;');
        const sendTextIdx = methodBody.indexOf('terminal.sendText(cmdLine, true);');

        expect(
            awaitPidIdx,
            'executeTerminalWorkflow must contain `pid = await terminal.processId` (the race guard)',
        ).toBeGreaterThan(-1);
        expect(
            sendTextIdx,
            'executeTerminalWorkflow must contain `terminal.sendText(cmdLine, true)`',
        ).toBeGreaterThan(-1);
        expect(
            awaitPidIdx,
            '`pid = await terminal.processId` MUST appear BEFORE `terminal.sendText(cmdLine, true)` ' +
            '— reverse the order reintroduces the kanban-agentic PowerShell launch race ' +
            '(matches chat-bridge.sendToTerminal: see that file\'s race-guard comment).',
        ).toBeLessThan(sendTextIdx);
    });
});

// ─── Synthetic verdict from workspace file diff ─────────────────────────────────────
// ponytail: regression for "agent ran but never wrote verdict JSON" → the
// orchestrator used to leave the card wedged in in-progress forever. Now
// executeAndAwaitVerdict observes file-system state and synthesizes
// COMPLETED from a real file diff. Asserts both directions.

import { mkdtempSync, writeFileSync, utimesSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('synthetic verdict from workspace file diff', () => {
    function setupFs() {
        const dir = mkdtempSync(join(tmpdir(), 'aac-synth-'));
        writeFileSync(join(dir, 'src.ts'), '// original\n');
        writeFileSync(join(dir, 'README.md'), '# hi\n');
        mkdirSync(join(dir, 'node_modules'), { recursive: true });
        writeFileSync(join(dir, 'node_modules', 'pkg.js'), '// noise\n');
        mkdirSync(join(dir, '.git'), { recursive: true });
        writeFileSync(join(dir, '.git', 'HEAD'), 'noise\n');
        mkdirSync(join(dir, '.vscode'), { recursive: true });
        writeFileSync(join(dir, '.vscode', 'settings.json'), 'noise\n');
        return dir;
    }

    it('ignores noise directories (.git, node_modules, .vscode)', () => {
        const dir = setupFs();
        try {
            const before = captureWorkspaceSnapshot(dir);
            utimesSync(join(dir, '.vscode', 'settings.json'), new Date(), new Date());
            const after = captureWorkspaceSnapshot(dir);
            const changed = diffWorkspaceSnapshots(before, after);
            expect(changed).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('flags modified source files as work-done', () => {
        const dir = setupFs();
        try {
            const before = captureWorkspaceSnapshot(dir);
            writeFileSync(join(dir, 'src.ts'), '// edited by agent\n');
            const after = captureWorkspaceSnapshot(dir);
            const changed = diffWorkspaceSnapshots(before, after);
            expect(changed).toContain('src.ts');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('flags new files as work-done', () => {
        const dir = setupFs();
        try {
            const before = captureWorkspaceSnapshot(dir);
            writeFileSync(join(dir, 'new-file.ts'), 'created\n');
            const after = captureWorkspaceSnapshot(dir);
            const changed = diffWorkspaceSnapshots(before, after);
            expect(changed).toContain('new-file.ts');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('flags deleted files as work-done', () => {
        const dir = setupFs();
        try {
            const before = captureWorkspaceSnapshot(dir);
            rmSync(join(dir, 'README.md'));
            const after = captureWorkspaceSnapshot(dir);
            const changed = diffWorkspaceSnapshots(before, after);
            expect(changed).toContain('README.md');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    // ponytail: regression for the user's "card wedged because synth fired
    // on tracker noise" bug. Extension rewrites concurrency-queue-state,
    // terminal-sessions, and trace buffers every time any agent runs — those
    // changes are NOT the agent's work and must be excluded from the synth.
    it('excludes extension internal state (.agileagentcanvas-context/concurrency-queue-state.json, terminal-sessions.json, traces/)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'aac-synth-internal-'));
        try {
            // Baseline with user epics + extension trackers
            mkdirSync(join(dir, '.agileagentcanvas-context', 'traces'), { recursive: true });
            mkdirSync(join(dir, '.agileagentcanvas-context', 'epics', 'epic-1', 'stories'), { recursive: true });
            writeFileSync(join(dir, '.agileagentcanvas-context', 'concurrency-queue-state.json'), '[]\n');
            writeFileSync(join(dir, '.agileagentcanvas-context', 'terminal-sessions.json'), '[]\n');
            writeFileSync(join(dir, '.agileagentcanvas-context', 'traces', 'harness.jsonl'), '\n');
            writeFileSync(join(dir, '.agileagentcanvas-context', 'epics', 'epic-1', 'stories', '1.1.json'), '{}');
            writeFileSync(join(dir, 'src.ts'), '// original\n');

            const before = captureWorkspaceSnapshot(dir);

            // Touch extension trackers — should NOT count as work-done
            const t1 = new Date();
            utimesSync(join(dir, '.agileagentcanvas-context', 'concurrency-queue-state.json'), t1, t1);
            utimesSync(join(dir, '.agileagentcanvas-context', 'terminal-sessions.json'), t1, t1);
            utimesSync(join(dir, '.agileagentcanvas-context', 'traces', 'harness.jsonl'), t1, t1);
            // Touch a USER story file — SHOULD count as work-done
            writeFileSync(join(dir, '.agileagentcanvas-context', 'epics', 'epic-1', 'stories', '1.1.json'), '{"status":"in-progress"}');
            // Touch a source file — SHOULD count as work-done. Force a
            // distinct mtime so the diff isn't lost to filesystem mtime
            // granularity (Windows FAT/NTFS sometimes hashes to the same
            // second when writes land in the same tick).
            utimesSync(join(dir, 'src.ts'), new Date(Date.now() + 5_000), new Date(Date.now() + 5_000));

            const after = captureWorkspaceSnapshot(dir);
            const changed = diffWorkspaceSnapshots(before, after);
            expect(changed).not.toContain('.agileagentcanvas-context/concurrency-queue-state.json');
            expect(changed).not.toContain('.agileagentcanvas-context/terminal-sessions.json');
            expect(changed.every(f => !f.startsWith('.agileagentcanvas-context/traces/'))).toBe(true);
            expect(changed).toContain('.agileagentcanvas-context/epics/epic-1/stories/1.1.json');
            expect(changed).toContain('src.ts');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

// ─── Harness launch (prompt staging + adapter command lines) ─────────────────
// Every harness run stages its prompt to a private file under
// <outputFolder>/_terminal-output/prompts and the terminal receives a SHORT
// command (stdin redirect or pointer argument). Adapter flags and cross-shell
// delivery are covered by src/workflow/harness/*.test.ts.

function makeTerminal() {
    const sendTextMock = vi.fn();
    const terminalObj = {
        name: 'AAC: test',
        show: vi.fn(),
        sendText: sendTextMock,
        dispose: vi.fn(),
        processId: Promise.resolve(4242),
        onDidWriteData: vi.fn(() => ({ dispose: vi.fn() })),
    };
    vi.mocked(window.createTerminal).mockImplementationOnce(() => terminalObj as any);
    return { terminalObj, sendTextMock };
}

function withWorkspace<T>(fn: (outputFolder: string) => Promise<T>): Promise<T> {
    const wsDir = mkdtempSync(join(tmpdir(), 'aac-termx-'));
    harnessMockState.outputFolder = join(wsDir, '.agileagentcanvas-context');
    return fn(harnessMockState.outputFolder).finally(() => {
        harnessMockState.outputFolder = '.agileagentcanvas-context';
        rmSync(wsDir, { recursive: true, force: true });
    });
}

const cli = (id: string) => ({
    kind: 'cli', adapter: getHarnessAdapter(id)!, binary: getHarnessAdapter(id)!.binaries[0], reason: 'test',
});

describe('executeTerminalWorkflow — harness launch', () => {
    afterEach(() => {
        harnessMockState.resolution = cli('pi');
        vi.mocked(window.createTerminal).mockClear();
    });

    it('stdin harness: stages the prompt privately, sends a short stdin command, cleans up on close', async () => {
        await withWorkspace(async (outputFolder) => {
            const { terminalObj, sendTextMock } = makeTerminal();
            const executor = new TerminalExecutor();
            const longBody = 'B'.repeat(9000);
            await executor.executeTerminalWorkflow('epic-enhancement', { id: 'EPIC-LONG', type: 'epic', description: longBody }, {});

            expect(sendTextMock).toHaveBeenCalledTimes(1);
            const cmd = sendTextMock.mock.calls[0][0] as string;
            expect(cmd.length).toBeLessThan(400);
            expect(cmd).toMatch(/^pi --no-session --tools 'read,write,edit' -p < '?.*_terminal-output\/prompts\/EPIC-LONG-/);
            expect(cmd).not.toContain(longBody.slice(0, 100));

            const session = executor.getTerminalSession('EPIC-LONG')!;
            expect(session.promptFile!.startsWith(join(outputFolder, '_terminal-output', 'prompts'))).toBe(true);
            expect(readFileSync(session.promptFile!, 'utf-8')).toContain(longBody);

            (executor as any).onDidCloseTerminal(terminalObj);
            expect(existsSync(session.promptFile!)).toBe(false);
        });
    });

    it('short prompts are staged too: prompt text never travels on the command line', async () => {
        await withWorkspace(async () => {
            const { sendTextMock } = makeTerminal();
            await new TerminalExecutor().executeTerminalWorkflow('dev-story', { id: 'S-1', type: 'story', description: 'tiny-marker' }, {});
            const cmd = sendTextMock.mock.calls[0][0] as string;
            expect(cmd).not.toContain('tiny-marker');
            expect(cmd).toContain('_terminal-output/prompts/S-1-');
        });
    });

    it('pointer harness (gemini): passes a short instruction naming the prompt file', async () => {
        harnessMockState.resolution = cli('gemini');
        await withWorkspace(async () => {
            const { sendTextMock } = makeTerminal();
            await new TerminalExecutor().executeTerminalWorkflow('dev-story', { id: 'S-2', type: 'story' }, {});
            const cmd = sendTextMock.mock.calls[0][0] as string;
            expect(cmd).toMatch(/^gemini --approval-mode auto_edit -p 'Read the file .*_terminal-output\/prompts\/S-2-/);
            expect(cmd).not.toContain('<');
        });
    });

    it('no harness: no terminal is created and the run is BLOCKED with the reason', async () => {
        harnessMockState.resolution = { kind: 'none', message: 'No coding-agent harness found. Install it.' };
        await withWorkspace(async () => {
            const executor = new TerminalExecutor();
            expect(await executor.executeTerminalWorkflow('dev-story', { id: 'S-3' }, {})).toBeUndefined();
            const verdict = await executor.executeAndAwaitVerdict('dev-story', { id: 'S-3' }, {});
            expect(verdict).toEqual({ verdict: 'BLOCKED', summary: 'No coding-agent harness found. Install it.' });
            expect(window.createTerminal).not.toHaveBeenCalled();
        });
    });

    it('language-model fallback: uses the runner verdict, or BLOCKS when the caller has no runner', async () => {
        harnessMockState.resolution = { kind: 'lm', reason: 'test' };
        await withWorkspace(async () => {
            const executor = new TerminalExecutor();
            const lmRunner = vi.fn(async () => ({ verdict: 'COMPLETED' as const, summary: 'via LM' }));
            expect(await executor.executeAndAwaitVerdict('dev-story', { id: 'S-4' }, {}, { lmRunner }))
                .toEqual({ verdict: 'COMPLETED', summary: 'via LM' });
            expect(lmRunner).toHaveBeenCalledTimes(1);
            expect((await executor.executeAndAwaitVerdict('dev-story', { id: 'S-4' }, {})).verdict).toBe('BLOCKED');
            expect(window.createTerminal).not.toHaveBeenCalled();
        });
    });
});

describe('executeTerminalWorkflow — assigned agent', () => {
    afterEach(() => {
        harnessMockState.resolution = cli('pi');
        harnessMockState.override = undefined;
        vi.mocked(window.createTerminal).mockClear();
    });

    it("runs a card on its assignee's harness and names the agent in run history", async () => {
        harnessMockState.resolution = { kind: 'lm', reason: 'test' };
        await withWorkspace(async (outputFolder) => {
            mkdirSync(outputFolder, { recursive: true });
            writeFileSync(join(outputFolder, 'agent-team.json'), JSON.stringify({
                agents: [{ id: 'reviewer', name: 'Reviewer', harness: 'codex' }],
                assignments: { 'S-7': 'reviewer' },
            }));
            const lmRunner = async () => ({ verdict: 'COMPLETED' as const, summary: 'ok' });
            await new TerminalExecutor().executeAndAwaitVerdict('dev-story', { id: 'S-7' }, {}, { lmRunner });
            expect(harnessMockState.override).toBe('codex');
            const [entry] = readFileSync(join(outputFolder, 'agent-run-history.jsonl'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
            expect(entry).toMatchObject({ artifactId: 'S-7', agent: 'Reviewer' });
        });
    });

    it("launches the assignee's CLI with the assignee's model", async () => {
        harnessMockState.resolution = cli('pi');
        await withWorkspace(async (outputFolder) => {
            mkdirSync(outputFolder, { recursive: true });
            writeFileSync(join(outputFolder, 'agent-team.json'), JSON.stringify({
                agents: [{ id: 'qa', name: 'QA', harness: 'pi', model: 'anthropic/claude-haiku-4-5' }],
                assignments: { 'S-9': 'qa' },
            }));
            const { sendTextMock } = makeTerminal();
            await new TerminalExecutor().executeTerminalWorkflow('dev-story', { id: 'S-9', type: 'story' }, {});
            expect(harnessMockState.override).toBe('pi');
            expect(sendTextMock.mock.calls[0][0]).toContain("--model 'anthropic/claude-haiku-4-5'".replace(/'/g, ''));
        });
    });

    it("puts the assignee's brief right after the verdict contract, with the card's notes", async () => {
        harnessMockState.resolution = cli('pi');
        await withWorkspace(async (outputFolder) => {
            mkdirSync(outputFolder, { recursive: true });
            writeFileSync(join(outputFolder, 'agent-team.json'), JSON.stringify({
                agents: [
                    { id: 'qa', name: 'QA', harness: 'pi', role: 'Tests stories', instructions: 'Run the e2e suite.' },
                    { id: 'dev', name: 'Dev', harness: 'claude' },
                ],
                assignments: { 'S-10': 'qa' },
            }));
            makeTerminal();
            const executor = new TerminalExecutor();
            await executor.executeTerminalWorkflow('dev-story', {
                id: 'S-10', type: 'story', metadata: { agentNotes: [{ author: 'Dev', text: 'Form is in login.tsx', at: 't' }] },
            }, {});
            const prompt = readFileSync(executor.getTerminalSession('S-10')!.promptFile!, 'utf-8');
            expect(prompt.indexOf('## ⛔ Required first action')).toBe(0);
            expect(prompt.indexOf('## You and this board')).toBeLessThan(prompt.indexOf('# BMAD Workflow Run'));
            expect(prompt).toContain('You are **QA** (agent id `qa`), running on Pi CLI. Your role: Tests stories.');
            expect(prompt).toContain('Run the e2e suite.');
            expect(prompt).toContain('- `dev` — Dev');
            expect(prompt).toContain('- Dev (t): Form is in login.tsx');
        });
    });

    it('uses the board default for an unassigned card', async () => {
        harnessMockState.resolution = { kind: 'lm', reason: 'test' };
        await withWorkspace(async () => {
            await new TerminalExecutor().executeAndAwaitVerdict('dev-story', { id: 'S-8' }, {}, { lmRunner: async () => ({ verdict: 'COMPLETED' as const, summary: 'ok' }) });
            expect(harnessMockState.override).toBeUndefined();
        });
    });
});

describe('executeTerminalWorkflow — workspace trust', () => {
    afterEach(() => { harnessMockState.trustBlock = undefined; });

    it('Restricted Mode blocks agent runs before any harness is resolved or terminal created', async () => {
        harnessMockState.trustBlock = 'Agent runs are disabled in Restricted Mode.';
        const lmRunner = vi.fn();
        const verdict = await new TerminalExecutor().executeAndAwaitVerdict('dev-story', { id: 'S-9' }, {}, { lmRunner });
        expect(verdict).toEqual({ verdict: 'BLOCKED', summary: 'Agent runs are disabled in Restricted Mode.' });
        expect(lmRunner).not.toHaveBeenCalled();
        expect(window.createTerminal).not.toHaveBeenCalled();
    });
});

describe('outputTail', () => {
    it('keeps the last lines without ANSI colour codes, so a missing verdict can say why', async () => {

        const raw = 'noise\n'.repeat(50) + '\u001b[91m\u001b[1mError: \u001b[0mThis API key has expired.\r\n\r\n';
        expect(outputTail(raw).endsWith('Error: This API key has expired.')).toBe(true);
        expect(outputTail(raw)).not.toContain('\u001b');
        expect(outputTail(undefined)).toBe('');
    });
});

describe('executeTerminalWorkflow — run journal', () => {
    it('journals a CLI run at launch (with its revert column) and clears it when the terminal ends', async () => {
        await withWorkspace(async (outputFolder) => {
            const { terminalObj } = makeTerminal();
            const executor = new TerminalExecutor();
            await executor.executeTerminalWorkflow('dev-story', { id: 'S-J', type: 'story' }, {}, { revertStatusOnInterrupt: 'ready-for-dev' });
            const journalFile = join(outputFolder, 'agent-runs.json');
            const records = JSON.parse(readFileSync(journalFile, 'utf-8'));
            expect(records).toEqual([expect.objectContaining({ artifactId: 'S-J', workflowId: 'dev-story', revertTo: 'ready-for-dev', terminalName: 'AAC: dev-story S-J' })]);

            (executor as any).onDidCloseTerminal(terminalObj);
            expect(JSON.parse(readFileSync(journalFile, 'utf-8'))).toEqual([]);
        });
    });
});

describe('buildResumePrompt — continuation turn for a resumed card session', () => {
    const artifact = { ...SAMPLE_ARTIFACT, metadata: { fixRequests: ['Add a test for the empty list'] } };

    it('opens with the verdict contract carrying the new path and run id', () => {
        const prompt = buildResumePrompt('dev-story', artifact, SAMPLE_OUTPUT_FOLDER, 'term-run-2');
        expect(prompt.slice(0, 500)).toMatch(/verdict contract/);
        expect(prompt).toContain('"run_id": "term-run-2"');
        expect(prompt).toContain('STORY-1-1');
    });

    it('carries the current card, including its fix requests', () => {
        expect(buildResumePrompt('dev-story', artifact, SAMPLE_OUTPUT_FOLDER)).toContain('Add a test for the empty list');
    });

    it('does not resend the brief the conversation already holds', () => {
        const full = buildTerminalPrompt('dev-story', artifact, SAMPLE_OUTPUT_FOLDER, 'SKILL BODY', 'r', 'PROJECT CONTEXT');
        const resumed = buildResumePrompt('dev-story', artifact, SAMPLE_OUTPUT_FOLDER, 'r');
        expect(resumed).not.toContain(PONYTAIL_HEURISTICS);
        expect(resumed).not.toContain('Workflow Definition');
        expect(resumed.length).toBeLessThan(full.length / 2);
    });
});
