import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { claimScheduledRun, pruneClaims, CLAIMS_DIR } from './autopilot-claim';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-claim-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('claimScheduledRun', () => {
  it('lets exactly one window claim a scheduled minute', () => {
    expect(claimScheduledRun(dir, 'daily', '2026-11-25T09:00')).toBe(true);
    expect(claimScheduledRun(dir, 'daily', '2026-11-25T09:00')).toBe(false);
  });

  it('treats other minutes and other autopilots as separate claims', () => {
    expect(claimScheduledRun(dir, 'daily', '2026-11-25T09:00')).toBe(true);
    expect(claimScheduledRun(dir, 'daily', '2026-11-26T09:00')).toBe(true);
    expect(claimScheduledRun(dir, 'weekly', '2026-11-25T09:00')).toBe(true);
  });
});

describe('pruneClaims', () => {
  it('removes claims older than a day and keeps recent ones', () => {
    claimScheduledRun(dir, 'old', '2026-11-20T09:00');
    claimScheduledRun(dir, 'new', '2026-11-25T09:00');
    const oldFile = path.join(dir, CLAIMS_DIR, 'old@2026-11-20T09-00');
    const twoDaysAgo = (Date.now() - 2 * 24 * 3600 * 1000) / 1000;
    fs.utimesSync(oldFile, twoDaysAgo, twoDaysAgo);
    pruneClaims(dir, Date.now());
    expect(fs.readdirSync(path.join(dir, CLAIMS_DIR))).toEqual(['new@2026-11-25T09-00']);
  });

  it('does nothing when no claim was ever made', () => {
    expect(() => pruneClaims(dir, Date.now())).not.toThrow();
  });
});
