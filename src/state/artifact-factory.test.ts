import { describe, it, expect, vi } from 'vitest';
import { createEpic, createStory } from './artifact-factory';

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
});
