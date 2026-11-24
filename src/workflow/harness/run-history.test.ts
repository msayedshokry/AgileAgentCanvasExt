import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { appendRunHistory, historyPath, readRunHistory } from './run-history';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-hist-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const entry = (n: number) => ({
  runId: `r${n}`, artifactId: 'S-1', workflowId: 'dev', harness: 'claude', verdict: 'COMPLETED',
  summary: 's', startedAt: n, finishedAt: n + 1,
});

describe('run history', () => {
  it('returns newest first and skips malformed lines', () => {
    appendRunHistory(dir, entry(1));
    fs.appendFileSync(historyPath(dir), 'garbage\n');
    appendRunHistory(dir, entry(2));
    expect(readRunHistory(dir).map((e) => e.runId)).toEqual(['r2', 'r1']);
  });

  it('stays bounded', () => {
    for (let i = 0; i < 700; i++) appendRunHistory(dir, entry(i));
    const lines = fs.readFileSync(historyPath(dir), 'utf-8').split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(600);
    expect(readRunHistory(dir, 1)[0].runId).toBe('r699');
  }, 30_000);  // 700 real file appends

  it('caps long summaries and reads an absent file as empty', () => {
    appendRunHistory(dir, { ...entry(1), summary: 'x'.repeat(5000) });
    expect(readRunHistory(dir)[0].summary!.length).toBeLessThanOrEqual(2001);
    expect(readRunHistory(path.join(dir, 'none'))).toEqual([]);
  });
});
