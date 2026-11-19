// Real-harness smoke test: launches every INSTALLED coding-agent CLI through
// the production adapter + shell command line, in a throwaway workspace, and
// checks that it writes the verdict file. Makes real model calls.
//
//   npx ts-node --transpile-only scripts/_demo/smoke-harnesses.ts [posture] [harness...]
//
// posture defaults to "sandboxed". Exit code is the number of failures.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HARNESS_ADAPTERS, buildHarnessLaunch, type PermissionPosture } from '../../src/workflow/harness/harness-adapters';
import { buildCommandLine, detectShellKind } from '../../src/workflow/harness/shell-command';
import { stagePromptFile } from '../../src/workflow/harness/prompt-staging';

const TIMEOUT_MS = Number(process.env.AAC_SMOKE_TIMEOUT_MS) || 4 * 60 * 1000;

function onPath(bin: string): boolean {
  return cp.spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { windowsHide: true }).status === 0;
}

function shellFor(): { exe: string; argv: (l: string) => string[]; kind: ReturnType<typeof detectShellKind> } {
  if (process.platform === 'win32') {
    return { exe: 'powershell.exe', argv: (l) => ['-NoProfile', '-NonInteractive', '-Command', l], kind: 'powershell' };
  }
  return { exe: 'bash', argv: (l) => ['-c', l], kind: 'posix' };
}

function main(): number {
  const posture = (process.argv[2] === 'full' ? 'full' : 'sandboxed') as PermissionPosture;
  const only = process.argv.slice(3);
  const shell = shellFor();
  let failures = 0;
  for (const adapter of HARNESS_ADAPTERS) {
    if (only.length && !only.includes(adapter.id)) continue;
    const binary = adapter.binaries.find(onPath);
    if (!binary) { console.log(`- ${adapter.id}: not installed, skipped`); continue; }

    const ws = fs.mkdtempSync(path.join(os.tmpdir(), `aac-smoke-${adapter.id}-`));
    const outputFolder = path.join(ws, '.agileagentcanvas-context');
    const resultPath = path.join(outputFolder, '_terminal-output', 'SMOKE-1-dev-result.json');
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    const prompt =
      'You are running as a non-interactive headless agent for a connectivity smoke test.\n' +
      `Create the file ${resultPath.replace(/\\/g, '/')} containing exactly this JSON and nothing else:\n` +
      '{"verdict":"COMPLETED","summary":"smoke test"}\n' +
      'Do not create or modify any other file. Then stop.\n';
    const promptFile = stagePromptFile(outputFolder, 'SMOKE-1', 'run', prompt);
    const launch = buildHarnessLaunch(adapter, { binary, promptFile, resultPath, posture });
    // Test-only: AAC_SMOKE_EXTRA_<ID> (JSON string array) adds flags such as a
    // model override, placed after the subcommand ("exec"/"run") so trailing
    // stdin markers ("-", "-p") stay last. The adapters themselves are unchanged.
    const extra = process.env[`AAC_SMOKE_EXTRA_${adapter.id.replace(/-/g, '_').toUpperCase()}`];
    const args = [...launch.args];
    if (extra) {
      const at = args[1] === 'exec' || args[1] === 'run' ? 2 : 1;
      args.splice(at, 0, ...(JSON.parse(extra) as string[]));
    }
    const line = buildCommandLine({ ...launch, args }, shell.kind);

    const started = Date.now();
    const res = cp.spawnSync(shell.exe, shell.argv(line), { cwd: ws, encoding: 'utf-8', timeout: TIMEOUT_MS, windowsHide: true });
    const secs = Math.round((Date.now() - started) / 1000);
    let verdict = '';
    try { verdict = JSON.parse(fs.readFileSync(resultPath, 'utf-8')).verdict; } catch { /* missing */ }
    if (verdict === 'COMPLETED') {
      console.log(`✓ ${adapter.id} (${posture}) wrote its verdict in ${secs}s`);
      fs.rmSync(ws, { recursive: true, force: true });
    } else {
      failures++;
      const tail = `${res.stdout ?? ''}\n${res.stderr ?? ''}`.trim().split(/\r?\n/).slice(-8).join('\n    ');
      console.log(`✗ ${adapter.id} (${posture}) no verdict after ${secs}s (exit ${res.status}${res.error ? `, ${res.error.message}` : ''})\n    $ ${line}\n    ${tail}\n    workspace kept: ${ws}`);
    }
  }
  return failures;
}

process.exit(main());
