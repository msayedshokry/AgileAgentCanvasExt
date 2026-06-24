/**
 * Regression test — Bug: clicking any card action in the Agentic Kanban view
 * did nothing. Root cause: `AgenticKanbanViewProvider.onDidReceiveMessage`
 * only delegated to `handleAgenticKanbanMessage` and fell through to a default
 * local switch that handles only `agenticKanbanReady` — every other card
 * action (`startDevelopment`, `startDocumentation`, `refineWithAI`,
 * `breakDown`, `updateArtifact`, `deleteArtifact`, jira actions, …) was
 * silently dropped.
 *
 * The fix delegates to `handleCommonWebviewMessage` between the agentic
 * handler and the view-specific switch — mirroring what the main canvas
 * webview panel does.
 *
 * Note: `vi.mock(...)` factories are hoisted to the top of the file by
 * Vitest, BEFORE any module-level declarations run. So all mock factories
 * here must be self-contained — they CANNOT reference variables declared
 * later in the file. Use literal values directly inside the factory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode BEFORE importing the module under test (vi.mock is hoisted).
vi.mock('vscode', () => ({
    Uri: {
        joinPath: (..._parts: unknown[]) => ({ fsPath: '/mock/uri', path: '/mock/uri' }),
        file: (p: string) => ({ fsPath: p, path: p }),
    },
    workspace: {
        workspaceFolders: undefined,
        getConfiguration: () => ({
            get: (_k: string, d?: unknown) => d,
            update: () => Promise.resolve(),
        }),
    },
    window: {
        createTerminal: () => ({
            show: () => undefined,
            sendText: () => undefined,
            dispose: () => undefined,
        }),
        onDidCloseTerminal: () => ({ dispose: () => undefined }),
        showInputBox: () => Promise.resolve(undefined),
        showInformationMessage: () => Promise.resolve(undefined),
        showErrorMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        withProgress: (_o: unknown, task: () => Promise<unknown>) => task(),
    },
    env: {
        appName: 'Visual Studio Code',
        clipboard: { writeText: () => Promise.resolve() },
    },
    commands: {
        executeCommand: () => Promise.resolve(undefined),
        getCommands: () => Promise.resolve([] as string[]),
    },
    EventEmitter: class {
        private listeners: Array<(arg: unknown) => void> = [];
        event = (listener: (arg: unknown) => void) => {
            this.listeners.push(listener);
            return { dispose: () => undefined };
        };
        fire = (arg: unknown) => {
            for (const l of this.listeners) l(arg);
        };
        dispose = () => undefined;
    },
    ProgressLocation: { Notification: 15 },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    RelativePattern: class {},
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
}));

// Mock the two delegated handlers so we can spy on them WITHOUT pulling in
// the full transitive dependency graph (ArtifactStore, schema-validator, …).
const handleAgenticKanbanMessageMock = vi.fn().mockResolvedValue(false);
const handleCommonWebviewMessageMock = vi.fn().mockResolvedValue(false);

vi.mock('./agentic-kanban-message-handler', () => ({
    handleAgenticKanbanMessage: (...a: unknown[]) =>
        handleAgenticKanbanMessageMock(...a),
    disposeAllTerminalStreams: () => undefined,
}));

vi.mock('./webview-message-handler', () => ({
    handleCommonWebviewMessage: (...a: unknown[]) =>
        handleCommonWebviewMessageMock(...a),
}));

// Mock the artifact store / orchestrator deps — all factories are self-
// contained (no outer-scope references) to satisfy vi.mock hoisting.
vi.mock('../state/artifact-store', () => ({
    ArtifactStore: class {
        onDidChangeArtifacts = () => ({ dispose: () => undefined });
        getState = () => ({ epics: [] });
        findArtifactById = () => undefined;
    },
}));

vi.mock('../canvas/artifact-transformer', () => ({
    buildArtifacts: () => ({ all: [], getEpics: () => [] }),
}));

vi.mock('../chat/active-session', () => ({
    getActiveChatSession: () => undefined,
}));

vi.mock('../workflow/kanban-orchestrator', () => ({
    kanbanProgress: { event: () => ({ dispose: () => undefined }) },
}));

vi.mock('../workflow/kanban-settings', () => ({
    setKanbanAutoAdvance: () => Promise.resolve(),
    isKanbanAutoAdvanceEnabled: () => false,
    getKanbanWipLimits: () => ({ inProgress: 3, inReview: 2, done: 999 }),
}));

// Now import the module under test (after mocks are established).
import * as vscode from 'vscode';
import { AgenticKanbanViewProvider } from './agentic-kanban-view-provider';
import { handleAgenticKanbanMessage } from './agentic-kanban-message-handler';
import { handleCommonWebviewMessage } from './webview-message-handler';

interface MockMessageHandler {
    dispose(): void;
}

function makeFakeWebviewView() {
    const postMessageMock = vi.fn().mockResolvedValue(true);
    let messageHandler: ((m: unknown) => Promise<unknown>) | undefined;

    const webview = {
        options: {},
        html: '',
        postMessage: postMessageMock,
        onDidReceiveMessage: vi.fn(
            (fn: (m: unknown) => Promise<unknown>): MockMessageHandler => {
                messageHandler = fn;
                return { dispose: () => undefined };
            },
        ),
        asWebviewUri: (uri: unknown) => uri,
        cspSource: 'vscode-resource://mock',
    };

    return {
        webview,
        visible: true,
        onDidChangeVisibility: (_cb: () => void): { dispose: () => void } => ({
            dispose: () => undefined,
        }),
        onDidDispose: (_cb: () => void): { dispose: () => void } => ({
            dispose: () => undefined,
        }),
        _send(msg: unknown) {
            if (!messageHandler) throw new Error('message handler not registered');
            return messageHandler(msg);
        },
    };
}

describe('AgenticKanbanViewProvider — message dispatch (regression: all card actions)', () => {
    let provider: AgenticKanbanViewProvider;

    beforeEach(() => {
        handleAgenticKanbanMessageMock.mockReset().mockResolvedValue(false);
        handleCommonWebviewMessageMock.mockReset().mockResolvedValue(false);
        // The provider constructor calls `store.onDidChangeArtifacts(…)` and
        // listens for kanbanProgress events. Pass a minimal stub that has
        // just the methods exercised in this test — keeps the runtime
        // surface tight and makes undefined calls fail the test loudly.
        const fakeStore = {
            onDidChangeArtifacts: () => ({ dispose: () => undefined }),
        };
        provider = new AgenticKanbanViewProvider(
            vscode.Uri.file('/mock/uri'),
            fakeStore as never,
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('delegates card action (startDevelopment) → handleCommonWebviewMessage', async () => {
        // Arrange: agentic handler says "not mine", common handler says "yes"
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(false);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(true);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (
                wv: unknown,
                ctx: unknown,
                token: unknown,
            ) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await fakeView._send({ type: 'startDevelopment', artifact: { id: 'E1' } });

        // Assert — both handlers were consulted (kanban first, common second)
        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(handleCommonWebviewMessageMock).toHaveBeenCalledTimes(1);
        const forwarded = handleCommonWebviewMessageMock.mock.calls[0][0] as {
            type: string;
        };
        expect(forwarded.type).toBe('startDevelopment');
    });

    it('handles refineWithAI by delegating to handleCommonWebviewMessage', async () => {
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(false);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(true);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (
                wv: unknown,
                ctx: unknown,
                token: unknown,
            ) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await fakeView._send({ type: 'refineWithAI', artifact: { id: 'E1' } });

        expect(handleCommonWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(
            (handleCommonWebviewMessageMock.mock.calls[0][0] as { type: string })
                .type,
        ).toBe('refineWithAI');
    });

    it('tolerates unknown card message (does not crash the provider)', async () => {
        // Both handlers decline → message must not crash the provider
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(false);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(false);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (
                wv: unknown,
                ctx: unknown,
                token: unknown,
            ) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await expect(
            fakeView._send({ type: 'someUnknownCardAction' }),
        ).resolves.toBeUndefined();

        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(handleCommonWebviewMessageMock).toHaveBeenCalledTimes(1);
    });

    it('agentic-kanban case (visualPlan:generate) still early-returns at the kanban handler', async () => {
        // Visual-plan is owned by the kanban handler — common handler should
        // NOT be consulted in this case (kanban returns true → early return).
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(true);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(false);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (
                wv: unknown,
                ctx: unknown,
                token: unknown,
            ) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await fakeView._send({ type: 'visualPlan:generate', goal: 'test' });

        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
    });

    it('handleCommonWebviewMessage is invoked with the kanban-specific log prefix', async () => {
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(false);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(true);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (
                wv: unknown,
                ctx: unknown,
                token: unknown,
            ) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await fakeView._send({ type: 'breakDown', artifact: { id: 'S1' } });

        const callArgs = handleCommonWebviewMessageMock.mock.calls[0];
        // Signature: (message, store, extensionUri, logPrefix, webview)
        expect(callArgs[0]).toEqual({ type: 'breakDown', artifact: { id: 'S1' } });
        expect(callArgs[3]).toBe('[AgenticKanban]');
    });

});
