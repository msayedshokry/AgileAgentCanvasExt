// ─── End-to-end regression test: updateArtifact rejects bad payloads at runtime ──
// Verifies that the typed contract (ArtifactChanges<T>) is enforced beyond
// compile time by the harness pre-flight policy check inside updateArtifact.
// Example: passing { status: 'invalid-lane' } to an epic should throw.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('vscode', () => {
    const emitter = { event: vi.fn(), fire: vi.fn(), dispose: vi.fn() };
    function EventEmitter() {
        // Allow `new EventEmitter()` — the store creates instances via
        // property initializers.
        return emitter;
    }
    return {
        EventEmitter,
        workspace: {
            getConfiguration: vi.fn(() => ({
                get: vi.fn((key: string, defaultValue: unknown) => {
                    // Auto-sync OFF in tests to avoid file I/O during assertion
                    if (key === 'autoSync') return false;
                    if (key === 'harness.enabled') return false; // default off; we enable per-test
                    return defaultValue;
                }),
            })),
            fs: {
                createDirectory: vi.fn(async () => {}),
                writeFile: vi.fn(async () => {}),
                readFile: vi.fn(async () => Buffer.from('{}')),
                delete: vi.fn(async () => {}),
                readDirectory: vi.fn(async () => []),
            },
        },
        window: {
            showInformationMessage: vi.fn(async () => undefined),
            showErrorMessage: vi.fn(async () => undefined),
        },
        Uri: {
            joinPath: vi.fn((base: any, ...parts: string[]) => ({ fsPath: `/${parts.join('/')}` })),
            file: vi.fn((path: string) => ({ fsPath: path })),
        },
        ExtensionContext: class {},
    };
});

vi.mock('pdfkit', () => ({
    default: vi.fn(() => ({ pipe: vi.fn(), text: vi.fn(), end: vi.fn() })),
}));

vi.mock('../harness/policy-engine', () => ({
    harnessEngine: {
        evaluate: vi.fn(async () => []),
    },
}));

vi.mock('../harness/harness-feedback', () => ({
    harnessFeedback: {
        recordEvaluation: vi.fn(),
    },
}));

vi.mock('../state/schema-validator', () => ({
    schemaValidator: {
        init: vi.fn(),
        validateChanges: vi.fn(() => ({ valid: true, errors: [] })),
        isInitialized: vi.fn(() => true),
    },
}));

// ── Imports (after mocks so modules receive mocked deps) ────────────────────

import { ArtifactStore } from '../state/artifact-store';
import { harnessEngine } from '../harness/policy-engine';
import * as vscode from 'vscode';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('updateArtifact — bad payloads rejected at runtime', () => {
    let store: ArtifactStore;

    beforeEach(() => {
        // Fresh store per test
        const ctx = { subscriptions: [] } as unknown as vscode.ExtensionContext;
        store = new ArtifactStore(ctx);
        // Reset harness engine mock each test
        vi.mocked(harnessEngine.evaluate).mockReset();
        // Enable harness for these tests
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn((key: string) => {
                if (key === 'harness.enabled') return true;
                if (key === 'autoSync') return false;
                return undefined;
            }),
        } as any);
    });

    it('rejects an epic update with a status blocked by harness policies', async () => {
        // Create an epic in the store
        const epic: any = {
            id: 'EPIC-1',
            title: 'Test Epic',
            status: 'draft',
            stories: [],
            goal: 'Test goal',
        };
        store.addEpic(epic);

        // Harness blocks the status change
        vi.mocked(harnessEngine.evaluate).mockResolvedValueOnce([
            { policyId: 'epic-status-valid-lane', passed: false, severity: 'blocking' },
        ] as any);

        await expect(
            store.updateArtifact('epic', 'EPIC-1', { status: 'invalid-lane' })
        ).rejects.toThrow('Blocked by policies: epic-status-valid-lane');
    });

    it('accepts a valid epic update when harness passes', async () => {
        store.addEpic({
            id: 'EPIC-2',
            title: 'Valid Epic',
            status: 'draft',
            stories: [],
            goal: '',
        } as any);

        // Harness allows it
        vi.mocked(harnessEngine.evaluate).mockResolvedValueOnce([]);

        await expect(
            store.updateArtifact('epic', 'EPIC-2', { status: 'in-progress' })
        ).resolves.toBeUndefined();
    });

    it('skips harness check when harness.enabled is false', async () => {
        // Disable harness
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn((key: string) => {
                if (key === 'harness.enabled') return false;
                if (key === 'autoSync') return false;
                return undefined;
            }),
        } as any);

        store.addEpic({
            id: 'EPIC-3',
            title: 'No-Harness Epic',
            status: 'draft',
            stories: [],
            goal: '',
        } as any);

        // Harness would block, but it's disabled — should NOT throw
        vi.mocked(harnessEngine.evaluate).mockResolvedValueOnce([
            { policyId: 'epic-status-valid-lane', passed: false, severity: 'blocking' },
        ] as any);

        await expect(
            store.updateArtifact('epic', 'EPIC-3', { status: 'invalid-lane' })
        ).resolves.toBeUndefined();
    });

    it('rejects an epic with multiple blocking policies', async () => {
        store.addEpic({
            id: 'EPIC-4',
            title: 'Multi-Block Epic',
            status: 'draft',
            stories: [],
            goal: '',
        } as any);

        vi.mocked(harnessEngine.evaluate).mockResolvedValueOnce([
            { policyId: 'epic-status-valid-lane', passed: false, severity: 'blocking' },
            { policyId: 'epic-required-title', passed: false, severity: 'blocking' },
        ] as any);

        await expect(
            store.updateArtifact('epic', 'EPIC-4', { status: 'invalid-lane' })
        ).rejects.toThrow('Blocked by policies: epic-status-valid-lane, epic-required-title');
    });
});
