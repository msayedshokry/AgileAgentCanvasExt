import { describe, it, expect } from 'vitest';
import { ArtifactStore } from './artifact-store';

/** Minimal fake ExtensionContext for ArtifactStore construction. */
function fakeContext(): any {
  return {
    subscriptions: [],
    globalState: { get: () => undefined, update: async () => {} },
    workspaceState: { get: () => undefined, update: async () => {} },
    secrets: {},
  };
}

describe('ArtifactStore characterization (pre-extraction baseline)', () => {
  it('constructs and exposes a stable public surface', () => {
    const store = new ArtifactStore(fakeContext());
    // Pin the public methods callers depend on so extraction can't change them.
    expect(typeof store.loadFromFolder).toBe('function');
    expect(typeof store.syncToFiles).toBe('function');
    expect(typeof store.updateArtifact).toBe('function');
    expect(typeof store.deleteArtifact).toBe('function');
    expect(typeof store.getState).toBe('function');
    expect(typeof store.getEpics).toBe('function');
    expect(typeof store.getRequirements).toBe('function');
    expect(typeof store.initializeProject).toBe('function');
  });

  it('initializeProject creates a default vision with typed empty arrays', () => {
    const store = new ArtifactStore(fakeContext());
    store.initializeProject('Test Project');
    const state = store.getState();
    expect(state.projectName).toBe('Test Project');
    expect(state.vision).toBeDefined();
    expect(state.vision!.status).toBe('draft');
    expect(Array.isArray(state.vision!.targetUsers)).toBe(true);
    expect(Array.isArray(state.vision!.successCriteria)).toBe(true);
  });

  it('reports syncing state correctly', () => {
    const store = new ArtifactStore(fakeContext());
    expect(store.isSyncing()).toBe(false);
    expect(store.isFixInProgress()).toBe(false);
  });

  it('clearProject resets state', () => {
    const store = new ArtifactStore(fakeContext());
    store.initializeProject('Temp');
    expect(store.getState().projectName).toBe('Temp');
    store.clearProject();
    expect(store.getState().projectName).toBe('');
  });
});
