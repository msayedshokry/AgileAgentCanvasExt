/**
 * Regression test — Bug class: card actions triggered from the canvas view
 * (NOT just the kanban view) silently failed. Card actions posted from
 * `ArtifactCard.tsx` and `AgenticDetailPanel.tsx` flow into whichever
 * webview host is rendering them — and the canvas view ONLY delegated
 * to `handleCommonWebviewMessage`, not `handleAgenticKanbanMessage`.
 *
 * Specifically, `visualPlan:generate`, `kanban:statusChanged`,
 * `kanban:jumpToTerminal`, `kanban:fetchAgentInfo`, etc. all came from
 * `ArtifactCard.tsx` and family, so a Visual Plan button on a canvas-card
 * would create a JSON stub and then go nowhere.
 *
 * The fix delegates BOTH handlers before the host-specific local switch —
 * same pattern already used in `agentic-kanban-view-provider.ts`. This
 * test mirrors the kanban view's test for dispatch ordering and
 * non-double-routing.
 *
 * Note: `vi.mock(...)` factories are hoisted to the top of the file by
 * Vitest, BEFORE any module-level declarations run. All mock factories
 * must be self-contained — they CANNOT reference variables declared
 * later in the file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    WebviewPanel: class {},
    ViewColumn: { Beside: -2 },
}));

// Mock the delegated handlers so we can spy on them WITHOUT pulling in
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

// Mock the artifact store / buildArtifacts / project loaders — all
// factories are self-contained (no outer-scope references).
vi.mock('../state/artifact-store', () => ({
    ArtifactStore: class {
        onDidChangeArtifacts = () => ({ dispose: () => undefined });
        getState = () => ({ epics: [] });
        getSelectedArtifact = () => undefined;
        setSelectedArtifact = () => undefined;
        getLoadValidationIssues = () => [];
        clearSelection = () => undefined;
        findArtifactById = () => undefined;
    },
}));

vi.mock('../canvas/artifact-transformer', () => ({
    buildArtifacts: () => [],
}));

vi.mock('../commands/artifact-commands', () => ({
    loadElicitationMethods: () => [],
    loadBmmWorkflows: () => [],
}));

vi.mock('../commands/project-commands', () => ({
    loadSampleProject: () => Promise.resolve(),
}));

// Now import the module under test (after mocks are established).
import * as vscode from 'vscode';
import { AgileAgentCanvasViewProvider } from './canvas-view-provider';
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

describe('AgileAgentCanvasViewProvider — message dispatch (regression: card actions from canvas)', () => {
    let provider: AgileAgentCanvasViewProvider;

    beforeEach(() => {
        handleAgenticKanbanMessageMock.mockReset().mockResolvedValue(false);
        handleCommonWebviewMessageMock.mockReset().mockResolvedValue(false);
        // The provider constructor calls `store.onDidChangeArtifacts(...)` and
        // the local switch case `selectArtifact` calls `setSelectedArtifact`.
        // Pass minimal stubs so the test surfaces undefined-method bugs loudly.
        const fakeStore = {
            onDidChangeArtifacts: () => ({ dispose: () => undefined }),
            setSelectedArtifact: () => undefined,
            clearSelection: () => undefined,
        };
        provider = new AgileAgentCanvasViewProvider(
            vscode.Uri.file('/mock/uri'),
            fakeStore as never,
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('routes visualPlan:generate from canvas card → handleAgenticKanbanMessage', async () => {
        // The fix: canvas view delegates to handleAgenticKanbanMessage BEFORE
        // handleCommonWebviewMessage, so visualPlan:* / kanban:* messages
        // from canvas cards no longer fall through.
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

        // Assert dispatch ORDER: agentic first, common NOT consulted
        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
        expect(
            (handleAgenticKanbanMessageMock.mock.calls[0][0] as { type: string })
                .type,
        ).toBe('visualPlan:generate');
    });

    it('routes kanban:statusChanged from canvas card → handleAgenticKanbanMessage', async () => {
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

        await fakeView._send({
            type: 'kanban:statusChanged',
            artifactId: 'epic-1',
            fromStatus: 'backlog',
            toStatus: 'in-progress',
            artifactType: 'epic',
        });

        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(
            (handleAgenticKanbanMessageMock.mock.calls[0][0] as { type: string })
                .type,
        ).toBe('kanban:statusChanged');
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
    });

    it('routes canvas card startDevelopment → handleCommonWebviewMessage (after agentic declines)', async () => {
        // Agentic says "not mine", common says "yes"
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

        // Both handlers consulted, common handled it
        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(handleCommonWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(
            (handleCommonWebviewMessageMock.mock.calls[0][0] as { type: string })
                .type,
        ).toBe('startDevelopment');
    });

    it('falls through to local switch when both handlers decline (no crash)', async () => {
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

        // 'selectArtifact' is handled in the local switch — must not throw
        await expect(
            fakeView._send({ type: 'selectArtifact', id: 'epic-1' }),
        ).resolves.toBeUndefined();

        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(handleCommonWebviewMessageMock).toHaveBeenCalledTimes(1);
    });

    it('handleCommonWebviewMessage is invoked with the canvas log prefix', async () => {
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
        expect(callArgs[3]).toBe('[CanvasProvider]');
    });
});
