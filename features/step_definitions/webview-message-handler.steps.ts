/**
 * Webview Message Handler Step Definitions
 * Cucumber step definitions for handleCommonWebviewMessage
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld, MockUri } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// ── Per-scenario state ──────────────────────────────────────────────

interface HandlerTestContext {
    handleCommonWebviewMessage: any;
    mockStore: any;
    mockWebview: { postMessage: (msg: any) => void; postedMessages: any[] };
    extensionUri: any;
    lastReturnValue: boolean | null;
    commandCalls: Map<string, any[]>;
    outputMessages: string[];
    configUpdates: any[];
    fileWrites: any[];
    showSaveDialogResult: any;
    showWarningMessageResult: any;
    showInformationMessageResult: string | undefined;
    fileWriteWillFail: boolean;
    schemaValidatorInitialised: boolean;
    schemaValidatorInitWillThrow: boolean;
    schemaValidatorWillReportErrors: boolean;
    storeFixInProgress: boolean;
    storeSourceFolder: string | null;
    storeLoadFromFolderWillThrow: boolean;
    storeRunExclusiveFixWillThrow: boolean;
    storeFixedCount: number;
    startDevWillThrow: boolean;
    startDocWillThrow: boolean;
    errorMessageShown: string | null;
    executeCommandCalls: any[];
    warningMessageShown: string | null;
}

const contexts = new WeakMap<BmadWorld, HandlerTestContext>();

function getCtx(world: BmadWorld): HandlerTestContext {
    let ctx = contexts.get(world);
    if (!ctx) {
        ctx = {
            handleCommonWebviewMessage: null,
            mockStore: null,
            mockWebview: { postMessage: () => {}, postedMessages: [] },
            extensionUri: MockUri.file('/test/extension'),
            lastReturnValue: null,
            commandCalls: new Map(),
            outputMessages: [],
            configUpdates: [],
            fileWrites: [],
            showSaveDialogResult: undefined,
            showWarningMessageResult: undefined,
            showInformationMessageResult: undefined,
            fileWriteWillFail: false,
            schemaValidatorInitialised: false,
            schemaValidatorInitWillThrow: false,
            schemaValidatorWillReportErrors: false,
            storeFixInProgress: false,
            storeSourceFolder: '/test/workspace/bmad',
            storeLoadFromFolderWillThrow: false,
            storeRunExclusiveFixWillThrow: false,
            storeFixedCount: 0,
            startDevWillThrow: false,
            startDocWillThrow: false,
            errorMessageShown: null,
            executeCommandCalls: [],
            warningMessageShown: null,
        };
        contexts.set(world, ctx);
    }
    return ctx;
}

function buildHandler(world: BmadWorld): void {
    const ctx = getCtx(world);

    // Mock webview
    ctx.mockWebview = {
        postedMessages: [],
        postMessage(msg: any) {
            this.postedMessages.push(msg);
        },
    };

    // Mock store
    ctx.mockStore = {
        _updateCalls: [] as any[],
        _deleteCalls: [] as any[],
        _backupCalled: false,
        _fixAndSyncCalled: false,
        _loadFromFolderCalls: [] as string[],
        _validationIssuesBefore: [] as any[],
        _validationIssuesAfter: [] as any[],

        async updateArtifact(type: string, id: string, updates: any) {
            this._updateCalls.push({ type, id, updates });
        },
        async deleteArtifact(type: string, id: string) {
            this._deleteCalls.push({ type, id });
        },
        isFixInProgress() { return ctx.storeFixInProgress; },
        getLoadValidationIssues() {
            // Return "after" issues if fix was run, else "before"
            if (this._fixAndSyncCalled) return this._validationIssuesAfter;
            return this._validationIssuesBefore;
        },
        getSourceFolder() { return ctx.storeSourceFolder; },
        async loadFromFolder(folder: string) {
            this._loadFromFolderCalls.push(folder);
            if (ctx.storeLoadFromFolderWillThrow) {
                throw new Error('loadFromFolder mock error');
            }
        },
        async runExclusiveFix(fn: () => Promise<void>) {
            if (ctx.storeRunExclusiveFixWillThrow) {
                throw new Error('runExclusiveFix mock error');
            }
            await fn();
        },
        async backupArtifactFiles() {
            this._backupCalled = true;
            return MockUri.file('/test/backup');
        },
        async pruneOldBackups(_keep: number) {},
        async fixAndSyncToFiles() {
            this._fixAndSyncCalled = true;
        },
    };

    // Set up issues for fixSchemas scenarios
    if (ctx.storeFixedCount > 0) {
        ctx.mockStore._validationIssuesBefore = Array.from(
            { length: ctx.storeFixedCount },
            (_, i) => ({ file: `file${i}.json`, error: `issue ${i}` })
        );
        ctx.mockStore._validationIssuesAfter = [];
    }

    // Mock vscode
    const vsc = {
        ...world.vscode,
        window: {
            ...world.vscode.window,
            showWarningMessage: async (...args: any[]) => {
                ctx.warningMessageShown = args[0];
                return ctx.showWarningMessageResult;
            },
            showErrorMessage: (...args: any[]) => {
                ctx.errorMessageShown = args[0];
                return Promise.resolve(undefined);
            },
            showInformationMessage: async (...args: any[]) => {
                return ctx.showInformationMessageResult;
            },
            showSaveDialog: async () => ctx.showSaveDialogResult,
        },
        workspace: {
            ...world.vscode.workspace,
            getConfiguration: (section?: string) => ({
                get: (key: string, defaultValue?: any) => defaultValue,
                has: () => false,
                inspect: () => undefined,
                update: async (key: string, value: any, target: any) => {
                    ctx.configUpdates.push({ key, value, target });
                },
            }),
            fs: {
                writeFile: async (uri: any, data: any) => {
                    if (ctx.fileWriteWillFail) throw new Error('write mock error');
                    ctx.fileWrites.push({ uri, data });
                },
                readFile: async () => new Uint8Array(),
                readDirectory: async () => [],
            },
            asRelativePath: (uri: any) => 'relative/path',
            workspaceFolders: [{ uri: MockUri.file('/test/workspace'), name: 'test', index: 0 }],
        },
        commands: {
            executeCommand: async (...args: any[]) => {
                ctx.executeCommandCalls.push(args);
            },
        },
        Uri: MockUri,
        ConfigurationTarget: { Workspace: 2 },
    };

    // Mock schema-validator
    const mockSchemaValidator = {
        schemaValidator: {
            isInitialized() { return ctx.schemaValidatorInitialised; },
            init(_bmadPath: string, _logger: any) {
                if (ctx.schemaValidatorInitWillThrow) throw new Error('init mock error');
                ctx.schemaValidatorInitialised = true;
            },
            validateChanges(_type: string, _updates: any) {
                if (ctx.schemaValidatorWillReportErrors) {
                    return { valid: false, errors: ['field "x" is required', 'invalid enum value'] };
                }
                return { valid: true, errors: [] };
            },
        },
    };

    // Mock artifact-commands
    const mockCommands: any = {
        refineArtifactWithAI: async (...args: any[]) => {
            ctx.commandCalls.set('refineArtifactWithAI', args);
        },
        breakDownArtifact: async (...args: any[]) => {
            ctx.commandCalls.set('breakDownArtifact', args);
        },
        enhanceArtifactWithAI: async (...args: any[]) => {
            ctx.commandCalls.set('enhanceWithAI', args);
        },
        elicitArtifactWithMethod: async (...args: any[]) => {
            ctx.commandCalls.set('elicitArtifactWithMethod', args);
        },
        startDevelopment: async (...args: any[]) => {
            if (ctx.startDevWillThrow) throw new Error('startDev mock error');
            ctx.commandCalls.set('startDevelopment', args);
        },
        startDocumentation: async (...args: any[]) => {
            if (ctx.startDocWillThrow) throw new Error('startDoc mock error');
            ctx.commandCalls.set('startDocumentation', args);
        },
        launchBmmWorkflow: async (...args: any[]) => {
            ctx.commandCalls.set('launchBmmWorkflow', args);
        },
        exportArtifacts: async (...args: any[]) => {
            ctx.commandCalls.set('exportArtifacts', args);
        },
        importArtifacts: async (...args: any[]) => {
            ctx.commandCalls.set('importArtifacts', args);
        },
    };

    // Mock acOutput
    const mockAcOutput = {
        appendLine: (msg: string) => { ctx.outputMessages.push(msg); },
        append: () => {},
        clear: () => {},
        show: () => {},
    };

    // Mock PDFDocument
    class MockPDFDocument {
        page = { width: 842, height: 595 };
        _events: any = {};
        _chunks: Buffer[] = [];
        constructor(_opts?: any) {}
        on(event: string, handler: any) {
            this._events[event] = handler;
            return this;
        }
        image() { return this; }
        end() {
            // Simulate data + end events
            const chunk = Buffer.from('mock-pdf-data');
            if (this._events.data) this._events.data(chunk);
            if (this._events.end) this._events.end();
        }
    }

    // Load module with proxyquire
    const handlerModule = proxyquire('../../src/views/webview-message-handler', {
        'vscode': vsc,
        '../state/artifact-store': {},
        '../state/schema-validator': mockSchemaValidator,
        '../extension': { acOutput: mockAcOutput },
        '../commands/artifact-commands': mockCommands,
        '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} },
        'pdfkit': MockPDFDocument,
        'path': require('path'),
    });

    ctx.handleCommonWebviewMessage = handlerModule.handleCommonWebviewMessage;
}

async function sendMessage(world: BmadWorld, message: any, withWebview = false): Promise<void> {
    const ctx = getCtx(world);
    buildHandler(world);
    ctx.lastReturnValue = await ctx.handleCommonWebviewMessage(
        message,
        ctx.mockStore,
        ctx.extensionUri,
        '[Test]',
        withWebview ? ctx.mockWebview : undefined
    );
}

// ── GIVEN steps ─────────────────────────────────────────────────────

Given('a fresh message handler context', function (this: BmadWorld) {
    // WeakMap entry is lazily created by getCtx; reset if present
    contexts.delete(this);
});

Given('the schema validator will report errors', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.schemaValidatorWillReportErrors = true;
});

Given('the schema validator init will throw', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.schemaValidatorInitWillThrow = true;
});

Given('a fix is already in progress', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.storeFixInProgress = true;
});

Given('the user will decline the confirmation dialog', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.showWarningMessageResult = undefined; // user pressed Escape
});

Given('the user will confirm the fix schemas dialog', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.showWarningMessageResult = 'Fix Schemas';
});

Given('the store fix will succeed with {int} issues fixed', function (this: BmadWorld, count: number) {
    const ctx = getCtx(this);
    ctx.storeFixedCount = count;
});

Given('the store runExclusiveFix will throw', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.storeRunExclusiveFixWillThrow = true;
});

Given('the store has a source folder', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.storeSourceFolder = '/test/workspace/bmad';
});

Given('the store has no source folder', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.storeSourceFolder = null;
});

Given('the store loadFromFolder will throw', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.storeLoadFromFolderWillThrow = true;
});

Given('the user will choose a save location', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.showSaveDialogResult = MockUri.file('/test/output/screenshot.png');
});

Given('the user will cancel the save dialog', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.showSaveDialogResult = undefined;
});

Given('the file write will fail', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.fileWriteWillFail = true;
});

Given('the user will click "Open File" after save', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.showInformationMessageResult = 'Open File';
});

Given('the startDevelopment command will throw', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.startDevWillThrow = true;
});

Given('the startDocumentation command will throw', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.startDocWillThrow = true;
});

// ── WHEN steps ──────────────────────────────────────────────────────

When('I send an {string} message with id {string} and artifactType {string} and updates', async function (this: BmadWorld, type: string, id: string, artType: string) {
    await sendMessage(this, { type, id, artifactType: artType, updates: { title: 'Updated' } });
});

When('I send an {string} message with id {string} and no artifactType', async function (this: BmadWorld, type: string, id: string) {
    await sendMessage(this, { type, id, updates: { title: 'Updated' } });
});

When('I send an {string} message with id {string} and artifactType {string} and updates providing a webview', async function (this: BmadWorld, type: string, id: string, artType: string) {
    await sendMessage(this, { type, id, artifactType: artType, updates: { title: 'Updated' } }, true);
});

When('I send a {string} message with id {string} and artifactType {string}', async function (this: BmadWorld, type: string, id: string, artType: string) {
    await sendMessage(this, { type, id, artifactType: artType });
});

When('I send a {string} message with id {string} and no artifactType', async function (this: BmadWorld, type: string, id: string) {
    await sendMessage(this, { type, id });
});

When('I send a {string} message with an artifact', async function (this: BmadWorld, type: string) {
    await sendMessage(this, { type, artifact: { id: 'art-1', type: 'epic', metadata: {} } });
});

When('I send an {string} message with an artifact and method {string}', async function (this: BmadWorld, type: string, method: string) {
    await sendMessage(this, { type, artifact: { id: 'art-1', type: 'epic' }, method });
});

When('I send a {string} message with triggerPhrase {string}', async function (this: BmadWorld, type: string, triggerPhrase: string) {
    await sendMessage(this, { type, workflow: { triggerPhrase, workflowFilePath: '/test/wf.md' } });
});

When('I send a {string} message without a trigger phrase', async function (this: BmadWorld, type: string) {
    await sendMessage(this, { type, workflow: {} });
});

When('I send an {string} message', async function (this: BmadWorld, type: string) {
    await sendMessage(this, { type });
});

When('I send a {string} message', async function (this: BmadWorld, type: string) {
    await sendMessage(this, { type });
});

When('I send a {string} message with format {string}', async function (this: BmadWorld, type: string, format: string) {
    await sendMessage(this, { type, format });
});

When('I send a {string} message providing a webview', async function (this: BmadWorld, type: string) {
    await sendMessage(this, { type }, true);
});

When('I send a {string} message with no dataUrl', async function (this: BmadWorld, type: string) {
    await sendMessage(this, { type });
});

When('I send a {string} message with a valid dataUrl and format {string}', async function (this: BmadWorld, type: string, format: string) {
    // Create a minimal valid base64 PNG data URL
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await sendMessage(this, { type, dataUrl, format });
});

// ── THEN steps ──────────────────────────────────────────────────────

Then('the handler should return true', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.strictEqual(ctx.lastReturnValue, true);
});

Then('the handler should return false', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.strictEqual(ctx.lastReturnValue, false);
});

Then('the store updateArtifact should have been called with {string} and {string}', function (this: BmadWorld, type: string, id: string) {
    const ctx = getCtx(this);
    const calls = ctx.mockStore._updateCalls;
    assert.ok(calls.length > 0, 'updateArtifact was not called');
    const match = calls.find((c: any) => c.type === type && c.id === id);
    assert.ok(match, `updateArtifact not called with type="${type}" id="${id}". Calls: ${JSON.stringify(calls)}`);
});

Then('the store deleteArtifact should have been called with {string} and {string}', function (this: BmadWorld, type: string, id: string) {
    const ctx = getCtx(this);
    const calls = ctx.mockStore._deleteCalls;
    assert.ok(calls.length > 0, 'deleteArtifact was not called');
    const match = calls.find((c: any) => c.type === type && c.id === id);
    assert.ok(match, `deleteArtifact not called with type="${type}" id="${id}". Calls: ${JSON.stringify(calls)}`);
});

Then('the schema validator should have been initialised', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.strictEqual(ctx.schemaValidatorInitialised, true);
});

Then('the webview should have received a {string} message', function (this: BmadWorld, type: string) {
    const ctx = getCtx(this);
    const match = ctx.mockWebview.postedMessages.find((m: any) => m.type === type);
    assert.ok(match, `Webview did not receive "${type}" message. Got: ${JSON.stringify(ctx.mockWebview.postedMessages.map((m: any) => m.type))}`);
});

Then('the validation error should reference artifactType {string} and id {string}', function (this: BmadWorld, artType: string, id: string) {
    const ctx = getCtx(this);
    const msg = ctx.mockWebview.postedMessages.find((m: any) => m.type === 'validationError');
    assert.ok(msg, 'No validationError message found');
    assert.strictEqual(msg.artifactType, artType);
    assert.strictEqual(msg.artifactId, id);
});

Then('the {string} command should have been called', function (this: BmadWorld, command: string) {
    const ctx = getCtx(this);
    assert.ok(ctx.commandCalls.has(command), `Command "${command}" was not called. Called: ${Array.from(ctx.commandCalls.keys()).join(', ')}`);
});

Then('the {string} command should not have been called', function (this: BmadWorld, command: string) {
    const ctx = getCtx(this);
    assert.ok(!ctx.commandCalls.has(command), `Command "${command}" was called but shouldn't have been`);
});

Then('an error message should have been shown', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.ok(ctx.errorMessageShown !== null, 'No error message was shown');
});

Then('a warning message should have been shown', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.ok(ctx.warningMessageShown !== null, 'No warning message was shown');
});

Then('the workspace config should have been updated with {string} set to {string}', function (this: BmadWorld, key: string, value: string) {
    const ctx = getCtx(this);
    const match = ctx.configUpdates.find((u: any) => u.key === key && u.value === value);
    assert.ok(match, `Config not updated with ${key}="${value}". Updates: ${JSON.stringify(ctx.configUpdates)}`);
});

Then('the workspace config should not have been updated', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.strictEqual(ctx.configUpdates.length, 0, `Config was updated: ${JSON.stringify(ctx.configUpdates)}`);
});

Then('the fix result should indicate failure with error about already in progress', function (this: BmadWorld) {
    const ctx = getCtx(this);
    const msg = ctx.mockWebview.postedMessages.find((m: any) => m.type === 'schemaFixResult');
    assert.ok(msg, 'No schemaFixResult message');
    assert.strictEqual(msg.success, false);
    assert.ok(msg.error && msg.error.includes('already in progress'), `Error message should mention "already in progress": ${msg.error}`);
});

Then('the webview should have received a {string} message with cancelled true', function (this: BmadWorld, type: string) {
    const ctx = getCtx(this);
    const msg = ctx.mockWebview.postedMessages.find((m: any) => m.type === type);
    assert.ok(msg, `No "${type}" message found`);
    assert.strictEqual(msg.cancelled, true);
});

Then('the store backup should have been called', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.strictEqual(ctx.mockStore._backupCalled, true, 'backupArtifactFiles was not called');
});

Then('the store fixAndSyncToFiles should have been called', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.strictEqual(ctx.mockStore._fixAndSyncCalled, true, 'fixAndSyncToFiles was not called');
});

Then('the store loadFromFolder should have been called', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.ok(ctx.mockStore._loadFromFolderCalls.length > 0, 'loadFromFolder was not called');
});

Then('the webview should have received a {string} message with an error', function (this: BmadWorld, type: string) {
    const ctx = getCtx(this);
    const msg = ctx.mockWebview.postedMessages.find((m: any) => m.type === type);
    assert.ok(msg, `No "${type}" message found`);
    assert.ok(msg.error, `Message should have an error field: ${JSON.stringify(msg)}`);
});

Then('the file should have been written', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.ok(ctx.fileWrites.length > 0, 'No file was written');
});

Then('the file should not have been written', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.strictEqual(ctx.fileWrites.length, 0, 'A file was unexpectedly written');
});

Then('the {string} command should have been executed', function (this: BmadWorld, command: string) {
    const ctx = getCtx(this);
    const match = ctx.executeCommandCalls.find((c: any) => c[0] === command);
    assert.ok(match, `Command "${command}" was not executed. Executed: ${JSON.stringify(ctx.executeCommandCalls)}`);
});
