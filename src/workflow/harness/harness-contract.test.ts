// Cross-shell contract test: every harness adapter, launched through a REAL
// shell (PowerShell / pwsh / cmd on Windows, bash / sh elsewhere), must
// deliver the staged prompt to the CLI intact and let it write the verdict.
//
// Each adapter binary is replaced by a shim on PATH that runs fake-agent.js.
// The fake agent recovers the prompt the way the real CLI would (stdin,
// --message-file, or the pointer argument), checks it byte-for-byte via a
// digest embedded in the prompt, and writes the verdict file.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HARNESS_ADAPTERS, buildHarnessLaunch } from './harness-adapters';
import { buildCommandLine, type ShellKind } from './shell-command';
import { stagePromptFile } from './prompt-staging';

const FAKE_AGENT = `
const fs = require('fs');
const args = process.argv.slice(2);
function fromStdin() { try { return fs.readFileSync(0, 'utf-8'); } catch { return ''; } }
let prompt;
const mf = args.indexOf('--message-file');
if (mf >= 0) prompt = fs.readFileSync(args[mf + 1], 'utf-8');
if (prompt === undefined) {
  const pointer = args.find(a => a.startsWith('Read the file '));
  if (pointer) prompt = fs.readFileSync(pointer.match(/^Read the file (.+?) and carry out/)[1], 'utf-8');
}
if (prompt === undefined) prompt = fromStdin();
const m = prompt.match(/RESULT_PATH=(.+)\\n/);
const d = prompt.match(/DIGEST=([0-9a-f]+)\\n/);
const body = prompt.slice(prompt.indexOf('BODY<') + 5, prompt.lastIndexOf('>BODY'));
const ok = d && require('crypto').createHash('sha256').update(body, 'utf8').digest('hex') === d[1];
fs.writeFileSync(m[1], JSON.stringify({ verdict: ok ? 'COMPLETED' : 'BLOCKED', argv: args }));
`;

interface ShellUnderTest { kind: ShellKind; exe: string; argv: (line: string) => string[]; verbatim?: boolean }

function which(cmd: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return cp.spawnSync(probe, [cmd], { windowsHide: true }).status === 0;
}

function shellsForPlatform(): ShellUnderTest[] {
  if (process.platform === 'win32') {
    const list: ShellUnderTest[] = [
      { kind: 'powershell', exe: 'powershell.exe', argv: (l) => ['-NoProfile', '-NonInteractive', '-Command', l] },
      { kind: 'cmd', exe: 'cmd.exe', argv: (l) => ['/d', '/s', '/c', `"${l}"`], verbatim: true },
    ];
    if (which('pwsh')) list.push({ kind: 'powershell', exe: 'pwsh', argv: (l) => ['-NoProfile', '-NonInteractive', '-Command', l] });
    return list;
  }
  return [
    { kind: 'posix', exe: 'bash', argv: (l) => ['-c', l] },
    { kind: 'posix', exe: 'sh', argv: (l) => ['-c', l] },
  ];
}

// Shell-hostile prompt body: quotes, $vars, backticks, %VARS%, globbing,
// redirection, unicode, CRLF and a very long tail.
const HOSTILE = `He said "it's \`fine\`" & | ; > < $HOME $(whoami) %PATH% !x! * ? [a] {b} #c ~ ^ — ✓ 漢字 🚀\r\n` +
  'line2\n' + 'x'.repeat(20_000);

let root: string;
let binDir: string;
const fakeAgentPath = () => path.join(root, 'fake-agent.js');

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aac contract '));  // space in path on purpose
  binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir);
  fs.writeFileSync(fakeAgentPath(), FAKE_AGENT);
  const names = new Set(HARNESS_ADAPTERS.flatMap((a) => a.binaries));
  for (const name of names) {
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(binDir, `${name}.cmd`), `@"${process.execPath}" "${fakeAgentPath()}" %*\r\n`);
    } else {
      const shim = path.join(binDir, name);
      fs.writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${fakeAgentPath()}" "$@"\n`);
      fs.chmodSync(shim, 0o755);
    }
  }
});

afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe.each(shellsForPlatform())('harness contract via $exe', (shell) => {
  it.each(HARNESS_ADAPTERS.flatMap((a) => (['sandboxed', 'full'] as const).map((p) => [a.id, p] as const)))(
    '%s (%s) receives the prompt intact and writes its verdict',
    (id, posture) => {
      const adapter = HARNESS_ADAPTERS.find((a) => a.id === id)!;
      const outDir = path.join(root, 'out', `${shell.exe}-${id}-${posture}`);
      fs.mkdirSync(outDir, { recursive: true });
      const resultPath = path.join(outDir, 'result.json');
      const digest = crypto.createHash('sha256').update(HOSTILE, 'utf8').digest('hex');
      const prompt = `RESULT_PATH=${resultPath}\nDIGEST=${digest}\nBODY<${HOSTILE}>BODY`;
      const promptFile = stagePromptFile(outDir, id, posture, prompt);

      const spec = buildHarnessLaunch(adapter, { binary: adapter.binaries[0], promptFile, resultPath, posture });
      const line = buildCommandLine(spec, shell.kind);
      expect(line.length).toBeLessThan(600);       // prompt never inlined
      expect(line).not.toContain('漢字');

      const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` };
      const res = cp.spawnSync(shell.exe, shell.argv(line), {
        env, cwd: root, encoding: 'utf-8', windowsHide: true, timeout: 60_000,
        windowsVerbatimArguments: shell.verbatim,
      });
      expect(res.error, String(res.error)).toBeUndefined();
      expect(fs.existsSync(resultPath), `no verdict written.\n$ ${line}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(true);
      const verdict = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
      expect(verdict.verdict, `prompt corrupted in transit.\n$ ${line}\nstderr: ${res.stderr}`).toBe('COMPLETED');
      expect(verdict.argv).toEqual(spec.args.slice(1));
    },
    60_000,
  );
});
