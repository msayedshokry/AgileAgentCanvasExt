import { describe, it, expect, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import {
    PRODUCT_TOUR_SEEN_KEY,
    getProductTourSeenVersion,
    initProductTourState,
    markProductTourSeen,
    resetProductTourStateForTests,
} from './product-tour-state';

function fakeMemento(initial: Record<string, unknown> = {}): vscode.Memento & { data: Record<string, unknown> } {
    const data = { ...initial };
    return {
        data,
        keys: () => Object.keys(data),
        get: ((key: string, fallback?: unknown) => (key in data ? data[key] : fallback)) as vscode.Memento['get'],
        update: async (key: string, value: unknown) => { data[key] = value; },
    };
}

describe('product tour state', () => {
    beforeEach(() => resetProductTourStateForTests());

    it('reports 0 when nothing is stored or the store is not initialised', () => {
        expect(getProductTourSeenVersion()).toBe(0);
        initProductTourState(fakeMemento());
        expect(getProductTourSeenVersion()).toBe(0);
    });

    it('persists the seen version so a new session reads it back', async () => {
        const memento = fakeMemento();
        initProductTourState(memento);
        await markProductTourSeen(1);

        resetProductTourStateForTests();
        initProductTourState(memento);
        expect(getProductTourSeenVersion()).toBe(1);
    });

    it('never lowers a stored version', async () => {
        const memento = fakeMemento({ [PRODUCT_TOUR_SEEN_KEY]: 3 });
        initProductTourState(memento);
        await markProductTourSeen(2);
        expect(memento.data[PRODUCT_TOUR_SEEN_KEY]).toBe(3);
    });

    it('ignores invalid versions from the webview', async () => {
        const memento = fakeMemento();
        initProductTourState(memento);
        for (const bad of [0, -1, 1.5, 1e9, NaN, '1' as unknown as number]) {
            await markProductTourSeen(bad);
        }
        expect(memento.data).toEqual({});
    });

    it('treats a corrupted stored value as unseen', () => {
        initProductTourState(fakeMemento({ [PRODUCT_TOUR_SEEN_KEY]: 'yes' }));
        expect(getProductTourSeenVersion()).toBe(0);
    });
});
