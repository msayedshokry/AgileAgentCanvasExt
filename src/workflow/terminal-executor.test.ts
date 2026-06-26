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

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PONYTAIL_HEURISTICS } from '../chat/ponytail-heuristics';

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

import { buildTerminalPrompt } from './terminal-executor';

// ── Tests ───────────────────────────────────────────────────────────────────

const SAMPLE_ARTIFACT = {
    type: 'story',
    id: 'STORY-1-1',
    title: 'Test story',
};
const SAMPLE_OUTPUT_FOLDER = '/workspace/.agileagentcanvas-context';

describe('buildTerminalPrompt — BMAD framing regression', () => {
    it('starts with the BMAD terminal-agent role sentence (no regression)', () => {
        const prompt = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );

        expect(prompt).toContain(
            'You are executing a BMAD methodology workflow as a headless terminal agent',
        );
    });

    it('sections the prompt with the canonical BMAD headers', () => {
        const prompt = buildTerminalPrompt(
            'dev-story',
            SAMPLE_ARTIFACT,
            SAMPLE_OUTPUT_FOLDER,
        );

        // Stable substrings — drop the em-dash literal so a future
        // em-dash → en-dash refactor doesn't break the contract test.
        expect(prompt).toContain('## Workflow');
        expect(prompt).toContain('## Artifact Context');
        expect(prompt).toContain('## Instructions');
        expect(prompt).toContain('## Important');
        expect(prompt).toContain('verdict contract');
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
