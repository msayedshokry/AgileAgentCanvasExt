import { describe, it, expect } from 'vitest';
import * as os from 'os';
import { runVerifyCommand, verifyFixRequest } from './verify-gate';

const node = JSON.stringify(process.execPath);

describe('runVerifyCommand', () => {
  it('passes on exit 0 and keeps the output tail', async () => {
    const r = await runVerifyCommand(`${node} -e "console.log('all good')"`, os.tmpdir());
    expect(r).toMatchObject({ passed: true, exitCode: 0, timedOut: false });
    expect(r.tail).toContain('all good');
  });

  it('fails on a non-zero exit and turns it into a fix request', async () => {
    const r = await runVerifyCommand(`${node} -e "console.error('2 tests failed'); process.exit(3)"`, os.tmpdir());
    expect(r).toMatchObject({ passed: false, exitCode: 3 });
    const fix = verifyFixRequest(r);
    expect(fix.failing_criterion).toMatch(/exit 3/);
    expect(fix.reproduction).toContain('2 tests failed');
  });

  it('kills a command that runs past the timeout', async () => {
    const r = await runVerifyCommand(`${node} -e "setTimeout(() => {}, 60000)"`, os.tmpdir(), 800);
    expect(r.timedOut).toBe(true);
    expect(r.passed).toBe(false);
    expect(verifyFixRequest(r).failing_criterion).toMatch(/timed out/);
  }, 20_000);

  it('stops when aborted', async () => {
    const ac = new AbortController();
    const p = runVerifyCommand(`${node} -e "setTimeout(() => {}, 60000)"`, os.tmpdir(), 60_000, ac.signal);
    setTimeout(() => ac.abort(), 300);
    expect((await p).passed).toBe(false);
  }, 20_000);
});
