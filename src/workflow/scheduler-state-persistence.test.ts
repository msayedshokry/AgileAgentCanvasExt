// ─── Unit tests: scheduler-state-persistence ────────────────────────────────────
// Covers: save writes a valid JSON file with current scheduler state (happy
// path) and restore returns {restored:false} when the file is missing
// (most common error path).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SchedulerStatePersistence } from './scheduler-state-persistence';
import { autoScheduler } from './auto-scheduler';

describe('SchedulerStatePersistence', () => {
  let tmpDir: string;
  let filePath: string;
  let p: SchedulerStatePersistence;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-ssp-'));
    filePath = path.join(tmpDir, 'scheduler-state.json');
    p = new SchedulerStatePersistence(filePath);
    autoScheduler.stop();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('happy: save writes a parseable JSON file with version + queue', () => {
    autoScheduler.setStories([{ id: 'S-1', status: 'ready-for-dev' }]);
    p.save();
    expect(fs.existsSync(filePath)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(onDisk.version).toBe(1);
    expect(onDisk.queue).toEqual(['S-1']);
    expect(typeof onDisk.savedAt).toBe('number');
  });

  it('error: restore returns {restored:false} when the file is missing', () => {
    const result = p.restore();
    expect(result.restored).toBe(false);
    expect(result.state).toBeUndefined();
  });
});
