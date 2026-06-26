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
        createWebviewPanel: vi.fn((_viewType: string, _title: string, _column: unknown, _options: unknown) => {
            const panel = {
                webview: {
                    options: {},
                    html: '',
                    postMessage: vi.fn(),
                    onDidReceiveMessage: vi.fn((fn: (m: unknown) => Promise<unknown>) => {
                        detailTabMessageHandler = fn;
                        return { dispose: () => undefined };
                    }),
                    asWebviewUri: (uri: unknown) => uri,
                    cspSource: 'vscode-resource://mock',
                },
                onDidDispose: vi.fn((_fn: () => void) => ({ dispose: () => undefined })),
                reveal: vi.fn(),
                dispose: vi.fn(),
            };
            return panel;
        }),
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
const handleCatalogueWebviewMessageMock = vi.fn().mockResolvedValue(false);

// Captured detail-tab message handler (set by the createWebviewPanel mock
// when openDetailTab registers its onDidReceiveMessage listener).
let detailTabMessageHandler: ((m: unknown) => Promise<unknown>) | undefined;

vi.mock('./agentic-kanban-message-handler', () => ({
    handleAgenticKanbanMessage: (...a: unknown[]) =>
        handleAgenticKanbanMessageMock(...a),
    disposeAllTerminalStreams: () => undefined,
}));

vi.mock('./webview-message-handler', () => ({
    handleCatalogueWebviewMessage: (...a: unknown[]) =>
        handleCatalogueWebviewMessageMock(...a),
    handleCommonWebviewMessage: (...a: unknown[]) =>
        handleCommonWebviewMessageMock(...a),
}));

// Mock fs so getDetailTabHtml() → getFallbackHtml() without touching disk.
vi.mock('fs', () => ({
    default: { existsSync: () => false },
    existsSync: () => false,
}));

