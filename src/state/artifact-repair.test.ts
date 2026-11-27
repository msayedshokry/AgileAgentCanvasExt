import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({ workspace: { fs: {} } }));

import { withStoryEpicId } from './artifact-repair';

const story = (epicId?: string) => ({ metadata: {}, content: { id: 'S-1.1', ...(epicId === undefined ? {} : { epicId }) } });

describe('withStoryEpicId', () => {
  it('fills a missing epicId from the parent epic file', () => {
    expect(withStoryEpicId(story(), { content: { id: 'EPIC-1' } }).content.epicId).toBe('EPIC-1');
  });

  it('replaces a blank epicId', () => {
    expect(withStoryEpicId(story('  '), { id: 'EPIC-2' }).content.epicId).toBe('EPIC-2');
  });

  it('keeps an epicId the story already has', () => {
    const input = story('EPIC-9');
    expect(withStoryEpicId(input, { content: { id: 'EPIC-1' } })).toBe(input);
  });

  it('leaves the story alone when the epic file has no id', () => {
    const input = story();
    expect(withStoryEpicId(input, undefined)).toBe(input);
    expect(withStoryEpicId(input, { content: {} })).toBe(input);
  });
});
