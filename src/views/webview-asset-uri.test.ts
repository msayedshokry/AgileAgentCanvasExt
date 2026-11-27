import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', () => ({}));
import { webviewAssetUri } from './webview-asset-uri';

type FakeUri = { fsPath: string; query?: string; with: (c: { query: string }) => FakeUri };
const fakeUri = (fsPath: string, query = ''): FakeUri => ({ fsPath, query, with: (c) => fakeUri(fsPath, c.query) });
const webview = { asWebviewUri: (u: FakeUri) => fakeUri(u.fsPath) } as never;

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('webviewAssetUri', () => {
  it('changes when the file is rebuilt, so the webview cannot reuse a stale copy', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-')); dirs.push(dir);
    const file = path.join(dir, 'index.js');
    fs.writeFileSync(file, 'old');
    fs.utimesSync(file, new Date('2026-11-27T10:00:00Z'), new Date('2026-11-27T10:00:00Z'));
    const before = (webviewAssetUri(webview, fakeUri(file) as never) as unknown as FakeUri).query;
    fs.utimesSync(file, new Date('2026-11-27T11:00:00Z'), new Date('2026-11-27T11:00:00Z'));
    const after = (webviewAssetUri(webview, fakeUri(file) as never) as unknown as FakeUri).query;
    expect(before).toMatch(/^v=\d+$/);
    expect(after).not.toBe(before);
  });

  it('leaves the URL alone when the file is missing', () => {
    expect((webviewAssetUri(webview, fakeUri('/nope/index.js') as never) as unknown as FakeUri).query).toBe('');
  });
});
