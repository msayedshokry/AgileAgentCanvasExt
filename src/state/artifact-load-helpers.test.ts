import { describe, it, expect, vi } from 'vitest';

// A small in-memory tree: folder paths map to their entries (1 = file, 2 = directory).
const TREE: Record<string, Array<[string, number]>> = {
  '/ctx': [['epics.json', 1], ['epics', 2], ['_terminal-output', 2], ['_repos', 2], ['.hidden', 2]],
  '/ctx/epics': [['epic-3', 2]],
  '/ctx/epics/epic-3': [['epic.json', 1]],
  '/ctx/_terminal-output': [['EPIC-3-aac-lead-dispatch-result.json', 1]],
  '/ctx/_repos': [['skills', 2]],
  '/ctx/_repos/skills': [['manifest.json', 1]],
  '/ctx/.hidden': [['x.json', 1]],
};

vi.mock('vscode', () => ({
  FileType: { File: 1, Directory: 2 },
  Uri: { joinPath: (base: { fsPath: string }, name: string) => ({ fsPath: `${base.fsPath}/${name}` }) },
  workspace: { fs: { readDirectory: async (uri: { fsPath: string }) => TREE[uri.fsPath] ?? [] } },
}));

import { findAllJsonFiles } from './artifact-load-helpers';

describe('findAllJsonFiles', () => {
  it('skips agent run output and cloned repos, which are not artifacts', async () => {
    // A verdict file named EPIC-3-…-result.json was loaded as the epics
    // manifest and then overwritten by Fix Schemas.
    const files = await findAllJsonFiles({ fsPath: '/ctx' } as never);
    expect(files.map((f) => f.fsPath)).toEqual(['/ctx/epics.json', '/ctx/epics/epic-3/epic.json']);
  });
});
