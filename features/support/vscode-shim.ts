/**
 * Global `vscode` require hook for the Cucumber BDD suite.
 *
 * Why this exists
 * ---------------
 * Source modules under `src/**` open with `import * as vscode from 'vscode'`.
 * Outside the VS Code Extension Host there is no such module on disk. Step
 * files that exercise those source modules via `proxyquire` typically stub
 * `vscode` and the modules they import directly, but they almost never stub
 * every *transitive* dependency of the file under test. Whenever proxyquire
 * loads a real module that itself transitively imports `vscode`, Node's
 * resolver throws `Cannot find module 'vscode'` and the scenario fails
 * before any assertion runs.
 *
 * Patching every affected step file with an ever-growing list of transitive
 * stubs is brittle and unmaintainable. Instead, this shim installs a single
 * `Module._load` hook at suite-boot time that returns a Proxy-backed mock
 * for any `require('vscode')` call that was *not* already stubbed by
 * proxyquire. Proxyquire's per-call stub table still wins for the file under
 * test, so the behaviour individual step files are asserting remains
 * unchanged — this hook only catches the transitively-loaded real modules.
 *
 * The mock surface mirrors what the suite's `MockVSCode` in `world.ts`
 * exposes for the world-bound cases, plus a small set of enums and class
 * shims that real source modules touch at load time. All unknown accesses
 * resolve to a no-op function so unknown API surface during a transitive
 * load never throws.
 *
 * Loaded via `cucumber.js` `require:` list (before step files).
 */

const Module = require('module') as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = Module._load;

const fnNoop: any = () => undefined;
/** VS Code event subscriptions return a Disposable — callers may store and
 *  dispose it. Returning a plain function (fnNoop) causes secondary failures
 *  when code calls `.dispose()` on the return value. */
const eventSub: any = () => ({ dispose: fnNoop });

class UriShim {
  static file(path: string): UriShim { return new UriShim(path); }
  static parse(value: string): UriShim { return new UriShim(value); }
  static joinPath(base: UriShim, ..._segments: string[]): UriShim { return base; }
  constructor(public path = '') {}
  get fsPath(): string { return this.path; }
  with(_change: object): UriShim { return this; }
  toString(): string { return this.path; }
}

class DisposableShim {
  static from(..._disposables: any[]): DisposableShim { return new DisposableShim(); }
  dispose(): void { /* noop */ }
}

class EventEmitterShim<T> {
  event = (_listener: (e: T) => void) => ({ dispose: () => undefined });
  fire(_data: T): void { /* noop */ }
  dispose(): void { /* noop */ }
}

class MarkdownStringShim {
  value = '';
  appendText(v: string): this { this.value += v; return this; }
  appendMarkdown(v: string): this { this.value += v; return this; }
  appendCodeblock(v: string, lang?: string): this { this.value += '\n```' + (lang ?? '') + '\n' + v + '\n```\n'; return this; }
}

class ThemeIconShim { constructor(public readonly id = '', public readonly _color?: unknown) {} }
class ThemeColorShim { constructor(public readonly id = '') {} }
class RelativePatternShim { constructor(public readonly base: unknown, public readonly pattern = '') {} }
class TreeItemShim { constructor(public label?: string | { label: string }, public collapsibleState?: number) {} }
class LanguageModelTextPartShim { constructor(public value = '') {} }
class LanguageModelToolCallPartShim { constructor(public callId = '', public name = '', public input: unknown = undefined) {} }
class LanguageModelToolResultPartShim { constructor(public callId = '', public content: unknown = undefined) {} }
class LanguageModelToolResultShim { constructor(public content: unknown[] = []) {} }
class CancellationTokenSourceShim {
  get token(): unknown { return { isCancellationRequested: false, onCancellationRequested: fnNoop }; }
  cancel(): void { /* noop */ }
  dispose(): void { /* noop */ }
}

const configShim: any = {
  get: (_key: string, defaultValue?: unknown) => defaultValue,
  has: () => false,
  inspect: () => undefined,
  update: async () => undefined,
};

const workspaceShim = {
  workspaceFolders: undefined,
  getConfiguration: (_section?: string) => configShim,
  onDidChangeConfiguration: eventSub,
  onDidChangeWorkspaceFolders: eventSub,
  fs: new Proxy({}, { get: () => async () => undefined }) as Record<string, (...args: unknown[]) => Promise<unknown>>,
  createFileSystemWatcher: () => ({ onDidCreate: eventSub, onDidChange: eventSub, onDidDelete: eventSub, dispose: fnNoop }),
  findFiles: async () => [],
  openTextDocument: async () => ({ getText: () => '' }),
  onDidChangeTextDocument: eventSub,
  onDidOpenTextDocument: eventSub,
  onDidCloseTextDocument: eventSub,
  onDidSaveTextDocument: eventSub,
  getWorkspaceFolder: () => undefined,
  asRelativePath: () => '',
  isVirtualWorkspace: false,
};

