import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({ workspace: { getConfiguration: () => ({ get: () => undefined }) } }));

import { mapSchemaEpicToInternal, mapSchemaStoryToInternal } from './schema-mappers';

// What the board writes when an agent leaves a note (content.agentNotes on disk).
const NOTES = [{ author: 'Dev', text: 'npm test fails before assertions with Error: spawn EPERM.', at: '2026-11-27T05:00:00.000Z' }];

describe('agent notes survive a reload', () => {
  it('keeps a story\'s agent notes', () => {
    const story = mapSchemaStoryToInternal({ id: 'S-1.4', title: 'Slugify', status: 'in-progress', agentNotes: NOTES });
    expect(story?.agentNotes).toEqual(NOTES);
  });

  it('keeps an epic\'s agent notes', () => {
    const epic = mapSchemaEpicToInternal({ id: 'EPIC-3', title: 'Notifications', goal: 'Notify', agentNotes: NOTES });
    expect(epic?.agentNotes).toEqual(NOTES);
  });
});
