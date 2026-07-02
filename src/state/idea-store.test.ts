import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IdeaStore } from './idea-store';

/** Build a temp folder and return a vscode.Uri-like object accepted by IdeaStore. */
function tmpFolder(): { uri: { fsPath: string; path: string; scheme: string }; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idea-store-'));
  return {
    uri: { fsPath: dir, path: dir, scheme: 'file' },
    dir,
  };
}

describe('IdeaStore', () => {
  let store: IdeaStore;
  let folder: ReturnType<typeof tmpFolder>;

  beforeEach(async () => {
    folder = tmpFolder();
    store = new IdeaStore();
    await store.setFolder(folder.uri as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it('round-trips create → reload from disk', async () => {
    const created = await store.create({ title: 'Cache auth headers', body: 'Stash ETag + Last-Modified per request.', color: 'yellow' });
    expect(created.id).toMatch(/^idea-/);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].title).toBe('Cache auth headers');

    // Simulate restart: new store, same folder.
    const store2 = new IdeaStore();
    await store2.setFolder(folder.uri as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const reloaded = store2.list();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].title).toBe('Cache auth headers');
    expect(reloaded[0].body).toContain('ETag');
    expect(reloaded[0].color).toBe('yellow');
  });

  it('archives then hides from active list, restores then surfaces again', async () => {
    const created = await store.create({ title: 'todo', body: '', color: 'gray' });
    await store.archive(created.id);
    expect(store.list()).toHaveLength(0);
    expect(store.listArchived()).toHaveLength(1);
    await store.restore(created.id);
    expect(store.list()).toHaveLength(1);
    expect(store.listArchived()).toHaveLength(0);
  });

  it('updates body/title and bumps updatedAt', async () => {
    const created = await store.create({ title: 'old', body: 'old body', color: 'blue' });
    const before = created.updatedAt;
    // Force a measurable tick.
    await new Promise(r => setTimeout(r, 5));
    const updated = await store.update(created.id, { body: 'new body', title: 'new' });
    expect(updated?.body).toBe('new body');
    expect(updated?.title).toBe('new');
    expect(updated?.updatedAt).not.toBe(before);
  });

  it('deletes and removes file from disk', async () => {
    const created = await store.create({ title: 'x', body: '', color: 'pink' });
    const file = path.join(folder.dir, 'ideas', `${created.id}.md`);
    expect(fs.existsSync(file)).toBe(true);
    await store.delete(created.id);
    expect(fs.existsSync(file)).toBe(false);
    expect(store.list()).toHaveLength(0);
  });
});
