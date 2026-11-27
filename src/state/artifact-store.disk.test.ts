// ─── ArtifactStore against a real folder ─────────────────────────────────────
// Loads a copy of resources/sample-project from disk, changes one story, saves,
// and checks the store left everything else as the user wrote it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', async () => {
  const nodeFs = await import('fs/promises');
  const nodePath = await import('path');
  const makeUri = (p: string): any => {
    const fsPath = nodePath.resolve(p);
    const posix = fsPath.replace(/\\/g, '/');
    return {
      fsPath, scheme: 'file', path: posix.startsWith('/') ? posix : `/${posix}`,
      with: ({ path: next }: { path: string }) => makeUri(next.replace(/^\/([A-Za-z]:)/, '$1')),
      toString: () => `file://${posix}`,
    };
  };
  const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };
  const noop = { dispose: () => {} };
  const configuration = { get: (_k: string, d?: unknown) => d, update: async () => {}, has: () => false, inspect: () => undefined };
  return {
    FileType,
    Uri: {
      file: makeUri,
      joinPath: (base: any, ...parts: string[]) => makeUri(nodePath.join(base.fsPath, ...parts)),
    },
    workspace: {
      getConfiguration: () => configuration,
      workspaceFolders: undefined,
      onDidChangeConfiguration: () => noop,
      createFileSystemWatcher: () => ({ onDidCreate: () => noop, onDidChange: () => noop, onDidDelete: () => noop, dispose: () => {} }),
      fs: {
        readFile: async (u: any) => new Uint8Array(await nodeFs.readFile(u.fsPath)),
        writeFile: async (u: any, b: Uint8Array) => nodeFs.writeFile(u.fsPath, b),
        createDirectory: async (u: any) => { await nodeFs.mkdir(u.fsPath, { recursive: true }); },
        delete: async (u: any) => nodeFs.rm(u.fsPath, { recursive: true, force: true }),
        stat: async (u: any) => { const s = await nodeFs.stat(u.fsPath); return { type: s.isDirectory() ? 2 : 1, size: s.size, mtime: s.mtimeMs, ctime: s.ctimeMs }; },
        readDirectory: async (u: any) => (await nodeFs.readdir(u.fsPath, { withFileTypes: true }))
          .map((d) => [d.name, d.isDirectory() ? FileType.Directory : FileType.File]),
      },
    },
    window: {
      showInformationMessage: async () => undefined, showWarningMessage: async () => undefined, showErrorMessage: async () => undefined,
      createOutputChannel: () => ({ appendLine: () => {}, append: () => {}, clear: () => {}, show: () => {}, dispose: () => {} }),
    },
    commands: { registerCommand: () => noop, executeCommand: async () => undefined },
    EventEmitter: class { private l: Array<(e: unknown) => void> = []; event = (f: (e: unknown) => void) => { this.l.push(f); return noop; }; fire = (e: unknown) => this.l.forEach((f) => f(e)); dispose = () => { this.l = []; }; },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  };
});

import * as vscode from 'vscode';
import { ArtifactStore } from './artifact-store';
import { schemaValidator } from './schema-validator';

const SAMPLE = path.resolve(__dirname, '../../resources/sample-project');

function fakeContext(): any {
  return { subscriptions: [], globalState: { get: () => undefined, update: async () => {} }, workspaceState: { get: () => undefined, update: async () => {} }, secrets: {} };
}

