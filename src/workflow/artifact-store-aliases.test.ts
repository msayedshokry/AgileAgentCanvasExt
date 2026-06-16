// ─── End-to-end regression test: short-alias parity for updateArtifact + deleteArtifact ───
// Verifies three things for the camelCase short-aliases ('nfr', 'readiness', 'sprint'):
//
//   1. updateArtifact accepts both kebab-case ('readiness-report', 'sprint-status') and
//      camelCase ('readiness', 'sprint') short-aliases.
//   2. updateArtifact writes to the same PLURAL ARRAY store key already used by
//      getState(), loadProjectFiles(), syncToFiles(), reconcileDerivedState(), and
//      deleteArtifact() — i.e. readinessReports (plural) and sprintStatuses (plural).
//      Previously updateArtifact wrote to a singleton readinessReport / sprintStatus
//      key that no other code path used. The asymmetry meant an update-then-delete
//      round-trip would not remove what was just written.
//   3. deleteArtifact removes the entry from the plural array by id (or metadata.id).
//
// The 'nfr' / 'nfr-assessment' short alias is genuinely a singleton (NFRAssessment),
// so its tests assert a single-object key shape.
//
// Why we read raw `(store as any).artifacts.get(...)` instead of `store.getState()`:
//   The plural arrays and singleton keys both flow through `getState()`, but the
//   raw map guarantees a single observation point regardless of any future change to
//   the public state shape.

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
                    if (key === 'autoSync') return false;        // No disk writes in tests
                    if (key === 'harness.enabled') return true;  // Exercise the harness path
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

