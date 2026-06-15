// ─── Vitest global setup: vscode shim ─────────────────────────────────────────
// The Autonomy modules import `vscode` at module top level (e.g.
// kanban-settings.ts calls `vscode.workspace.getConfiguration()` at import,
// terminal-executor.ts uses `vscode.window.onDidCloseTerminal`).
// The real `vscode` package is only resolvable inside the Extension Host.
// Under Vitest we need a minimal stub that satisfies the import + the few
// APIs the modules actually call.

import { vi } from 'vitest';

vi.mock('vscode', () => {
  const ConfigurationTarget = { Workspace: 1, Global: 2, WorkspaceFolder: 3 };
  const noopDisposable = { dispose: () => {} };

  const configuration = {
    get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
    update: vi.fn(async () => {}),
    has: vi.fn(() => true),
  };

  return {
    workspace: {
      getConfiguration: vi.fn(() => configuration),
      workspaceFolders: undefined,
      onDidChangeConfiguration: vi.fn(() => noopDisposable),
      onDidChangeWorkspaceFolders: vi.fn(() => noopDisposable),
      createFileSystemWatcher: vi.fn(() => ({
        onDidCreate: () => {}, onDidChange: () => {}, onDidDelete: () => {}, dispose: () => {},
      })),
    },
    window: {
      // terminal-executor.ts calls this on activation
      onDidCloseTerminal: vi.fn(() => noopDisposable),
      onDidOpenTerminal: vi.fn(() => noopDisposable),
      showInformationMessage: vi.fn(async () => undefined),
      showWarningMessage: vi.fn(async () => undefined),
      showErrorMessage: vi.fn(async () => undefined),
      showInputBox: vi.fn(async () => undefined),
      createOutputChannel: vi.fn(() => ({
        appendLine: () => {}, append: () => {}, clear: () => {},
        show: () => {}, hide: () => {}, dispose: () => {},
      })),
    },
    commands: {
      registerCommand: vi.fn(() => noopDisposable),
      executeCommand: vi.fn(async () => undefined),
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: 'file', path: p }),
      joinPath: (...parts: any[]) => ({ fsPath: parts.map(p => p?.fsPath ?? p).join('/'), scheme: 'file' }),
    },
    // kanban-orchestrator.ts exports a module-level `kanbanProgress`
    // event emitter. The real API has a slightly different shape than
    // Node's EventEmitter but the orchestrator only uses `event`/`fire`/`dispose`.
    EventEmitter: class {
      private listeners: Array<(e: any) => void> = [];
      event = (listener: (e: any) => void) => { this.listeners.push(listener); return { dispose: () => {} }; };
      fire = (e: any) => { for (const l of this.listeners) l(e); };
      dispose = () => { this.listeners = []; };
    },
    ConfigurationTarget,
  };
});