/** Every file under `dir`, relative, with its text. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.set(path.relative(dir, full).replace(/\\/g, '/'), fs.readFileSync(full, 'utf-8'));
    }
  };
  walk(dir);
  return out;
}

const json = (dir: string, rel: string) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf-8'));

describe('ArtifactStore saving a loaded project', () => {
  let dir: string;
  let store: ArtifactStore;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-store-'));
    fs.cpSync(SAMPLE, dir, { recursive: true });
    store = new ArtifactStore(fakeContext());
    await store.loadFromFolder(vscode.Uri.file(dir));
    // Loading may migrate the layout once; what matters is what later saves do.
    store.markDirty();
    await store.syncToFiles();
  });

  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('keeps each file where the user put it and its metadata as written', () => {
    const files = snapshot(dir);
    expect(files.has('bmm/research.json')).toBe(true);
    expect([...files.keys()].filter((f) => f.endsWith('-default.json'))).toEqual([]);
    const research = json(dir, 'bmm/research.json').metadata;
    const original = json(SAMPLE, 'bmm/research.json').metadata;
    expect(research).toMatchObject({ artifactType: original.artifactType, status: original.status, tags: original.tags, author: original.author });
    expect(research.timestamps.created).toBe(original.timestamps.created);

    const vision = json(dir, 'vision.json').metadata;
    const visionBefore = json(SAMPLE, 'vision.json').metadata;
    expect(vision).toMatchObject({ workflowName: visionBefore.workflowName, tags: visionBefore.tags, author: visionBefore.author, stepsCompleted: visionBefore.stepsCompleted });
    expect(vision.timestamps.created).toBe(visionBefore.timestamps.created);
  });

  it('does not delete the test design', () => {
    expect(fs.existsSync(path.join(dir, 'testing/test-design.json'))).toBe(true);
    expect(json(dir, 'testing/test-design.json').content.summary).toEqual(json(SAMPLE, 'testing/test-design.json').content.summary);
  });

  it('rewrites only the file that changed', async () => {
    const before = snapshot(dir);
    const storyId = store.getEpics()[0].stories[0].id;
    await store.updateArtifact('story', storyId, { status: 'in-progress' });
    await store.syncToFiles();
    const after = snapshot(dir);
    const changed = [...after.keys()].filter((f) => before.get(f) !== after.get(f));
    expect([...after.keys()].filter((f) => !before.has(f))).toEqual([]);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.filter((f) => !/epics?(\.json|\.md|\/)/.test(f))).toEqual([]);
  });

  it('leaves a file alone when only its key order differs', async () => {
    const file = path.join(dir, 'bmm/research.json');
    const doc = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const { status, ...rest } = doc.metadata;
    const reordered = JSON.stringify({ ...doc, metadata: { status, ...rest } }, null, 2);
    fs.writeFileSync(file, reordered);
    const again = new ArtifactStore(fakeContext());
    await again.loadFromFolder(vscode.Uri.file(dir));
    again.markDirty();
    await again.syncToFiles();
    expect(fs.readFileSync(file, 'utf-8')).toBe(reordered);
  });

  it('gives every saved file a creation time', () => {
    const missing = [...snapshot(dir).entries()]
      .filter(([f]) => f.endsWith('.json'))
      .filter(([, text]) => { const m = JSON.parse(text).metadata; return m?.timestamps && !m.timestamps.created; })
      .map(([f]) => f);
    expect(missing).toEqual([]);
  });

  it("keeps a story's status and agent notes through save and reload", async () => {
    const storyId = store.getEpics()[0].stories[0].id;
    const note = { author: 'Dev', text: 'Used rules.ts', at: '2026-11-27 07:00' };
    await store.updateArtifact('story', storyId, { status: 'review', metadata: { agentNotes: [note] } });
    await store.syncToFiles();
    const again = new ArtifactStore(fakeContext());
    await again.loadFromFolder(vscode.Uri.file(dir));
    const story = again.findArtifactById(storyId)?.artifact as Record<string, unknown>;
    expect(story.status).toBe('review');
    expect(story.agentNotes).toEqual([note]);
  });

  it('leaves loaded stories valid against the story schema, notes and all', async () => {
    schemaValidator.init(path.resolve(__dirname, '../../resources/_aac'));
    expect(schemaValidator.isInitialized()).toBe(true);
    const storyId = store.getEpics()[0].stories[0].id;
    await store.updateArtifact('story', storyId, { metadata: { agentNotes: [{ author: 'Dev', text: 'x', at: 't' }] } });
    const invalid = store.getEpics().flatMap((e) => e.stories)
      .map((s) => ({ id: s.id, errors: schemaValidator.validateChanges('story', s as never).errors }))
      .filter((r) => r.errors.length > 0);
    expect(invalid).toEqual([]);
  });

  it('does not let a policy check rewrite a story behind the change', async () => {
    schemaValidator.init(path.resolve(__dirname, '../../resources/_aac'));
    const story = store.getEpics()[0].stories[0] as unknown as Record<string, unknown>;
    story.uxReferences = ['board.fig'];            // shape an older file had
    await store.updateArtifact('story', story.id as string, { title: 'Renamed' });
    expect(story.uxReferences).toEqual(['board.fig']);
    expect(story.content).toBeUndefined();
    expect(store.findArtifactById(story.id as string)?.artifact).toMatchObject({ title: 'Renamed', uxReferences: ['board.fig'] });
  });

  it('still blocks a change that breaks the schema itself', async () => {
    schemaValidator.init(path.resolve(__dirname, '../../resources/_aac'));
    const storyId = store.getEpics()[0].stories[0].id;
    await expect(store.updateArtifact('story', storyId, { storyPoints: 'lots' } as never)).rejects.toThrow(/schema-conformance/);
  });

  it("does not read the board's own files as artifacts", async () => {
    const verdict = { verdict: 'COMPLETED', summary: 'Planned EPIC-1', lead: { assignments: [] }, run_id: 'r1' };
    fs.mkdirSync(path.join(dir, '_terminal-output'), { recursive: true });
    fs.writeFileSync(path.join(dir, '_terminal-output/EPIC-1-aac-lead-dispatch-result.json'), JSON.stringify(verdict));
    fs.writeFileSync(path.join(dir, 'agent-team.json'), JSON.stringify({ agents: [], assignments: { 'EPIC-1': 'lead' } }));
    const epicCount = store.getEpics().length;
    const again = new ArtifactStore(fakeContext());
    await again.loadFromFolder(vscode.Uri.file(dir));
    expect(again.getEpics().map((e) => e.title)).not.toContain('Untitled Epic');
    expect(again.getEpics()).toHaveLength(epicCount);
  });

  it('ignores empty "Untitled Epic" leftovers an older version saved', async () => {
    const id = 'EPIC-1795736095173';
    const leftover = { metadata: { artifactType: 'epic', timestamps: { created: 'x' } }, content: { id, title: 'Untitled Epic', goal: '', status: 'draft', storyRefs: [] } };
    fs.mkdirSync(path.join(dir, 'epics/epic-1795736095173'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'epics/epic-1795736095173/epic.json'), JSON.stringify(leftover));
    const again = new ArtifactStore(fakeContext());
    await again.loadFromFolder(vscode.Uri.file(dir));
    expect(again.getEpics().map((e) => e.id)).not.toContain(id);
  });

  it('points the epics manifest at files that exist', () => {
    const refs = json(dir, 'epics.json').content.epics as Array<{ file: string }>;
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((r) => !fs.existsSync(path.join(dir, r.file))).map((r) => r.file)).toEqual([]);
  });

  it('does not add epics on reload', async () => {
    const ids = store.getEpics().map((e) => e.id).sort();
    const again = new ArtifactStore(fakeContext());
    await again.loadFromFolder(vscode.Uri.file(dir));
    again.markDirty();
    await again.syncToFiles();
    expect(again.getEpics().map((e) => e.id).sort()).toEqual(ids);
    expect(ids.every((id) => !/^EPIC-\d{10,}$/.test(id))).toBe(true);
  });
});