vi.mock('path', () => ({
    default: { join: (...parts: string[]) => parts.join('/') },
    join: (...parts: string[]) => parts.join('/'),
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
import { handleCommonWebviewMessage, handleCatalogueWebviewMessage } from './webview-message-handler';

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
        handleCatalogueWebviewMessageMock.mockReset().mockResolvedValue(false);
        handleAgenticKanbanMessageMock.mockReset().mockResolvedValue(false);
        handleCommonWebviewMessageMock.mockReset().mockResolvedValue(false);
        detailTabMessageHandler = undefined;
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

describe('AgileAgentCanvasViewProvider — catalogue message dispatch (sidebar view)', () => {
    let provider: AgileAgentCanvasViewProvider;

    beforeEach(() => {
        handleCatalogueWebviewMessageMock.mockReset().mockResolvedValue(false);
        handleAgenticKanbanMessageMock.mockReset().mockResolvedValue(false);
        handleCommonWebviewMessageMock.mockReset().mockResolvedValue(false);
        detailTabMessageHandler = undefined;
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

    it('dispatches getChatProviders to handleCatalogueWebviewMessage first', async () => {
        // Catalogue handler claims the message — agentic + common must NOT be consulted.
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(true);
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(false);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(false);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (wv: unknown, ctx: unknown, token: unknown) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await fakeView._send({ type: 'getChatProviders' });

        expect(handleCatalogueWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(handleAgenticKanbanMessageMock).not.toHaveBeenCalled();
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
        expect(
            (handleCatalogueWebviewMessageMock.mock.calls[0][0] as { type: string }).type,
        ).toBe('getChatProviders');
    });

    it('dispatches selectChatProvider to handleCatalogueWebviewMessage first', async () => {
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(true);
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(false);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(false);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (wv: unknown, ctx: unknown, token: unknown) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await fakeView._send({ type: 'selectChatProvider', providerId: 'codex' });

        expect(handleCatalogueWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(handleAgenticKanbanMessageMock).not.toHaveBeenCalled();
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
        const msg = handleCatalogueWebviewMessageMock.mock.calls[0][0] as { type: string; providerId: string };
        expect(msg.type).toBe('selectChatProvider');
        expect(msg.providerId).toBe('codex');
    });

    it('dispatches openChatWithProvider to handleCatalogueWebviewMessage first', async () => {
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(true);
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(false);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(false);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (wv: unknown, ctx: unknown, token: unknown) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await fakeView._send({ type: 'openChatWithProvider', provider: 'pi', query: 'refine' });

        expect(handleCatalogueWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(handleAgenticKanbanMessageMock).not.toHaveBeenCalled();
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
        const msg = handleCatalogueWebviewMessageMock.mock.calls[0][0] as { type: string; provider: string; query: string };
        expect(msg.type).toBe('openChatWithProvider');
        expect(msg.provider).toBe('pi');
        expect(msg.query).toBe('refine');
    });

    it('falls through to agentic-kanban when catalogue declines (not a catalogue message)', async () => {
        // Catalogue says "not mine", agentic says "yes"
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(false);
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(true);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(false);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (wv: unknown, ctx: unknown, token: unknown) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await fakeView._send({ type: 'visualPlan:generate', goal: 'test' });

        // Dispatch order: catalogue consulted, then agentic handles it
        expect(handleCatalogueWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
    });

    it('preserves the zero-first dispatch order: catalogue → agentic → common', async () => {
        // All three are consulted in order; common handles it.
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(false);
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(false);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(true);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (wv: unknown, ctx: unknown, token: unknown) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await fakeView._send({ type: 'enhanceWithAI', artifact: { id: 'E1' } });

        // All three consulted
        expect(handleCatalogueWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(handleCommonWebviewMessageMock).toHaveBeenCalledTimes(1);

        // Order check: catalogue called before agentic, agentic called before common.
        // Vitest records mock invocation order via mock.invocationCallOrder.
        const catOrder = handleCatalogueWebviewMessageMock.mock.invocationCallOrder[0];
        const agentOrder = handleAgenticKanbanMessageMock.mock.invocationCallOrder[0];
        const commonOrder = handleCommonWebviewMessageMock.mock.invocationCallOrder[0];
        expect(catOrder).toBeLessThan(agentOrder);
        expect(agentOrder).toBeLessThan(commonOrder);
    });

    it('passes the correct webview instance to handleCatalogueWebviewMessage', async () => {
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(true);

        const fakeView = makeFakeWebviewView();
        (provider as unknown as {
            resolveWebviewView: (wv: unknown, ctx: unknown, token: unknown) => void;
        }).resolveWebviewView(fakeView, {}, {});

        await fakeView._send({ type: 'getChatProviders' });

        // Second argument is the webview instance
        const callArgs = handleCatalogueWebviewMessageMock.mock.calls[0];
        expect(callArgs[0]).toEqual({ type: 'getChatProviders' });
        // callArgs[1] should be the webview — verify it has postMessage
        expect(typeof callArgs[1]).toBe('object');
        expect(callArgs[1]).toHaveProperty('postMessage');
    });
});

describe('AgileAgentCanvasViewProvider — catalogue message dispatch (detail tab)', () => {
    let provider: AgileAgentCanvasViewProvider;

    beforeEach(() => {
        handleCatalogueWebviewMessageMock.mockReset().mockResolvedValue(false);
        handleAgenticKanbanMessageMock.mockReset().mockResolvedValue(false);
        handleCommonWebviewMessageMock.mockReset().mockResolvedValue(false);
        detailTabMessageHandler = undefined;
        // Reset the createWebviewPanel mock so each test gets a fresh panel.
        (vscode.window.createWebviewPanel as ReturnType<typeof vi.fn>).mockClear();
        const fakeStore = {
            onDidChangeArtifacts: () => ({ dispose: () => undefined }),
            setSelectedArtifact: () => undefined,
            clearSelection: () => undefined,
            getState: () => ({ epics: [] }),
            getLoadValidationIssues: () => [],
            getSelectedArtifact: () => undefined,
        };
        provider = new AgileAgentCanvasViewProvider(
            vscode.Uri.file('/mock/uri'),
            fakeStore as never,
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
        detailTabMessageHandler = undefined;
    });

    function openDetailTabAndGetHandler(artifactId: string): Promise<((m: unknown) => Promise<unknown>) | undefined> {
        return new Promise((resolve) => {
            // openDetailTab is private — access via type cast.
            (provider as unknown as {
                openDetailTab: (id: string) => void;
            }).openDetailTab(artifactId);

            // The handler is registered synchronously inside openDetailTab after
            // createWebviewPanel returns. Resolve on next microtick to be safe.
            setImmediate(() => resolve(detailTabMessageHandler));
        });
    }

    it('registers a message handler on the detail tab panel', async () => {
        const handler = await openDetailTabAndGetHandler('test-artifact-1');

        expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
        expect(handler).toBeDefined();
        expect(typeof handler).toBe('function');
    });

    it('dispatches getChatProviders from detail tab to handleCatalogueWebviewMessage first', async () => {
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(true);

        const handler = await openDetailTabAndGetHandler('test-artifact-1');
        expect(handler).toBeDefined();
        await handler!({ type: 'getChatProviders' });

        expect(handleCatalogueWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(handleAgenticKanbanMessageMock).not.toHaveBeenCalled();
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
        expect(
            (handleCatalogueWebviewMessageMock.mock.calls[0][0] as { type: string }).type,
        ).toBe('getChatProviders');
    });

    it('dispatches selectChatProvider from detail tab to handleCatalogueWebviewMessage first', async () => {
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(true);

        const handler = await openDetailTabAndGetHandler('test-artifact-1');
        expect(handler).toBeDefined();
        await handler!({ type: 'selectChatProvider', providerId: 'claude' });

        expect(handleCatalogueWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(handleAgenticKanbanMessageMock).not.toHaveBeenCalled();
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
        const msg = handleCatalogueWebviewMessageMock.mock.calls[0][0] as { type: string; providerId: string };
        expect(msg.type).toBe('selectChatProvider');
        expect(msg.providerId).toBe('claude');
    });

    it('dispatches openChatWithProvider from detail tab to handleCatalogueWebviewMessage first', async () => {
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(true);

        const handler = await openDetailTabAndGetHandler('test-artifact-1');
        expect(handler).toBeDefined();
        await handler!({ type: 'openChatWithProvider', provider: 'opencode', query: 'say hi' });

        expect(handleCatalogueWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(handleAgenticKanbanMessageMock).not.toHaveBeenCalled();
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
        const msg = handleCatalogueWebviewMessageMock.mock.calls[0][0] as { type: string; provider: string; query: string };
        expect(msg.type).toBe('openChatWithProvider');
        expect(msg.provider).toBe('opencode');
        expect(msg.query).toBe('say hi');
    });

    it('falls through to agentic-kanban in detail tab when catalogue declines', async () => {
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(false);
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(true);

        const handler = await openDetailTabAndGetHandler('test-artifact-1');
        expect(handler).toBeDefined();
        await handler!({ type: 'kanban:statusChanged', artifactId: 'E1', fromStatus: 'backlog', toStatus: 'ready' });

        expect(handleCatalogueWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(handleCommonWebviewMessageMock).not.toHaveBeenCalled();
    });

    it('preserves dispatch order: catalogue → agentic → common in detail tab', async () => {
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(false);
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(false);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(true);

        const handler = await openDetailTabAndGetHandler('test-artifact-1');
        expect(handler).toBeDefined();
        await handler!({ type: 'refineWithAI', artifact: { id: 'S1' } });

        expect(handleCatalogueWebviewMessageMock).toHaveBeenCalledTimes(1);
        expect(handleAgenticKanbanMessageMock).toHaveBeenCalledTimes(1);
        expect(handleCommonWebviewMessageMock).toHaveBeenCalledTimes(1);

        const catOrder = handleCatalogueWebviewMessageMock.mock.invocationCallOrder[0];
        const agentOrder = handleAgenticKanbanMessageMock.mock.invocationCallOrder[0];
        const commonOrder = handleCommonWebviewMessageMock.mock.invocationCallOrder[0];
        expect(catOrder).toBeLessThan(agentOrder);
        expect(agentOrder).toBeLessThan(commonOrder);
    });

    it('detail tab log prefix includes the artifact ID', async () => {
        handleCatalogueWebviewMessageMock.mockResolvedValueOnce(false);
        handleAgenticKanbanMessageMock.mockResolvedValueOnce(false);
        handleCommonWebviewMessageMock.mockResolvedValueOnce(true);

        const handler = await openDetailTabAndGetHandler('my-epic-42');
        expect(handler).toBeDefined();
        await handler!({ type: 'breakDown', artifact: { id: 'S1' } });

        const callArgs = handleCommonWebviewMessageMock.mock.calls[0];
        // Signature: (message, store, extensionUri, logPrefix, webview)
        expect(callArgs[3]).toBe('[DetailTab:my-epic-42]');
    });
});
