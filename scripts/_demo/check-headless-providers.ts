// ponytail: smoke-test the production headless CLI invocations for every provider
// we ship. The kanban orchestrator calls buildCliCommand() in terminal-executor.ts:240;
// we replicate its argv here and check whether each CLI actually writes a verdict file.
//
// Pass provider id as argv[2]: claude | opencode | pi  (codex/aider not on PATH;
// omp uses .omp/inbox.md, separate harness.)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const provider = process.argv[2];
if (!provider) { console.error('usage: tsx check-headless-providers.ts <claude|opencode|pi>'); process.exit(2); }

const ARTIFACT = `demo-${provider}`;
const WORKFLOW = 'dev-story';
const OUTDIR = '.agileagentcanvas-context/_terminal-output';
const RESULT = join(OUTDIR, `${ARTIFACT}-${WORKFLOW}-result.json`);

rmSync(RESULT, { force: true });
mkdirSync(OUTDIR, { recursive: true });

// Same prompt shape for every provider — model must write the verdict file.
const prompt = `You are running a non-interactive headless agent task. Do not start a REPL.
Do not ask clarifying questions. Do not respond with a plan.

Your ONLY action: write the following JSON to the exact file path below, then exit.

FILE PATH: ${RESULT}
FILE CONTENT (verbatim, including the trailing newline):
{"verdict":"COMPLETED","summary":"smoke test of ${provider} headless invocation"}

Constraints:
- The file MUST be valid JSON parseable as UTF-8.
- Use your file-writing tool (Write / Edit / create) — whichever your CLI exposes.
- Do not output anything else on stdout.`;

const cmds: Record<string, string[]> = {
  // Exact replicas of buildCliCommand() in src/workflow/terminal-executor.ts
  claude:   ['claude',   '--permission-mode', 'acceptEdits', '--output-format', 'json', '-p', prompt],
  opencode: ['opencode', 'run', '--model', 'auto', '--format', 'json', prompt],
  pi:       ['pi',       '--no-session', '--mode', 'json', '--approve', '-p', prompt],
};
const argv = cmds[provider];
if (!argv) { console.error('unknown provider:', provider); process.exit(2); }
const bin = argv[0];

console.log(`[${provider}] argv: ${bin} ${argv.slice(1, 6).join(' ')} … <prompt>`);
const t0 = Date.now();
const res = spawnSync(bin, argv.slice(1), {
  encoding: 'utf-8',
  timeout: 180_000,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true, // Windows POSIX shim
});
const ms = Date.now() - t0;
console.log(`[${provider}] exit:${res.status} signal:${res.signal} in ${ms}ms`);

const out = (res.stdout ?? '').trim();
const err = (res.stderr ?? '').trim();
if (out) console.log(`[${provider}] stdout (first 400):\n${out.slice(0, 400)}`);
if (err && !/connectors are disabled|ANTHROPIC_API_KEY/.test(err)) {
  console.log(`[${provider}] stderr (first 400):\n${err.slice(0, 400)}`);
}

const ok = existsSync(RESULT);
if (ok) {
  const text = readFileSync(RESULT, 'utf-8').trim();
  console.log(`[${provider}] PASS — verdict file written (${text.length} bytes):`);
  console.log(text.slice(0, 300));
} else {
  console.log(`[${provider}] FAIL — no verdict file at ${RESULT}`);
  process.exit(1);
}
