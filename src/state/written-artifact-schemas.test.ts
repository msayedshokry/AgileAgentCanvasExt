// Files the extension writes itself must pass its own schemas, or every load
// raises a "file(s) have schema issues" warning and board moves get blocked.
import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { schemaValidator } from './schema-validator';

const RESOURCES = path.resolve(__dirname, '..', '..', 'resources');
const TIMESTAMPS = { created: '2026-11-27T00:00:00.000Z', lastModified: '2026-11-27T00:00:00.000Z' };
const meta = (artifactType: string): Record<string, unknown> => ({ schemaVersion: '1.0.0', artifactType, timestamps: TIMESTAMPS });

beforeAll(() => {
  schemaValidator.init(path.join(RESOURCES, '_aac'));
});

describe('artifacts written by the extension', () => {
  it.each(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'])(
    'accepts a story in the %s board column',
    (status) => {
      const story = { metadata: meta('story'), content: { id: 'S-1.1', epicId: 'EPIC-1', title: 'A story', status } };
      expect(schemaValidator.validate('story', story).errors).toEqual([]);
    },
  );

  it('accepts epic-scoped use case ids like UC-1-1', () => {
    const file = { metadata: meta('use-cases'), content: { useCases: [{ id: 'UC-1-1', title: 'Use case', summary: '' }] } };
    expect(schemaValidator.validate('use-cases', file).errors).toEqual([]);
  });

  it.each(['1.1', 'S-1.1', 'STORY-1-1'])('accepts test cases for story id %s', (storyId) => {
    const file = {
      metadata: meta('test-cases'),
      content: { testCases: [{ id: `${storyId}-UNIT-001`, title: 'A test', type: 'unit', storyId }] },
    };
    expect(schemaValidator.validate('test-cases', file).errors).toEqual([]);
  });
});
