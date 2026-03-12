/**
 * Cucumber World - Shared context for all step definitions
 * This replaces the Vitest mock setup for Cucumber tests
 */

import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import type { ArtifactStore } from '../../src/state/artifact-store';
import type { WorkflowExecutor } from '../../src/workflow/workflow-executor';

// Mock VS Code types
export interface MockExtensionContext {
  subscriptions: any[];
  extensionPath: string;
  extensionUri: any;
  globalStorageUri: any;
  storageUri: any;
  logUri: any;
  extensionMode: number;
  globalState: {
    get: (key: string, defaultValue?: any) => any;
    update: (key: string, value: any) => Promise<void>;
    keys: () => string[];
    setKeysForSync: () => void;
  };
  workspaceState: {
    get: (key: string, defaultValue?: any) => any;
    update: (key: string, value: any) => Promise<void>;
    keys: () => string[];
  };
  secrets: {
    get: () => Promise<any>;
    store: () => Promise<void>;
    delete: () => Promise<void>;
    onDidChange: () => void;
  };
  asAbsolutePath: (relativePath: string) => string;
}

export class MockRelativePattern {
  constructor(public readonly base: any, public readonly pattern: string) {}
}

export interface MockVSCode {
  Uri: typeof MockUri;
  RelativePattern: typeof MockRelativePattern;
  EventEmitter: typeof MockEventEmitter;
  TreeItem: typeof MockTreeItem;
  TreeItemCollapsibleState: typeof MockTreeItemCollapsibleState;
  ThemeIcon: typeof MockThemeIcon;
  ThemeColor: typeof MockThemeColor;
  Disposable: typeof MockDisposable;
  ViewColumn: typeof MockViewColumn;
  FileType: typeof MockFileType;
  MarkdownString: typeof MockMarkdownString;
  ProgressLocation: { Notification: number; SourceControl: number; Window: number };
  window: any;
  workspace: any;
  commands: any;
  env: any;
  languages: any;
  chat: any;
  lm: any;
  LanguageModelChatMessage: any;
  LanguageModelTextPart: any;
  LanguageModelToolCallPart: any;
  LanguageModelToolResultPart: any;
  LanguageModelToolResult: any;
}

// Mock implementations
export class MockUri {
  static file(path: string): MockUri {
    return new MockUri('file', '', path, '', '');
  }

  static parse(value: string): MockUri {
    return new MockUri('file', '', value, '', '');
  }

  static joinPath(base: MockUri, ...pathSegments: string[]): MockUri {
    const newPath = [base.path, ...pathSegments].join('/');
    return new MockUri(base.scheme, base.authority, newPath, base.query, base.fragment);
  }

  constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string
  ) {}

  get fsPath(): string {
    return this.path;
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }

  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): MockUri {
    return new MockUri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment
    );
  }
}

export class MockEventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };

  fire(data: T) {
    this.listeners.forEach(l => l(data));
  }

  dispose() {
    this.listeners = [];
  }
}

export class MockTreeItem {
  label?: string | { label: string };
  id?: string;
  iconPath?: any;
  description?: string;
  tooltip?: string;
  command?: any;
  collapsibleState?: number;
  contextValue?: string;

  constructor(label: string | { label: string }, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export enum MockTreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2
}

export class MockThemeIcon {
  constructor(public readonly id: string, public readonly color?: any) {}
}

export class MockThemeColor {
  constructor(public readonly id: string) {}
}

export class MockDisposable {
  static from(...disposables: { dispose: () => any }[]): MockDisposable {
    return new MockDisposable(() => disposables.forEach(d => d.dispose()));
  }

  constructor(private callOnDispose: () => any) {}

  dispose() {
    this.callOnDispose();
  }
}

export class MockMarkdownString {
  value: string;
  isTrusted?: boolean;
  supportThemeIcons?: boolean;

  constructor(value?: string, supportThemeIcons?: boolean) {
    this.value = value ?? '';
    this.supportThemeIcons = supportThemeIcons;
  }

  appendText(value: string): MockMarkdownString {
    this.value += value;
    return this;
  }

  appendMarkdown(value: string): MockMarkdownString {
    this.value += value;
    return this;
  }

  appendCodeblock(value: string, language?: string): MockMarkdownString {
    this.value += `\n\`\`\`${language ?? ''}\n${value}\n\`\`\`\n`;
    return this;
  }
}

export enum MockViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3
}

