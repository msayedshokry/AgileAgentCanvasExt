import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkWritablePath } from './write-guard';

let ws: string;
let outside: string;

beforeAll(() => {
  ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aac-guard-ws-')));
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aac-guard-out-')));
  fs.mkdirSync(path.join(ws, '.agileagentcanvas-context'));
});
afterAll(() => {
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe('checkWritablePath', () => {
  it('allows artifact and source files inside the workspace, including new folders', () => {
    expect(checkWritablePath(path.join(ws, '.agileagentcanvas-context', 'epics', 'E-1.json'), [ws]).ok).toBe(true);
    expect(checkWritablePath(path.join(ws, 'src', 'feature.ts'), [ws]).ok).toBe(true);
  });

  it('rejects relative paths and paths outside the roots', () => {
    expect(checkWritablePath('src/x.ts', [ws]).ok).toBe(false);
    expect(checkWritablePath(path.join(outside, 'x.ts'), [ws]).ok).toBe(false);
    expect(checkWritablePath(path.join(ws, '..', path.basename(outside), 'x.ts'), [ws]).ok).toBe(false);
  });

  it.each([
    ['.git/hooks/pre-commit'],
    ['.vscode/tasks.json'],
    ['.husky/pre-push'],
    ['package.json'],
    ['packages/app/package.json'],
    ['.env.local'],
    ['.github/workflows/ci.yml'],
    ['node_modules/x/index.js'],
  ])('refuses auto-executed or secret-bearing target %s', (rel) => {
    const res = checkWritablePath(path.join(ws, ...rel.split('/')), [ws]);
    expect(res.ok).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('refuses to follow a symlink out of the workspace', () => {
    fs.symlinkSync(outside, path.join(ws, 'escape'));
    const res = checkWritablePath(path.join(ws, 'escape', 'pwned.sh'), [ws]);
    expect(res.ok).toBe(false);
  });
});
