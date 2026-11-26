import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({ workspace: { fs: {} } }));

import { withCreatedTimestamp } from './artifact-file-io';

describe('withCreatedTimestamp', () => {
  it('adds created from lastModified when a new file has no created timestamp', () => {
    const out = withCreatedTimestamp({
      metadata: { artifactType: 'story', timestamps: { lastModified: '2026-11-27T00:00:00.000Z' } },
      content: {},
    });
    expect((out.metadata as any).timestamps).toEqual({
      lastModified: '2026-11-27T00:00:00.000Z',
      created: '2026-11-27T00:00:00.000Z',
    });
  });

  it('keeps an existing created timestamp', () => {
    const payload = { metadata: { timestamps: { created: '2020-01-01T00:00:00.000Z', lastModified: 'x' } } };
    expect(withCreatedTimestamp(payload)).toBe(payload);
  });

  it('creates the timestamps object when metadata has none', () => {
    const out = withCreatedTimestamp({ metadata: { artifactType: 'use-cases' } });
    expect(typeof (out.metadata as any).timestamps.created).toBe('string');
  });

  it('leaves payloads without metadata untouched', () => {
    const payload = { content: { a: 1 } };
    expect(withCreatedTimestamp(payload)).toBe(payload);
  });
});
