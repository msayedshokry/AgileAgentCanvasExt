import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveBundledSkillPath } from './skill-launch';

const EXT = path.resolve(__dirname, '..', '..');

describe('resolveBundledSkillPath', () => {
  it('resolves a bundled skill id to its SKILL.md', () => {
    expect(resolveBundledSkillPath(EXT, 'aac-dev-story')).toBe(
      path.join(EXT, 'resources', '_aac', 'skills', 'aac-dev-story', 'SKILL.md'),
    );
  });

  it('rejects ids that are not plain bundled skill names', () => {
    for (const id of ['../aac-dev-story', 'aac-dev-story/../../x', 'aac-dev-story\\x', 'dev-story', 'AAC-DEV', '', 42, null, undefined]) {
      expect(resolveBundledSkillPath(EXT, id)).toBeUndefined();
    }
  });

  it('returns undefined for a well-formed id with no skill behind it', () => {
    expect(resolveBundledSkillPath(EXT, 'aac-does-not-exist')).toBeUndefined();
  });
});
