// Launches src/test/live/harness-live.ts inside a real, isolated VS Code
// window (fresh user-data dir, no other extensions) with fake harness CLIs
// first on PATH, then prints the per-check results.
//
//   npx ts-node --transpile-only scripts/_demo/run-live-harness-test.ts
//   AAC_LIVE_MODEL_HARNESS=aider OPENAI_API_KEY=... OPENAI_API_BASE=... npx ts-node ... (adds a real-model check)
//
// VS Code location: $VSCODE_EXE, else the default per-user install on Windows.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const FAKE_AGENT = `
const fs = require('fs');
const args = process.argv.slice(2);
let prompt;
const pointer = args.find(a => a.startsWith('Read the file '));
if (pointer) prompt = fs.readFileSync(pointer.match(/^Read the file (.+?) and carry out/)[1], 'utf-8');
if (prompt === undefined) { try { prompt = fs.readFileSync(0, 'utf-8'); } catch { prompt = ''; } }
const resultPath = (prompt.match(/EXACTLY this file path:\\s*\`\`\`\\s*([^\\r\\n]+?)\\s*\`\`\`/) || [])[1];
const runId = (prompt.match(/"run_id": "([^"]+)"/) || [])[1];
const finish = () => {
  fs.mkdirSync(require('path').dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, JSON.stringify({ verdict: 'COMPLETED', run_id: runId, summary: 'fake agent' }));
};
if (prompt.includes('LIVE-SLOW')) setTimeout(finish, 90000); else finish();
`;

function vscodeExe(): string {
  if (process.env.VSCODE_EXE) return process.env.VSCODE_EXE;
  if (process.platform === 'win32') return path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe');
  throw new Error('Set VSCODE_EXE to the VS Code executable');
}

function main(): number {
  const repo = path.resolve(__dirname, '..', '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-live-'));
  const ws = path.join(root, 'workspace');
  const bin = path.join(root, 'bin');
  const ext = path.join(root, 'dev-extension');
  for (const d of [ws, bin, ext]) fs.mkdirSync(d, { recursive: true });

  // Minimal host extension: the test imports the runtime modules directly, so
  // the full extension (and its webview build) is not needed.
  fs.writeFileSync(path.join(ext, 'package.json'), JSON.stringify({
    name: 'aac-live-harness-host', publisher: 'aac-test', version: '0.0.0', engines: { vscode: '^1.90.0' },
  }));
  const testBundle = path.join(root, 'harness-live.js');
  cp.execFileSync(process.execPath, [
    require.resolve('esbuild/bin/esbuild'), path.join(repo, 'src', 'test', 'live', 'harness-live.ts'),
    '--bundle', '--platform=node', '--format=cjs', '--external:vscode', '--external:node-pty', `--outfile=${testBundle}`, '--log-level=error',
  ], { stdio: 'inherit' });

  const agent = path.join(bin, 'fake-agent.js');
  fs.writeFileSync(agent, FAKE_AGENT);
  for (const name of ['claude', 'cursor-agent']) {
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(bin, `${name}.cmd`), `@"${process.execPath}" "${agent}" %*\r\n`);
    } else {
      fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${agent}" "$@"\n`, { mode: 0o755 });
    }
  }

  const resultFile = path.join(root, 'results.json');
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`, AAC_LIVE_RESULT: resultFile };
  delete env.ELECTRON_RUN_AS_NODE;
  const res = cp.spawnSync(vscodeExe(), [
    ws, '--new-window', '--disable-workspace-trust', '--disable-extensions', '--skip-welcome', '--skip-release-notes',
    `--user-data-dir=${path.join(root, 'user-data')}`, `--extensions-dir=${path.join(root, 'extensions')}`,
    `--extensionDevelopmentPath=${ext}`, `--extensionTestsPath=${testBundle}`,
  ], { env, encoding: 'utf-8', timeout: 25 * 60_000 });

  if (!fs.existsSync(resultFile)) {
    console.error(`No results (exit ${res.status}). ${res.error?.message ?? ''}\n${(res.stderr ?? '').slice(-2000)}`);
    return 1;
  }
  const { shell, results } = JSON.parse(fs.readFileSync(resultFile, 'utf-8')) as { shell: string; results: Array<{ name: string; ok: boolean; detail: string; ms: number }> };
  console.log(`VS Code exit ${res.status}; integrated terminal shell: ${shell}`);
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name} (${Math.round(r.ms / 1000)}s): ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  if (failed === 0) fs.rmSync(root, { recursive: true, force: true });
  else console.log(`artifacts kept in ${root}`);
  return failed;
}

process.exit(main());
