import { describe, it, expect, vi } from 'vitest';
import {
    createEpic,
    createStory,
    createRequirement,
    createOrUpdateVision,
    createUseCase,
    createProductBrief,
    createPRD,
    createArchitecture,
    createTestCase,
    createTestStrategy,
    addRequirement,
    addEpic,
    addStory,
} from './artifact-factory';
import type { Epic, Story } from '../types';

/** Build a minimal artifacts Map pre-seeded with the default state shape. */
function fakeArtifacts(): Map<string, any> {
    const m = new Map<string, any>();
    m.set('epics', []);
    m.set('requirements', {
        functional: [],
        nonFunctional: [],
        additional: [],
    });
    return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// createEpic
// ─────────────────────────────────────────────────────────────────────────────

describe('createEpic', () => {
    it('calls notifyChange exactly once', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        createEpic(artifacts, notifyChange);

        expect(notifyChange).toHaveBeenCalledOnce();
    });

    it('appends the new epic to the epics array', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const epic = createEpic(artifacts, notifyChange);

        const epics = artifacts.get('epics') as any[];
        expect(epics).toHaveLength(1);
        expect(epics[0]).toEqual(epic);
    });

    it('assigns EPIC-1 on an empty store, EPIC-2 when one exists', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const first = createEpic(artifacts, notifyChange);
        expect(first.id).toBe('EPIC-1');

        const second = createEpic(artifacts, notifyChange);
        expect(second.id).toBe('EPIC-2');
    });

    it('works gracefully when artifacts map has no epics key (defaults to empty array)', () => {
        const artifacts = new Map<string, any>(); // no 'epics' key
        const notifyChange = vi.fn();

        // Should not throw — the factory defaults to []
        const epic = createEpic(artifacts, notifyChange);
        expect(epic.id).toBe('EPIC-1');
        expect(notifyChange).toHaveBeenCalledOnce();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// createStory
// ─────────────────────────────────────────────────────────────────────────────

describe('createStory', () => {
    it('calls notifyChange exactly once when an epic already exists', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();
        const epic = createEpic(artifacts, notifyChange);
        notifyChange.mockClear(); // reset after createEpic's call

        createStory(artifacts, notifyChange, epic.id);

        expect(notifyChange).toHaveBeenCalledOnce();
    });

    it('appends the story to the target epic', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();
        const epic = createEpic(artifacts, notifyChange);
        notifyChange.mockClear();

        const story = createStory(artifacts, notifyChange, epic.id);

        const epics = artifacts.get('epics') as any[];
        expect(epics[0].stories).toHaveLength(1);
        expect(epics[0].stories[0]).toEqual(story);
    });

    it('auto-creates an epic when the store has no epics', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const story = createStory(artifacts, notifyChange);

        const epics = artifacts.get('epics') as any[];
        expect(epics).toHaveLength(1);
        expect(epics[0].stories).toHaveLength(1);
        expect(epics[0].stories[0]).toEqual(story);
    });

    it('calls notifyChange twice when auto-creating an epic (once for epic, once for story)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        createStory(artifacts, notifyChange);

        // Once from the auto-created createEpic, once from createStory itself
        expect(notifyChange).toHaveBeenCalledTimes(2);
    });

    it('throws when epicId does not match any epic', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        expect(() => createStory(artifacts, notifyChange, 'EPIC-99')).toThrow('Epic EPIC-99 not found');
        expect(notifyChange).not.toHaveBeenCalled();
    });

    it('throws when epics exist but no epicId is provided', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();
        createEpic(artifacts, notifyChange);
        notifyChange.mockClear();

        expect(() => createStory(artifacts, notifyChange)).toThrow(
            'createStory: epicId is required when epics exist'
        );
        expect(notifyChange).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// addRequirement
// ─────────────────────────────────────────────────────────────────────────────

describe('addRequirement', () => {
    it('calls notifyChange exactly once', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        addRequirement(artifacts, notifyChange, {
            id: 'FR-1',
            title: 'Test',
            description: '',
        });

        expect(notifyChange).toHaveBeenCalledOnce();
    });

    it('appends the requirement to the functional requirements array', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        addRequirement(artifacts, notifyChange, {
            id: 'FR-1',
            title: 'Test',
            description: '',
        });

        const reqs = artifacts.get('requirements');
        expect(reqs.functional).toHaveLength(1);
        expect(reqs.functional[0].id).toBe('FR-1');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// createRequirement
// ─────────────────────────────────────────────────────────────────────────────

describe('createRequirement', () => {
    it('calls notifyChange exactly once (delegates to addRequirement)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        createRequirement(artifacts, notifyChange);

        expect(notifyChange).toHaveBeenCalledOnce();
    });

    it('assigns FR-1 on an empty store, FR-2 when one exists', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const first = createRequirement(artifacts, notifyChange);
        expect(first.id).toBe('FR-1');

        const second = createRequirement(artifacts, notifyChange);
        expect(second.id).toBe('FR-2');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// createOrUpdateVision
// ─────────────────────────────────────────────────────────────────────────────

describe('createOrUpdateVision', () => {
    it('calls notifyChange when no vision exists (creates new)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        createOrUpdateVision(artifacts, notifyChange);

        expect(notifyChange).toHaveBeenCalledOnce();
        expect(artifacts.get('vision')).toBeDefined();
        expect(artifacts.get('vision').status).toBe('draft');
    });

    it('does NOT call notifyChange when vision already exists (idempotent)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        // First call creates
        createOrUpdateVision(artifacts, notifyChange);
        expect(notifyChange).toHaveBeenCalledOnce();
        notifyChange.mockClear();

        // Second call should be a no-op
        createOrUpdateVision(artifacts, notifyChange);
        expect(notifyChange).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// createUseCase
// ─────────────────────────────────────────────────────────────────────────────

describe('createUseCase', () => {
    it('calls notifyChange exactly once when an epic already exists', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();
        const epic = createEpic(artifacts, notifyChange);
        notifyChange.mockClear();

        createUseCase(artifacts, notifyChange, epic.id);

        expect(notifyChange).toHaveBeenCalledOnce();
    });

    it('appends the use case to the target epic', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();
        const epic = createEpic(artifacts, notifyChange);
        notifyChange.mockClear();

        const uc = createUseCase(artifacts, notifyChange, epic.id);

        const epics = artifacts.get('epics') as any[];
        expect(epics[0].useCases).toHaveLength(1);
        expect(epics[0].useCases[0]).toEqual(uc);
    });

    it('auto-creates an epic when the store has no epics', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const uc = createUseCase(artifacts, notifyChange);

        const epics = artifacts.get('epics') as any[];
        expect(epics).toHaveLength(1);
        expect(epics[0].useCases[0]).toEqual(uc);
    });

    it('calls notifyChange twice when auto-creating an epic (once for epic, once for use case)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        createUseCase(artifacts, notifyChange);

        expect(notifyChange).toHaveBeenCalledTimes(2);
    });

    it('throws when epicId does not match any epic', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        expect(() => createUseCase(artifacts, notifyChange, 'EPIC-99')).toThrow('Epic EPIC-99 not found');
        expect(notifyChange).not.toHaveBeenCalled();
    });

    it('throws when epics exist but no epicId is provided', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();
        createEpic(artifacts, notifyChange);
        notifyChange.mockClear();

        expect(() => createUseCase(artifacts, notifyChange)).toThrow(
            'createUseCase: epicId is required when epics exist'
        );
        expect(notifyChange).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// createProductBrief
// ─────────────────────────────────────────────────────────────────────────────

describe('createProductBrief', () => {
    it('calls notifyChange on first call (creates new)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const brief = createProductBrief(artifacts, notifyChange);

        expect(notifyChange).toHaveBeenCalledOnce();
        expect(brief.id).toBe('product-brief-1');
        expect(artifacts.get('productBrief')).toBe(brief);
    });

    it('does NOT call notifyChange on second call (returns existing)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const first = createProductBrief(artifacts, notifyChange);
        notifyChange.mockClear();

        const second = createProductBrief(artifacts, notifyChange);

        expect(notifyChange).not.toHaveBeenCalled();
        expect(second).toBe(first); // same object reference
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// createPRD
// ─────────────────────────────────────────────────────────────────────────────

describe('createPRD', () => {
    it('calls notifyChange on first call (creates new)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const prd = createPRD(artifacts, notifyChange);

        expect(notifyChange).toHaveBeenCalledOnce();
        expect(prd.id).toBe('prd-1');
        expect(artifacts.get('prd')).toBe(prd);
    });

    it('does NOT call notifyChange on second call (returns existing)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const first = createPRD(artifacts, notifyChange);
        notifyChange.mockClear();

        const second = createPRD(artifacts, notifyChange);

        expect(notifyChange).not.toHaveBeenCalled();
        expect(second).toBe(first);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// createArchitecture
// ─────────────────────────────────────────────────────────────────────────────

describe('createArchitecture', () => {
    it('calls notifyChange on first call (creates new)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const arch = createArchitecture(artifacts, notifyChange);

        expect(notifyChange).toHaveBeenCalledOnce();
        expect(arch.id).toBe('architecture-1');
        expect(artifacts.get('architecture')).toBe(arch);
    });

    it('does NOT call notifyChange on second call (returns existing)', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const first = createArchitecture(artifacts, notifyChange);
        notifyChange.mockClear();

        const second = createArchitecture(artifacts, notifyChange);

        expect(notifyChange).not.toHaveBeenCalled();
        expect(second).toBe(first);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// createTestCase
// ─────────────────────────────────────────────────────────────────────────────

describe('createTestCase', () => {
    it('calls notifyChange exactly once', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        createTestCase(artifacts, notifyChange);

        expect(notifyChange).toHaveBeenCalledOnce();
    });

    it('assigns TC-1 on an empty store, TC-2 when one exists', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const first = createTestCase(artifacts, notifyChange);
        expect(first.id).toBe('TC-1');

        const second = createTestCase(artifacts, notifyChange);
        expect(second.id).toBe('TC-2');
    });

    it('resolves epicId from a story when storyId is provided', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();
        const epic = createEpic(artifacts, notifyChange);
        const story = createStory(artifacts, notifyChange, epic.id);
        notifyChange.mockClear();

        const tc = createTestCase(artifacts, notifyChange, story.id);

        expect(tc.storyId).toBe(story.id);
        expect(tc.epicId).toBe(epic.id);
    });

    it('uses directEpicId when storyId not provided', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const tc = createTestCase(artifacts, notifyChange, undefined, 'EPIC-5');

        expect(tc.epicId).toBe('EPIC-5');
    });

    it('works gracefully when artifacts map has no testCases key', () => {
        const artifacts = new Map<string, any>();
        const notifyChange = vi.fn();

        const tc = createTestCase(artifacts, notifyChange);

        expect(tc.id).toBe('TC-1');
        expect(notifyChange).toHaveBeenCalledOnce();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// createTestStrategy
// ─────────────────────────────────────────────────────────────────────────────

describe('createTestStrategy', () => {
    // ── project-level (no epicId) ──
    describe('project-level (no epicId)', () => {
        it('calls notifyChange on first call (creates new)', () => {
            const artifacts = fakeArtifacts();
            const notifyChange = vi.fn();

            const ts = createTestStrategy(artifacts, notifyChange);

            expect(notifyChange).toHaveBeenCalledOnce();
            expect(ts.id).toBe('TS-1');
            expect(artifacts.get('testStrategy')).toBe(ts);
        });

        it('does NOT call notifyChange on second call (returns existing)', () => {
            const artifacts = fakeArtifacts();
            const notifyChange = vi.fn();

            const first = createTestStrategy(artifacts, notifyChange);
            notifyChange.mockClear();

            const second = createTestStrategy(artifacts, notifyChange);

            expect(notifyChange).not.toHaveBeenCalled();
            expect(second).toBe(first);
        });
    });

    // ── epic-level (with epicId) ──
    describe('epic-level (with epicId)', () => {
        it('calls notifyChange on first call for a target epic', () => {
            const artifacts = fakeArtifacts();
            const notifyChange = vi.fn();
            const epic = createEpic(artifacts, notifyChange);
            notifyChange.mockClear();

            const ts = createTestStrategy(artifacts, notifyChange, epic.id);

            expect(notifyChange).toHaveBeenCalledOnce();
            expect(ts.epicId).toBe(epic.id);
        });

        it('does NOT call notifyChange when testStrategy already exists on that epic', () => {
            const artifacts = fakeArtifacts();
            const notifyChange = vi.fn();
            const epic = createEpic(artifacts, notifyChange);
            notifyChange.mockClear();

            const first = createTestStrategy(artifacts, notifyChange, epic.id);
            notifyChange.mockClear();

            const second = createTestStrategy(artifacts, notifyChange, epic.id);

            expect(notifyChange).not.toHaveBeenCalled();
            expect(second).toBe(first);
        });
    });

    // ── fallback: unknown epicId → project-level ──
    it('falls back to project-level singleton when epicId does not match', () => {
        const artifacts = fakeArtifacts();
        const notifyChange = vi.fn();

        const ts = createTestStrategy(artifacts, notifyChange, 'EPIC-NONEXISTENT');

        expect(notifyChange).toHaveBeenCalledOnce();
        expect(ts.id).toBe('TS-1');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// addEpic / addStory — low-level helpers (no notifyChange param)
// ─────────────────────────────────────────────────────────────────────────────

describe('addEpic (low-level, no notifyChange)', () => {
    it('adds an epic to the map without calling notifyChange (no param)', () => {
        const artifacts = fakeArtifacts();

        addEpic(artifacts, {
            id: 'EPIC-1',
            title: 'Test',
            goal: '',
            functionalRequirements: [],
            status: 'draft',
            stories: [],
        });

        const epics = artifacts.get('epics') as Epic[];
        expect(epics).toHaveLength(1);
        expect(epics[0].id).toBe('EPIC-1');
    });
});

describe('addStory (low-level, no notifyChange)', () => {
    it('adds a story to a target epic without calling notifyChange (no param)', () => {
        const artifacts = fakeArtifacts();
        addEpic(artifacts, {
            id: 'EPIC-1',
            title: 'Test',
            goal: '',
            functionalRequirements: [],
            status: 'draft',
            stories: [],
        });

        addStory(artifacts, 'EPIC-1', {
            id: 'STORY-1-1',
            title: 'Test',
            userStory: { asA: '', iWant: '', soThat: '' },
            acceptanceCriteria: [],
            status: 'draft',
        });

        const epics = artifacts.get('epics') as Epic[];
        expect(epics[0].stories).toHaveLength(1);
        expect(epics[0].stories[0].id).toBe('STORY-1-1');
    });
});
