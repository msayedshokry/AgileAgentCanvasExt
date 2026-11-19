import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RunJournal, type RunRecord } from './run-journal';
import { recoverRuns, type RecoveryDeps } from './run-recovery';

let dir: string;
let journal: RunJournal;

const record = (artifactId: string, over: Partial<RunRecord> = {}): RunRecord => ({
  runId: `run-${artifactId}`, artifactId, artifactType: 'story', workflowId: 'dev', harness: 'claude',
  terminalName: `AAC: dev ${artifactId}`, resultPath: `/r/${artifactId}.json`, startedAt: 1, revertTo: 'ready-for-dev',
  ...over,
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-runs-'));
  journal = RunJournal.inFolder(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function deps(over: Partial<RecoveryDeps> = {}): RecoveryDeps & { statuses: Map<string, string> } {
  const statuses = new Map<string, string>([['S-1', 'in-progress'], ['S-2', 'review'], ['S-3', 'in-progress']]);
  return {
    statuses,
    journal,
    readVerdict: () => undefined,
    isTerminalAlive: () => false,
    acquireLock: () => true,
    releaseLock: vi.fn(),
    getStatus: (r) => statuses.get(r.artifactId),
    setStatus: async (r, s) => { statuses.set(r.artifactId, s); },
    watch: vi.fn(),
    report: vi.fn(),
    ...over,
  };
}

describe('RunJournal', () => {
  it('persists records across instances, one per artifact, and ignores malformed entries', () => {
    journal.add(record('S-1'));
    journal.add(record('S-1', { runId: 'run-S-1-b' }));
    fs.writeFileSync(path.join(dir, 'agent-runs.json'),
      JSON.stringify([...JSON.parse(fs.readFileSync(path.join(dir, 'agent-runs.json'), 'utf-8')), { junk: true }]));
    const again = RunJournal.inFolder(dir).list();
    expect(again.map((r) => r.runId)).toEqual(['run-S-1-b']);
  });

  it('a corrupt file reads as empty and reports the error', () => {
    fs.writeFileSync(path.join(dir, 'agent-runs.json'), '{not json');
    const errors: unknown[] = [];
    expect(journal.list((e) => errors.push(e))).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});

describe('recoverRuns', () => {
  it('lost agent: releases the lock, returns the card to its pre-run column, clears the record', async () => {
    journal.add(record('S-1'));
    const d = deps();
    const [outcome] = await recoverRuns(d);
    expect(outcome).toMatchObject({ kind: 'interrupted', reverted: true });
    expect(d.statuses.get('S-1')).toBe('ready-for-dev');
    expect(d.releaseLock).toHaveBeenCalledWith('S-1');
    expect(journal.list()).toEqual([]);
  });

  it('verdict already written: finished, lock released, card untouched', async () => {
    journal.add(record('S-2'));
    const d = deps({ readVerdict: () => ({ verdict: 'APPROVED' }) });
    const [outcome] = await recoverRuns(d);
    expect(outcome.kind).toBe('finished');
    expect(d.statuses.get('S-2')).toBe('review');
    expect(journal.list()).toEqual([]);
  });

  it('agent terminal survived: re-adopts it, keeps the lock until the watcher reports', async () => {
    journal.add(record('S-3'));
    let finish!: (v: { verdict: 'COMPLETED' } | undefined) => void;
    const d = deps({ isTerminalAlive: () => true, watch: (_r, done) => { finish = done; } });
    const [outcome] = await recoverRuns(d);
    expect(outcome.kind).toBe('re-adopted');
    expect(d.releaseLock).not.toHaveBeenCalled();
    expect(journal.list()).toHaveLength(1);

    finish({ verdict: 'COMPLETED' });
    expect(d.releaseLock).toHaveBeenCalledWith('S-3');
    expect(journal.list()).toEqual([]);
    expect(d.report).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'finished' }));
  });

  it('does not move a card the user already moved elsewhere', async () => {
    journal.add(record('S-1'));
    const d = deps();
    d.statuses.set('S-1', 'done');
    const [outcome] = await recoverRuns(d);
    expect(outcome).toMatchObject({ kind: 'interrupted', reverted: false });
    expect(d.statuses.get('S-1')).toBe('done');
  });
});