function newStore(): ArtifactStore {
    const ctx = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    return new ArtifactStore(ctx);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('short-alias parity: kebab-case === camelCase for updateArtifact & deleteArtifact', () => {
    let store: ArtifactStore;

    beforeEach(() => {
        store = newStore();
        vi.mocked(harnessEngine.evaluate).mockReset();
        vi.mocked(harnessEngine.evaluate).mockResolvedValue([]);
    });

    // ─── 1. nfr / nfr-assessment: genuinely a singleton (NFRAssessment) ─────

    describe('nfr / nfr-assessment — singleton (writes to nfrAssessment)', () => {
        it("'nfr' writes to nfrAssessment", async () => {
            await store.updateArtifact('nfr', 'NFR-1', { status: 'verified' });
            const stored = (store as any).artifacts.get('nfrAssessment');
            expect(stored).toBeDefined();
            expect(stored.id).toBe('NFR-1');
            expect(stored.status).toBe('verified');
        });

        it("'nfr-assessment' writes to nfrAssessment", async () => {
            await store.updateArtifact('nfr-assessment', 'NFR-1', { status: 'verified' });
            const stored = (store as any).artifacts.get('nfrAssessment');
            expect(stored.id).toBe('NFR-1');
            expect(stored.status).toBe('verified');
        });

        it("delete via either form unsets nfrAssessment singleton", async () => {
            await store.updateArtifact('nfr', 'NFR-DEL', { status: 'verified' });
            await store.deleteArtifact('nfr-assessment', 'NFR-DEL');
            expect((store as any).artifacts.get('nfrAssessment')).toBeUndefined();

            await store.updateArtifact('nfr-assessment', 'NFR-DEL-2', { status: 'verified' });
            await store.deleteArtifact('nfr', 'NFR-DEL-2');
            expect((store as any).artifacts.get('nfrAssessment')).toBeUndefined();
        });
    });

    // ─── 2. readiness / readiness-report: plural array (readinessReports) ────

    describe('readiness / readiness-report — plural array (writes to readinessReports)', () => {
        it("'readiness' appends a new entry to readinessReports", async () => {
            await store.updateArtifact('readiness', 'RR-1', { status: 'verified' });
            const arr = (store as any).artifacts.get('readinessReports');
            expect(Array.isArray(arr)).toBe(true);
            expect(arr).toHaveLength(1);
            expect(arr[0].id).toBe('RR-1');
            expect(arr[0].status).toBe('verified');
        });

        it("'readiness-report' appends a new entry to readinessReports", async () => {
            await store.updateArtifact('readiness-report', 'RR-1', { status: 'verified' });
            const arr = (store as any).artifacts.get('readinessReports');
            expect(arr).toHaveLength(1);
            expect(arr[0].id).toBe('RR-1');
            expect(arr[0].status).toBe('verified');
        });

        it("'readiness' updates an existing entry in-place by id", async () => {
            // Pre-populate the plural array via direct store write
            (store as any).artifacts.set('readinessReports', [
                { id: 'RR-EXISTING', status: 'draft', summary: 'old' },
            ]);
            await store.updateArtifact('readiness', 'RR-EXISTING', { status: 'verified', summary: 'new' });
            const arr = (store as any).artifacts.get('readinessReports');
            expect(arr).toHaveLength(1);  // No duplicate push
            expect(arr[0].id).toBe('RR-EXISTING');
            expect(arr[0].status).toBe('verified');
            expect(arr[0].summary).toBe('new');
        });

        it("delete via either form removes the entry from readinessReports", async () => {
            (store as any).artifacts.set('readinessReports', [
                { id: 'RR-DEL-A', metadata: { id: 'RR-DEL-A' }, status: 'verified' },
                { id: 'RR-DEL-B', metadata: { id: 'RR-DEL-B' }, status: 'verified' },
            ]);

            await store.deleteArtifact('readiness', 'RR-DEL-A');
            let arr = (store as any).artifacts.get('readinessReports');
            expect(arr).toHaveLength(1);
            expect(arr[0].id).toBe('RR-DEL-B');

            (store as any).artifacts.set('readinessReports', [
                { id: 'RR-DEL-C', metadata: { id: 'RR-DEL-C' }, status: 'verified' },
                { id: 'RR-DEL-D', metadata: { id: 'RR-DEL-D' }, status: 'verified' },
            ]);
            await store.deleteArtifact('readiness-report', 'RR-DEL-C');
            arr = (store as any).artifacts.get('readinessReports');
            expect(arr).toHaveLength(1);
            expect(arr[0].id).toBe('RR-DEL-D');
        });

        it("round-trip: update then delete via the same id leaves the array empty", async () => {
            // This regression would FAIL when updateArtifact writes a singleton
            // because deleteArtifact filters the plural array (no overlap).
            await store.updateArtifact('readiness', 'RR-RT', { status: 'verified' });
            expect((store as any).artifacts.get('readinessReports')).toHaveLength(1);

            await store.deleteArtifact('readiness-report', 'RR-RT');
            expect((store as any).artifacts.get('readinessReports')).toHaveLength(0);
        });

        it('delete via either form leaves other entries untouched', async () => {
            (store as any).artifacts.set('readinessReports', [
                { id: 'KEEP-1', status: 'verified' },
                { id: 'REMOVE', status: 'done' },
                { id: 'KEEP-2', status: 'verified' },
            ]);

            await store.deleteArtifact('readiness', 'REMOVE');
            const arr = (store as any).artifacts.get('readinessReports');
            expect(arr).toHaveLength(2);
            expect(arr.map((a: any) => a.id)).toEqual(['KEEP-1', 'KEEP-2']);
        });
    });

    // ─── 3. sprint / sprint-status: plural array (sprintStatuses) ─────────────

    describe('sprint / sprint-status — plural array (writes to sprintStatuses)', () => {
        it("'sprint' appends a new entry to sprintStatuses", async () => {
            await store.updateArtifact('sprint', 'SP-1', { status: 'active' });
            const arr = (store as any).artifacts.get('sprintStatuses');
            expect(Array.isArray(arr)).toBe(true);
            expect(arr).toHaveLength(1);
            expect(arr[0].id).toBe('SP-1');
            expect(arr[0].status).toBe('active');
        });

        it("'sprint-status' appends a new entry to sprintStatuses", async () => {
            await store.updateArtifact('sprint-status', 'SP-1', { status: 'active' });
            const arr = (store as any).artifacts.get('sprintStatuses');
            expect(arr).toHaveLength(1);
            expect(arr[0].id).toBe('SP-1');
            expect(arr[0].status).toBe('active');
        });

        it("'sprint' updates an existing entry in-place by id", async () => {
            (store as any).artifacts.set('sprintStatuses', [
                { id: 'SP-EXISTING', status: 'draft', summary: 'old' },
            ]);
            await store.updateArtifact('sprint', 'SP-EXISTING', { status: 'active', summary: 'new' });
            const arr = (store as any).artifacts.get('sprintStatuses');
            expect(arr).toHaveLength(1);  // No duplicate push
            expect(arr[0].id).toBe('SP-EXISTING');
            expect(arr[0].status).toBe('active');
            expect(arr[0].summary).toBe('new');
        });

        it("delete via either form removes the entry from sprintStatuses", async () => {
            (store as any).artifacts.set('sprintStatuses', [
                { id: 'SP-DEL-A', metadata: { id: 'SP-DEL-A' }, status: 'active' },
                { id: 'SP-DEL-B', metadata: { id: 'SP-DEL-B' }, status: 'active' },
            ]);

            await store.deleteArtifact('sprint', 'SP-DEL-A');
            let arr = (store as any).artifacts.get('sprintStatuses');
            expect(arr).toHaveLength(1);
            expect(arr[0].id).toBe('SP-DEL-B');

            (store as any).artifacts.set('sprintStatuses', [
                { id: 'SP-DEL-C', metadata: { id: 'SP-DEL-C' }, status: 'active' },
                { id: 'SP-DEL-D', metadata: { id: 'SP-DEL-D' }, status: 'active' },
            ]);
            await store.deleteArtifact('sprint-status', 'SP-DEL-C');
            arr = (store as any).artifacts.get('sprintStatuses');
            expect(arr).toHaveLength(1);
            expect(arr[0].id).toBe('SP-DEL-D');
        });

        it("round-trip: update then delete via the same id leaves the array empty", async () => {
            await store.updateArtifact('sprint', 'SP-RT', { status: 'active' });
            expect((store as any).artifacts.get('sprintStatuses')).toHaveLength(1);

            await store.deleteArtifact('sprint-status', 'SP-RT');
            expect((store as any).artifacts.get('sprintStatuses')).toHaveLength(0);
        });

        it('delete via either form leaves other entries untouched', async () => {
            (store as any).artifacts.set('sprintStatuses', [
                { id: 'KEEP-1', status: 'active' },
                { id: 'REMOVE', status: 'done' },
                { id: 'KEEP-2', status: 'active' },
            ]);

            await store.deleteArtifact('sprint', 'REMOVE');
            const arr = (store as any).artifacts.get('sprintStatuses');
            expect(arr).toHaveLength(2);
            expect(arr.map((a: any) => a.id)).toEqual(['KEEP-1', 'KEEP-2']);
        });
    });

    // ─── 4. Cross-form parity: kebab-case and camelCase produce identical store maps

    describe('cross-form parity — fresh-store, same-payload produces deeply-equal store maps', () => {
        it('nfr vs nfr-assessment', async () => {
            const a = newStore(), b = newStore();
            await a.updateArtifact('nfr', 'NFR-PAR', { status: 'verified' });
            await b.updateArtifact('nfr-assessment', 'NFR-PAR', { status: 'verified' });
            expect((a as any).artifacts.get('nfrAssessment'))
                .toEqual((b as any).artifacts.get('nfrAssessment'));
        });

        it('readiness vs readiness-report', async () => {
            const a = newStore(), b = newStore();
            await a.updateArtifact('readiness', 'RR-PAR', { status: 'verified' });
            await b.updateArtifact('readiness-report', 'RR-PAR', { status: 'verified' });
            expect((a as any).artifacts.get('readinessReports'))
                .toEqual((b as any).artifacts.get('readinessReports'));
        });

        it('sprint vs sprint-status', async () => {
            const a = newStore(), b = newStore();
            await a.updateArtifact('sprint', 'SP-PAR', { status: 'active' });
            await b.updateArtifact('sprint-status', 'SP-PAR', { status: 'active' });
            expect((a as any).artifacts.get('sprintStatuses'))
                .toEqual((b as any).artifacts.get('sprintStatuses'));
        });
    });
});
