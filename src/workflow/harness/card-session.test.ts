import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CardSessionStore, cardSessionKey, planSession, recordAfterRun, type CardSessionRecord } from './card-session';

const KEY = cardSessionKey('S-1', 'dev-story', 'claude');
const CWD = path.resolve('/work/repo');
const newId = () => 'fresh-id';
const prev = (over: Partial<CardSessionRecord> = {}): CardSessionRecord => ({ sessionId: 'old-id', cwd: CWD, updatedAt: 1, ...over });

describe('planSession', () => {
  it('starts fresh when the card has no previous session', () => {
    expect(planSession(KEY, undefined, CWD, newId)).toEqual({ key: KEY, sessionId: 'fresh-id', resume: false, cwd: CWD });
  });

  it('resumes the previous session for rework in the same directory', () => {
    expect(planSession(KEY, prev(), CWD, newId)).toMatchObject({ sessionId: 'old-id', resume: true });
  });

  it('starts fresh when the previous session is poisoned', () => {
    expect(planSession(KEY, prev({ poisoned: 'stuck' }), CWD, newId)).toMatchObject({ sessionId: 'fresh-id', resume: false });
  });

  it('starts fresh when the working directory changed', () => {
    expect(planSession(KEY, prev(), path.resolve('/work/other'), newId).resume).toBe(false);
  });
});

describe('recordAfterRun', () => {
  const plan = { key: KEY, sessionId: 'id', resume: false, cwd: CWD };

  it('keeps a session that ended with a real verdict resumable', () => {
    expect(recordAfterRun(plan, 'CHANGES_REQUESTED', 'fix tests', 5)).toEqual({ sessionId: 'id', cwd: CWD, updatedAt: 5 });
  });

  it('poisons a session that ended without a verdict, with the first line of the reason', () => {
    const r = recordAfterRun(plan, 'UNKNOWN', 'prompt is too long\nmore', 5);
    expect(r.poisoned).toBe('run ended without a verdict: prompt is too long');
  });
});

describe('CardSessionStore', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-session-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('round-trips records and ignores a corrupt file', () => {
    const store = CardSessionStore.inFolder(dir);
    expect(store.get(KEY)).toBeUndefined();
    store.set(KEY, prev());
    expect(CardSessionStore.inFolder(dir).get(KEY)).toEqual(prev());
    fs.writeFileSync(path.join(dir, 'agent-card-sessions.json'), '{not json');
    expect(store.get(KEY)).toBeUndefined();
  });
});
