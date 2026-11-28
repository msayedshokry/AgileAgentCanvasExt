// askCli with stand-in CLIs (small node scripts) through the real shell.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { askCli, askLaunch } from './cli-ask';
import type { HarnessAdapter } from './harness-adapters';

let scripts = '';
const script = (name: string, body: string) => {
  const file = path.join(scripts, name);
  fs.writeFileSync(file, body);
  return file;
};

const fake = (delivery: HarnessAdapter['delivery'], argv: (ctx: { resultPath: string; promptFile: string }) => string[]): HarnessAdapter => ({
  id: 'claude', label: 'Fake CLI', binaries: ['node'], delivery, installHint: '', postures: ['sandboxed', 'full'],
  postureNotes: { sandboxed: '', full: '' },
  buildLaunch: (ctx) => ({ args: [process.execPath, ...argv(ctx)] }),
});

beforeAll(() => { scripts = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-fake-cli-')); });
afterAll(() => fs.rmSync(scripts, { recursive: true, force: true }));

describe('asking an agent CLI one question', { timeout: 30_000 }, () => {
  it('reads the answer the CLI wrote to the answer file, and cleans up', async () => {
    const writer = script('writer.js', `require('fs').writeFileSync(process.argv[2], JSON.stringify({ name: 'Ada' })); console.log('done, lots of chatter');`);
    const result = await askCli({ adapter: fake('pointer', ({ resultPath }) => [writer, resultPath]), binary: 'node', prompt: 'Draft an agent' });
    expect(result).toEqual({ ok: true, text: '{"name":"Ada"}' });
  });

  it('feeds the prompt on stdin to stdin CLIs, and falls back to what they print', async () => {
    const echo = script('echo.js', `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify({ saw: s.includes('Draft an agent ünïcode') && s.includes('answer.json') })));`);
    const result = await askCli({ adapter: fake('stdin', () => [echo]), binary: 'node', prompt: 'Draft an agent ünïcode' });
    expect(result.ok && JSON.parse(result.text)).toEqual({ saw: true });
  });

  it('says what went wrong when the CLI fails', async () => {
    const fail = script('fail.js', `console.error('not signed in'); process.exit(2);`);
    const result = await askCli({ adapter: fake('pointer', () => [fail]), binary: 'node', prompt: 'x' });
    expect(result).toEqual({ ok: false, error: 'Fake CLI gave no answer: not signed in' });
  });

  it('gives up after the timeout', async () => {
    const pidFile = path.join(scripts, 'hang.pid');
    const hang = script('hang.js', `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 60_000);`);
    const result = await askCli({ adapter: fake('pointer', () => [hang]), binary: 'node', prompt: 'x', timeoutMs: 1500 });
    expect(result).toEqual({ ok: false, error: 'Fake CLI did not answer within 2 seconds.' });
    // The CLI itself is stopped, not only the shell that started it.
    const pid = Number(fs.readFileSync(pidFile, 'utf-8'));
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it('always uses the sandboxed posture in the temporary folder', () => {
    let seen: { posture?: string; workspaceDir?: string } = {};
    const spy: HarnessAdapter = { ...fake('stdin', () => []), buildLaunch: (ctx) => { seen = ctx; return { args: ['x'] }; } };
    expect(askLaunch(spy, 'x', '/tmp/q').stdinFile).toBe(path.join('/tmp/q', 'prompt.md'));
    expect(seen).toMatchObject({ posture: 'sandboxed', workspaceDir: '/tmp/q' });
  });
});