export enum MockFileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
}

/**
 * Custom World class for Cucumber tests
 */
export class BmadWorld extends World {
  // VS Code mock
  public vscode!: MockVSCode;
  public context!: MockExtensionContext;

  // Stores and executors
  public artifactStore!: ArtifactStore;
  public workflowExecutor!: WorkflowExecutor;

  // State tracking
  public lastResult: any;
  public lastError: Error | null = null;
  public createdArtifacts: Map<string, any> = new Map();
  public messageHistory: string[] = [];

  // Mock function call tracking
  public mockCalls: Map<string, any[][]> = new Map();

  constructor(options: IWorldOptions) {
    super(options);
    this.initializeMocks();
  }

  private initializeMocks(): void {
    // Initialize global state storage
    const globalState = new Map<string, any>();
    const workspaceState = new Map<string, any>();

    // Create mock context
    this.context = {
      subscriptions: [],
      extensionPath: '/test/extension',
      extensionUri: MockUri.file('/test/extension'),
      globalStorageUri: MockUri.file('/test/global-storage'),
      storageUri: MockUri.file('/test/storage'),
      logUri: MockUri.file('/test/logs'),
      extensionMode: 1,
      globalState: {
        get: (key: string, defaultValue?: any) => globalState.get(key) ?? defaultValue,
        update: async (key: string, value: any) => { globalState.set(key, value); },
        keys: () => Array.from(globalState.keys()),
        setKeysForSync: () => {},
      },
      workspaceState: {
        get: (key: string, defaultValue?: any) => workspaceState.get(key) ?? defaultValue,
        update: async (key: string, value: any) => { workspaceState.set(key, value); },
        keys: () => Array.from(workspaceState.keys()),
      },
      secrets: {
        get: async () => undefined,
        store: async () => {},
        delete: async () => {},
        onDidChange: () => {},
      },
      asAbsolutePath: (relativePath: string) => `/test/extension/${relativePath}`,
    };

    // Create mock VS Code API
    this.vscode = {
      Uri: MockUri,
      RelativePattern: MockRelativePattern,
      EventEmitter: MockEventEmitter,
      TreeItem: MockTreeItem,
      TreeItemCollapsibleState: MockTreeItemCollapsibleState,
      ThemeIcon: MockThemeIcon,
      ThemeColor: MockThemeColor,
      Disposable: MockDisposable,
      ViewColumn: MockViewColumn,
      FileType: MockFileType,
      MarkdownString: MockMarkdownString,
      ProgressLocation: { Notification: 15, SourceControl: 1, Window: 10 },
      window: {
        showInformationMessage: this.createMockFn('window.showInformationMessage'),
        showWarningMessage: this.createMockFn('window.showWarningMessage'),
        showErrorMessage: this.createMockFn('window.showErrorMessage'),
        showInputBox: this.createMockFn('window.showInputBox'),
        showQuickPick: this.createMockFn('window.showQuickPick'),
        showOpenDialog: this.createMockFn('window.showOpenDialog'),
        showSaveDialog: this.createMockFn('window.showSaveDialog'),
        setStatusBarMessage: this.createMockFn('window.setStatusBarMessage', { dispose: () => {} }),
        createOutputChannel: this.createMockFn('window.createOutputChannel', {
          appendLine: () => {},
          append: () => {},
          clear: () => {},
          show: () => {},
          hide: () => {},
          dispose: () => {},
        }),
        createWebviewPanel: this.createMockFn('window.createWebviewPanel', {
          webview: {
            html: '',
            postMessage: async () => true,
            onDidReceiveMessage: () => {},
            asWebviewUri: (uri: MockUri) => uri,
            cspSource: 'mock-csp-source',
          },
          onDidDispose: () => {},
          onDidChangeViewState: () => {},
          reveal: () => {},
          dispose: () => {},
          visible: true,
          active: true,
        }),
        registerWebviewViewProvider: this.createMockFn('window.registerWebviewViewProvider', { dispose: () => {} }),
        createTreeView: this.createMockFn('window.createTreeView', {
          onDidChangeSelection: () => {},
          onDidCollapseElement: () => {},
          onDidExpandElement: () => {},
          reveal: () => {},
          dispose: () => {},
        }),
        withProgress: async (_options: any, task: any) => task({ report: () => {} }),
      },
      workspace: {
        workspaceFolders: [
          {
            uri: MockUri.file('/test/workspace'),
            name: 'test-workspace',
            index: 0,
          },
        ],
        getConfiguration: (section?: string) => {
          // Track the call
          if (!this.mockCalls.has('workspace.getConfiguration')) {
            this.mockCalls.set('workspace.getConfiguration', []);
          }
          this.mockCalls.get('workspace.getConfiguration')!.push([section]);
          
          return {
            get: (key: string, defaultValue?: any) => defaultValue,
            has: () => false,
            inspect: () => undefined,
            update: async () => {},
          };
        },
        onDidChangeConfiguration: () => {},
        createFileSystemWatcher: this.createMockFn('workspace.createFileSystemWatcher', {
          onDidCreate: () => {},
          onDidChange: () => {},
          onDidDelete: () => {},
          dispose: () => {},
        }),
        fs: {
          readFile: async () => new Uint8Array(),
          writeFile: async () => {},
          delete: async () => {},
          createDirectory: async () => {},
          readDirectory: async () => [],
          stat: async () => ({ type: 1, ctime: 0, mtime: 0, size: 0 }),
        },
        openTextDocument: async () => ({
          getText: () => '',
          uri: MockUri.file('/test/file.txt'),
        }),
        findFiles: async () => [],
      },
      commands: {
        registerCommand: this.createMockFn('commands.registerCommand', { dispose: () => {} }),
        executeCommand: this.createMockFn('commands.executeCommand'),
        getCommands: async () => [],
      },
      env: {
        clipboard: {
          readText: async () => '',
          writeText: async () => {},
        },
        appName: 'Visual Studio Code',
        appRoot: '/test/app',
        language: 'en',
        machineId: 'test-machine-id',
        remoteName: undefined,
        sessionId: 'test-session-id',
        shell: '/bin/bash',
        uriScheme: 'vscode',
        openExternal: async () => true,
      },
      languages: {
        registerCompletionItemProvider: this.createMockFn('languages.registerCompletionItemProvider', { dispose: () => {} }),
        registerHoverProvider: this.createMockFn('languages.registerHoverProvider', { dispose: () => {} }),
      },
      chat: {
        createChatParticipant: this.createMockFn('chat.createChatParticipant', {
          iconPath: undefined,
          onDidReceiveFeedback: () => {},
          dispose: () => {},
        }),
      },
      lm: {
        selectChatModels: async () => [],
        registerTool: (_name: string, _handler: any) => ({ dispose: () => {} }),
        invokeTool: async (_name: string, _options: any, _token: any) => ({
          content: [{ value: 'mock tool result' }]
        }),
      },
      LanguageModelChatMessage: {
        User: (content: any) => ({ role: 'user', content }),
        Assistant: (content: any) => ({ role: 'assistant', content }),
      },
      LanguageModelTextPart: class {
        constructor(public value: string) {}
      },
      LanguageModelToolCallPart: class {
        constructor(public callId: string, public name: string, public input: any) {}
      },
      LanguageModelToolResultPart: class {
        constructor(public callId: string, public content: any) {}
      },
      LanguageModelToolResult: class {
        constructor(public content: any[]) {}
      },
    };
  }

  /**
   * Create a mock function that tracks calls
   */
  private createMockFn(name: string, returnValue: any = undefined): (...args: any[]) => any {
    return (...args: any[]) => {
      if (!this.mockCalls.has(name)) {
        this.mockCalls.set(name, []);
      }
      this.mockCalls.get(name)!.push(args);
      return returnValue instanceof Promise ? returnValue : Promise.resolve(returnValue);
    };
  }

  /**
   * Get calls to a mock function
   */
  getMockCalls(name: string): any[][] {
    return this.mockCalls.get(name) || [];
  }

  /**
   * Check if a mock function was called
   */
  wasMockCalled(name: string): boolean {
    return this.getMockCalls(name).length > 0;
  }

  /**
   * Reset all mocks
   */
  resetMocks(): void {
    this.mockCalls.clear();
    this.lastResult = undefined;
    this.lastError = null;
    this.createdArtifacts.clear();
    this.messageHistory = [];
  }
}

setWorldConstructor(BmadWorld);
