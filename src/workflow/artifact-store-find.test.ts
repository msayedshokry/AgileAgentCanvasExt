// ─── Regression tests: findArtifactById covers readinessReports + sprintStatuses plural arrays ───
//
// Pre-migration, findArtifactById only iterated `vision`/`prd`/`architecture`/`product-brief`/
// requirements/`epics`/nested `stories`+`use-cases`/`testCases`/test-strategies. It did NOT
// touch `readinessReports` or `sprintStatuses`. As a result, every harness pre-flight in
// `updateArtifact` saw `existingArtifact = {}` for these types \u2014 auto-fix policies could
// overwrite real content with placeholders (the same data-loss pattern that previously
// bit epic updates; commented at length in updateArtifact line ~736).
//
// These tests verify the extension: search by direct `id` and by `metadata.id`,
// return the matched entry as `{ type: 'readiness-report' | 'sprint-status', artifact }`,
// and pass it through to updateArtifact's harness candidate-merge path.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('vscode', () => {
    function EventEmitter() {
        return { event: vi.fn(), fire: vi.fn(), dispose: vi.fn() };
    }
    return {
        EventEmitter,
        workspace: {
            getConfiguration: vi.fn(() => ({
                get: vi.fn((key: string, defaultValue: unknown) => {
                    if (key === 'autoSync') return false;
                    if (key === 'harness.enabled') return true;
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
        evaluate: vi.fn(async (_input: any, _phase: string) => {
            // Inspect the harness candidate passed in; return non-blocking result.
            return [{ policyId: 'no-op', passed: true, severity: 'info' } as any];
        }),
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

function newStore(): ArtifactStore {
    return new ArtifactStore({ subscriptions: [] } as unknown as vscode.ExtensionContext);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('findArtifactById \u2014 plural-array coverage', () => {
    let store: ArtifactStore;

    beforeEach(() => {
        store = newStore();
        vi.mocked(harnessEngine.evaluate).mockReset();
        vi.mocked(harnessEngine.evaluate).mockResolvedValue([]);
    });

    // ─── 1. Readiness reports: search by `id` and by `metadata.id` ────────────

    describe('readinessReports', () => {
        beforeEach(() => {
            (store as any).artifacts.set('readinessReports', [
                { id: 'RR-1', status: 'draft', summary: 'first' },
                { id: 'RR-2', metadata: { id: 'RR-2' }, status: 'verified' }, // no top-level id; only metadata.id
                { id: 'RR-3', status: 'verified' },
            ]);
        });

        it('finds an entry by top-level id', () => {
            const result = store.findArtifactById('RR-1');
            expect(result).not.toBeNull();
            expect(result?.type).toBe('readiness-report');
            expect(result?.artifact.id).toBe('RR-1');
            expect(result?.artifact.summary).toBe('first');
        });

        it('finds an entry whose id is only on metadata', () => {
            const result = store.findArtifactById('RR-2');
            expect(result).not.toBeNull();
            expect(result?.type).toBe('readiness-report');
            expect(result?.artifact.metadata.id).toBe('RR-2');
        });

        it('returns null when no entry matches', () => {
            const result = store.findArtifactById('RR-NONE');
            expect(result).toBeNull();
        });
    });

    // ─── 2. Sprint statuses: search by `id` and by `metadata.id` ──────────────

    describe('sprintStatuses', () => {
        beforeEach(() => {
            (store as any).artifacts.set('sprintStatuses', [
                { id: 'SP-1', status: 'active', summary: 'first sprint' },
                { id: 'SP-2', metadata: { id: 'SP-2' }, status: 'done' },
                { id: 'SP-3', status: 'planned' },
            ]);
        });

        it('finds an entry by top-level id', () => {
            const result = store.findArtifactById('SP-1');
            expect(result).not.toBeNull();
            expect(result?.type).toBe('sprint-status');
            expect(result?.artifact.id).toBe('SP-1');
            expect(result?.artifact.summary).toBe('first sprint');
        });

        it('finds an entry whose id is only on metadata', () => {
            const result = store.findArtifactById('SP-2');
            expect(result).not.toBeNull();
            expect(result?.type).toBe('sprint-status');
            expect(result?.artifact.metadata.id).toBe('SP-2');
        });

        it('returns null when no entry matches', () => {
            const result = store.findArtifactById('SP-NONE');
            expect(result).toBeNull();
        });
    });

    // ─── 3. End-to-end: harness pre-flight now sees existing artifact ───────────

    describe('integration with updateArtifact harness pre-flight', () => {
        it('harness candidate includes the existing readiness entry after a status-only update', async () => {
            // Pre-populate
            (store as any).artifacts.set('readinessReports', [
                { id: 'RR-E2E', status: 'draft', summary: 'existing summary' },
            ]);

            // Capture the harness candidate seen by the mocked policy engine
            let capturedCandidate: any = null;
            vi.mocked(harnessEngine.evaluate).mockImplementation(async (input: any) => {
                capturedCandidate = input.artifact;
                return [];
            });

            await store.updateArtifact('readiness-report', 'RR-E2E', { status: 'verified' });

            // Without the findArtifactById extension, capturedCandidate would be
            // just `{ status: 'verified' }` (existingArtifact defaulted to {}).
            // With the extension, it should be the merged { id: 'RR-E2E', status: 'verified',
            // summary: 'existing summary' } \u2014 proving the harness saw the existing content.
            expect(capturedCandidate).toBeDefined();
            expect(capturedCandidate.id).toBe('RR-E2E');
            expect(capturedCandidate.summary).toBe('existing summary');
            expect(capturedCandidate.status).toBe('verified');
        });

        it('harness candidate includes the existing sprint entry after a status-only update', async () => {
            (store as any).artifacts.set('sprintStatuses', [
                { id: 'SP-E2E', status: 'planned', summary: 'pre-existing sprint' },
            ]);

            let capturedCandidate: any = null;
            vi.mocked(harnessEngine.evaluate).mockImplementation(async (input: any) => {
                capturedCandidate = input.artifact;
                return [];
            });

            await store.updateArtifact('sprint-status', 'SP-E2E', { status: 'active' });

            expect(capturedCandidate).toBeDefined();
            expect(capturedCandidate.id).toBe('SP-E2E');
            expect(capturedCandidate.summary).toBe('pre-existing sprint');
            expect(capturedCandidate.status).toBe('active');
        });

        it('harness candidate matches via metadata.id when top-level id is absent', async () => {
            (store as any).artifacts.set('sprintStatuses', [
                { metadata: { id: 'SP-META' }, status: 'planned' },
            ]);

            let capturedCandidate: any = null;
            vi.mocked(harnessEngine.evaluate).mockImplementation(async (input: any) => {
                capturedCandidate = input.artifact;
                return [];
            });

            await store.updateArtifact('sprint-status', 'SP-META', { status: 'active' });

            expect(capturedCandidate).toBeDefined();
            expect(capturedCandidate.metadata.id).toBe('SP-META');
            expect(capturedCandidate.status).toBe('active');
        });
    });
});
