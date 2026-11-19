// Standalone harness contract runner (no test framework), for shells where
// vitest's native deps aren't installed, e.g. WSL against a Windows checkout:
//
//   npx esbuild scripts/_demo/harness-contract-cli.ts --bundle --platform=node --outfile=<tmp>/contract.js
//   wsl -d Ubuntu -- node <tmp>/contract.js
//
// Launches every adapter × posture through each available shell of this OS
// with fake CLIs on PATH and a shell-hostile prompt; exit code = failures.
// Mirrors src/workflow/harness/harness-contract.test.ts.

import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HARNESS_ADAPTERS, buildHarnessLaunch } from '../../src/workflow/harness/harness-adapters';
import { buildCommandLine, type ShellKind } from '../../src/workflow/harness/shell-command';
import { stagePromptFile } from '../../src/workflow/harness/prompt-staging';

const FAKE_AGENT = `
const fs = require('fs');
const args = process.argv.slice(2);
let prompt;
const mf = args.indexOf('--message-file');
if (mf >= 0) prompt = fs.readFileSync(args[mf + 1], 'utf-8');
if (prompt === undefined) {
  const pointer = args.find(a => a.startsWith('Read the file '));
  if (pointer) prompt = fs.readFileSync(pointer.match(/^Read the file (.+?) and carry out/)[1], 'utf-8');
}
if (prompt === undefined) { try { prompt = fs.readFileSync(0, 'utf-8'); } catch { prompt = ''; } }
const m = prompt.match(/RESULT_PATH=(.+)\\n/);
const d = prompt.match(/DIGEST=([0-9a-f]+)\\n/);
const body = prompt.slice(prompt.indexOf('BODY<') + 5, prompt.lastIndexOf('>BODY'));
const ok = d && require('crypto').createHash('sha256').update(body, 'utf8').digest('hex') === d[1];
fs.writeFileSync(m[1], JSON.stringify({ verdict: ok ? 'COMPLETED' : 'BLOCKED', argv: args }));
`;

const HOSTILE = `He said "it's \`fine\`" & | ; > < $HOME $(whoami) %PATH% !x! * ? [a] {b} #c ~ ^ — ✓ 漢字 🚀\r\n` +
  'line2\n' + 'x'.repeat(20_000);

interface Shell { kind: ShellKind; exe: string; argv: (l: string) => string[]; verbatim?: boolean }

function shells(): Shell[] {
  if (process.platform === 'win32') {
    return [
      { kind: 'powershell', exe: 'powershell.exe', argv: (l) => ['-NoProfile', '-NonInteractive', '-Command', l] },
      { kind: 'cmd', exe: 'cmd.exe', argv: (l) => ['/d', '/s', '/c', `"${l}"`], verbatim: true },
    ];
  }
  const list: Shell[] = [{ kind: 'posix', exe: 'bash', argv: (l) => ['-c', l] }, { kind: 'posix', exe: 'sh', argv: (l) => ['-c', l] }];
  if (cp.spawnSync('which', ['zsh']).status === 0) list.push({ kind: 'posix', exe: 'zsh', argv: (l) => ['-c', l] });
  return list;
}

function main(): number {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aac contract '));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const agent = path.join(root, 'fake-agent.js');
  fs.writeFileSync(agent, FAKE_AGENT);
  for (const name of new Set(HARNESS_ADAPTERS.flatMap((a) => a.binaries))) {
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(bin, `${name}.cmd`), `@"${process.execPath}" "${agent}" %*\r\n`);
    } else {
      fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${agent}" "$@"\n`, { mode: 0o755 });
    }
  }
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` };
  const digest = crypto.createHash('sha256').update(HOSTILE, 'utf8').digest('hex');
  let failures = 0;
  let passes = 0;
  for (const shell of shells()) {
    for (const adapter of HARNESS_ADAPTERS) {
      for (const posture of ['sandboxed', 'full'] as const) {
        const out = path.join(root, 'out', `${shell.exe}-${adapter.id}-${posture}`);
        fs.mkdirSync(out, { recursive: true });
        const resultPath = path.join(out, 'result.json');
        const promptFile = stagePromptFile(out, adapter.id, posture, `RESULT_PATH=${resultPath}\nDIGEST=${digest}\nBODY<${HOSTILE}>BODY`);
        const spec = buildHarnessLaunch(adapter, { binary: adapter.binaries[0], promptFile, resultPath, posture });
        const line = buildCommandLine(spec, shell.kind);
        const res = cp.spawnSync(shell.exe, shell.argv(line), { env, cwd: root, encoding: 'utf-8', timeout: 60_000, windowsVerbatimArguments: shell.verbatim });
        let verdict = '';
        let argvOk = false;
        try {
          const v = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
          verdict = v.verdict;
          argvOk = JSON.stringify(v.argv) === JSON.stringify(spec.args.slice(1));
        } catch { /* missing */ }
        if (verdict === 'COMPLETED' && argvOk) {
          passes++;
        } else {
          failures++;
          console.log(`✗ ${shell.exe} ${adapter.id} ${posture}: verdict=${verdict || 'none'} argvOk=${argvOk}\n  $ ${line}\n  ${(res.stderr ?? '').trim().slice(0, 300)}`);
        }
      }
    }
  }
  console.log(`${os.platform()} ${shells().map((s) => s.exe).join('/')}: ${passes} passed, ${failures} failed`);
  fs.rmSync(root, { recursive: true, force: true });
  return failures;
}

process.exit(main());