const base: Record<string, any> = {
  Uri: UriShim,
  EventEmitter: EventEmitterShim,
  Disposable: DisposableShim,
  ThemeIcon: ThemeIconShim,
  ThemeColor: ThemeColorShim,
  MarkdownString: MarkdownStringShim,
  RelativePattern: RelativePatternShim,
  TreeItem: TreeItemShim,
  LanguageModelTextPart: LanguageModelTextPartShim,
  LanguageModelToolCallPart: LanguageModelToolCallPartShim,
  LanguageModelToolResultPart: LanguageModelToolResultPartShim,
  LanguageModelToolResult: LanguageModelToolResultShim,
  LanguageModelChatMessage: { User: (c: unknown) => ({ role: 'user', content: c }), Assistant: (c: unknown) => ({ role: 'assistant', content: c }) },
  CancellationTokenSource: CancellationTokenSourceShim,

  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
  ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9 },
  ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  LanguageModelChatMessageRole: { User: 1, Assistant: 2 },
  TerminalLocation: { Panel: 1, Editor: 2 },
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  TerminalExitReason: { Unknown: 0, Normal: 1, UserInput: 2, Extension: 3 },

  // Common namespaces - Proxy returns noop fns for unknown accesses.
  window: new Proxy({
    // Some callers chain property assignment (e.g. `item.name = '...'`) on
    // the returned object, so factory methods must return a real object
    // that tolerates arbitrary property writes.
    createStatusBarItem: () => new Proxy({
      name: '', text: '', tooltip: '', color: undefined, backgroundColor: undefined,
      alignment: 1, priority: 0, command: undefined, accessibilityInformation: undefined,
      show: fnNoop, hide: fnNoop, dispose: fnNoop,
    }, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p as string] : fnNoop) }),
    createTreeView: () => ({
      onDidChangeSelection: eventSub, onDidCollapseElement: eventSub, onDidExpandElement: eventSub,
      reveal: fnNoop, dispose: fnNoop, visible: true,
    }),
    createWebviewPanel: () => ({
      webview: { html: '', postMessage: async () => true, onDidReceiveMessage: fnNoop, asWebviewUri: (u: unknown) => u, cspSource: 'mock' },
      onDidDispose: eventSub, onDidChangeViewState: eventSub, reveal: fnNoop, dispose: fnNoop,
      visible: true, active: true, viewColumn: 1, title: '',
    }),
    registerWebviewViewProvider: () => ({ dispose: fnNoop }),
    onDidCloseTerminal: eventSub,
    registerTreeDataProvider: () => ({ dispose: fnNoop }),
    createOutputChannel: () => ({ append: fnNoop, appendLine: fnNoop, clear: fnNoop, show: fnNoop, hide: fnNoop, dispose: fnNoop, name: '' }),
    withProgress: async (_options: unknown, task: (p: unknown) => Promise<unknown>) => task({ report: fnNoop }),
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showQuickPick: async () => undefined,
    showInputBox: async () => undefined,
    showOpenDialog: async () => undefined,
    showSaveDialog: async () => undefined,
    setStatusBarMessage: () => ({ dispose: fnNoop }),
    activeTextEditor: undefined,
    visibleTextEditors: [],
    terminals: [],
  }, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p as string] : fnNoop) }),
  workspace: workspaceShim,
  commands: new Proxy({}, { get: () => fnNoop }),
  env: new Proxy(
    {
      clipboard: { readText: async () => '', writeText: async () => undefined },
      appName: 'VSCode', appRoot: '/test/app', language: 'en', machineId: 'test',
      sessionId: 'test', shell: '/bin/bash', uriScheme: 'vscode',
      openExternal: async () => true, isTelemetryEnabled: false,
      onDidChangeTelemetryEnabled: eventSub, remoteName: undefined, isWeb: false,
    },
    { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p as string] : fnNoop) }
  ),
  languages: new Proxy({}, { get: () => fnNoop }),
  extensions: new Proxy({}, { get: () => fnNoop }),
  chat: new Proxy({}, { get: () => fnNoop }),
  lm: {
    selectChatModels: async () => [],
    registerTool: () => ({ dispose: () => undefined }),
    invokeTool: async () => ({ content: [] }),
    tools: [],
  },
  comments: new Proxy({}, { get: () => fnNoop }),
  debug: new Proxy({}, { get: () => fnNoop }),
  scm: new Proxy({}, { get: () => fnNoop }),
  tests: new Proxy({}, { get: () => fnNoop }),
  terminal: new Proxy({}, { get: () => fnNoop }),
  notebooks: new Proxy({}, { get: () => fnNoop }),
  authentication: new Proxy({}, { get: () => fnNoop }),
};

const vscodeMock = new Proxy(base, {
  get: (target, prop) => (prop in target ? (target as Record<string | symbol, unknown>)[prop as string] : fnNoop),
});

Module._load = function (request: string, parent: unknown, isMain: boolean): unknown {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};

(globalThis as unknown as { __vscodeShimInstalled?: boolean }).__vscodeShimInstalled = true;
