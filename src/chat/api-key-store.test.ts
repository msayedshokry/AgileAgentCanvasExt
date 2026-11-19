import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  setting: { global: '' as string | undefined, workspace: '' as string | undefined },
  updates: [] as Array<[string, unknown, number]>,
}));

vi.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: string) =>
        key === 'apiKey' ? state.setting.workspace || state.setting.global || fallback : fallback,
      inspect: () => ({ globalValue: state.setting.global, workspaceValue: state.setting.workspace }),
      update: async (key: string, value: unknown, target: number) => {
        state.updates.push([key, value, target]);
        if (target === 1) state.setting.global = value as string | undefined;
        if (target === 2) state.setting.workspace = value as string | undefined;
      },
    }),
  },
  commands: { registerCommand: () => ({ dispose: () => undefined }) },
  window: {},
}));

import { getApiKey, initApiKeyStore } from './api-key-store';

function context(stored?: string) {
  const map = new Map<string, string>(stored ? [['agileagentcanvas.apiKey', stored]] : []);
  return {
    subscriptions: [] as unknown[],
    secrets: {
      get: async (k: string) => map.get(k),
      store: async (k: string, v: string) => { map.set(k, v); },
      delete: async (k: string) => { map.delete(k); },
      onDidChange: () => ({ dispose: () => undefined }),
    },
    map,
  };
}

beforeEach(() => {
  state.setting = { global: '', workspace: '' };
  state.updates = [];
});

describe('api-key-store', () => {
  it('moves a key from settings into secure storage and clears every settings scope', async () => {
    state.setting = { global: 'sk-global', workspace: 'sk-workspace' };
    const ctx = context();
    await initApiKeyStore(ctx as never);
    expect(ctx.map.get('agileagentcanvas.apiKey')).toBe('sk-workspace');
    expect(state.setting).toEqual({ global: undefined, workspace: undefined });
    expect(getApiKey()).toBe('sk-workspace');
  });

  it('keeps an existing secure key when settings hold a different one, and still clears settings', async () => {
    state.setting = { global: 'sk-old', workspace: '' };
    const ctx = context('sk-secure');
    await initApiKeyStore(ctx as never);
    expect(ctx.map.get('agileagentcanvas.apiKey')).toBe('sk-secure');
    expect(state.setting.global).toBeUndefined();
    expect(getApiKey()).toBe('sk-secure');
  });
});
