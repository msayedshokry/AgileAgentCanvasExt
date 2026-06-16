// ─── Regression tests: readArtifactFile/getArtifactFileUri prefix-iter fallback ───
//
// The artifact store uses two on-disk file conventions:
//   1. Singleton keys map directly:  sourceFiles.set('vision', fileUri)
//   2. Per-id array entries use a per-id composite key:
//        sourceFiles.set('readinessReport:RR-1', fileUri)
//
// The pre-fix readArtifactFile/storeKey did a single sourceFiles.get(storeKey)
// lookup, which always missed for case (2) since neither `readinessReport` nor
// any other token in sourceFiles match the per-id key verbatim. This was a
// silent null-return that the post-save schema validation path in
// workflow-executor.ts masked by falling back to a synthetic envelope.
//
// The fix adds an optional `artifactId` parameter plus a prefix-iter fallback
// for `${storeKey}:` entries, so callers can:
//   - Pass nothing: get either direct singleton match or first prefix-iter match
//   - Pass artifactId: get the specific per-id file

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
                get: vi.fn(() => false),
            })),
            fs: {
                createDirectory: vi.fn(async () => {}),
                writeFile: vi.fn(async () => {}),
                readFile: vi.fn(async (uri: any) => {
                    // Return the URI's path as a fake JSON buffer so we can verify
                    // which file was actually read.
                    return Buffer.from(JSON.stringify({ meta: 'mocked', fsPath: uri?.fsPath ?? String(uri) }));
                }),
                delete: vi.fn(async () => {}),
                readDirectory: vi.fn(async () => []),
            },
        },
        window: {
            showInformationMessage: vi.fn(async () => undefined),
            showErrorMessage: vi.fn(async () => undefined),
        },
        Uri: {
            joinPath: vi.fn((base: any, ...parts: string[]) => ({ fsPath: `/${parts.join('/')}`, joinPath: 'mock' })),
            file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
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
import * as vscode from 'vscode';

function newStore(): ArtifactStore {
    return new ArtifactStore({ subscriptions: [] } as unknown as vscode.ExtensionContext);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('readArtifactFile + getArtifactFileUri lookup behaviour', () => {
    let store: ArtifactStore;

    beforeEach(() => {
        store = newStore();
        // Default: pre-populate sourceFiles with both singleton and per-id patterns
        (store as any).sourceFiles = new Map<string, any>([
            // Singleton entries (one file for whole artifact)
            ['vision', { fsPath: '/vision.json' }],
            ['prd', { fsPath: '/prd.json' }],
            ['epics', { fsPath: '/epics.json' }],
            // Per-id entries (one file per array entry)
            ['readinessReport:RR-1', { fsPath: '/readiness-report-1.json' }],
            ['readinessReport:RR-2', { fsPath: '/readiness-report-2.json' }],
            ['sprintStatus:SP-1', { fsPath: '/sprint-status-1.json' }],
        ]);
    });

    // ─── 1. Direct singleton lookup (pre-existing behaviour) ────────────────

    describe('direct singleton lookup', () => {
        it("getArtifactFileUri('vision') returns the singleton entry", () => {
            const uri = store.getArtifactFileUri('vision');
            expect(uri?.fsPath).toBe('/vision.json');
        });

        it("getArtifactFileUri('epics') returns the singleton entry", () => {
            const uri = store.getArtifactFileUri('epics');
            expect(uri?.fsPath).toBe('/epics.json');
        });

        it("readArtifactFile('vision') reads the singleton file", async () => {
            const data = await store.readArtifactFile('vision');
            expect(data).toBeDefined();
            expect((data as any).fsPath).toBe('/vision.json');
        });
    });

    // ─── 2. Per-id lookup via optional artifactId parameter (new behaviour) ──

    describe('per-id lookup with artifactId parameter', () => {
        it("getArtifactFileUri('readinessReport', 'RR-1') returns the per-id file", () => {
            const uri = store.getArtifactFileUri('readinessReport', 'RR-1');
            expect(uri?.fsPath).toBe('/readiness-report-1.json');
        });

        it("getArtifactFileUri('sprintStatus', 'SP-1') returns the per-id file", () => {
            const uri = store.getArtifactFileUri('sprintStatus', 'SP-1');
            expect(uri?.fsPath).toBe('/sprint-status-1.json');
        });

        it("readArtifactFile('readinessReport', 'RR-2') reads the correct per-id file", async () => {
            const data = await store.readArtifactFile('readinessReport', 'RR-2');
            expect((data as any).fsPath).toBe('/readiness-report-2.json');
        });
    });

    // ─── 3. Prefix-iter fallback when no artifactId is provided ─────────────

    describe('prefix-iter fallback (no artifactId)', () => {
        it("getArtifactFileUri('readinessReport') falls back to first per-id match", () => {
            const uri = store.getArtifactFileUri('readinessReport');
            expect(uri).not.toBeNull();
            expect(uri?.fsPath).toMatch(/^.*\.json$/);
            // Map insertion order: 'readinessReport:RR-1' is inserted before 'RR-2'
            expect(uri?.fsPath).toBe('/readiness-report-1.json');
        });

        it("getArtifactFileUri('sprintStatus') falls back to first per-id match", () => {
            const uri = store.getArtifactFileUri('sprintStatus');
            expect(uri?.fsPath).toBe('/sprint-status-1.json');
        });

        it("getArtifactFileUri('vision') prefers direct over prefix-iter", () => {
            // Even though there's no 'vision:***' entry, the direct match wins
            const uri = store.getArtifactFileUri('vision');
            expect(uri?.fsPath).toBe('/vision.json');
        });
    });

    // ─── 4. Returns null when no match ──────────────────────────────────────

    describe('null return paths', () => {
        it('returns null when the key is unknown and no prefix matches', () => {
            expect(store.getArtifactFileUri('nonexistent')).toBeNull();
            expect(store.getArtifactFileUri('nonexistent', 'whatever')).toBeNull();
        });

        it('returns null when artifactId is provided but the per-id key is absent', () => {
            expect(store.getArtifactFileUri('readinessReport', 'RR-NONE')).toBeNull();
        });

        it('readArtifactFile returns null when no URI matches', async () => {
            expect(await store.readArtifactFile('nonexistent')).toBeNull();
        });
    });

    // ─── 5. Prefix boundary safety: does NOT match unrelated keys ────────────

    describe('prefix boundary safety', () => {
        beforeEach(() => {
            // Add a tricky case: a key that looks like a substring prefix but is not
            (store as any).sourceFiles.set('readinessReportFoo:RR-1', { fsPath: '/foo.json' });
        });

        it('does not match keys that lack the colons separator', () => {
            // Our prefix is `${storeKey}:` which requires the extra colon delimiter,
            // so 'readinessReportFoo' is NOT mistakenly matched against 'readinessReport'.
            const uri = store.getArtifactFileUri('readinessReport');
            // Map iteration order preserves insertion: 'readinessReport:RR-1' set first.
            expect(uri?.fsPath).toBe('/readiness-report-1.json');
        });
    });

});
