// ponytail: end-to-end check — does Claude Code, invoked the way chat-bridge does,
// actually write the verdict file the orchestrator polls for? Uses the real prompt shape.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT = '.agileagentcanvas-context';
const ARTIFACT = 'demo-story-1';
const WORKFLOW = 'dev-story';
const RESULT = join(OUTPUT, '_terminal-output', `${ARTIFACT}-${WORKFLOW}-result.json`);

// Prompt shape mirrors buildTerminalPrompt() in terminal-executor.ts:166-260.
// Trimmed for the demo but keeps all the load-bearing instructions.
const prompt = `You are executing a BMAD methodology workflow as a headless terminal agent.

## Workflow
- **Workflow ID:** ${WORKFLOW}
- **Artifact Type:** story
- **Artifact ID:** ${ARTIFACT}

## Artifact Context
\`\`\`json
{"id":"${ARTIFACT}","title":"Demo story","type":"story","status":"in-progress"}
\`\`\`

## Instructions
When finished, write your structured verdict JSON to EXACTLY this path:
${RESULT}

## Verdict contract
- The result file MUST be valid JSON and MUST include a top-level "verdict" field.
- This is a non-interactive terminal session — complete the workflow fully.
- Do not ask clarifying questions; do not start a REPL; do not request more context.

For this minimal smoke test, write ONLY this JSON to that exact path:
{"verdict":"COMPLETED","summary":"smoke test"}

Use the Write tool. Do not respond with anything else on stdout.`;

console.log('[demo] argv:', 'claude --dangerously-skip-permissions -p <prompt>');
const res = spawnSync(
  'claude',
  ['--dangerously-skip-permissions', '-p', prompt],
  { encoding: 'utf-8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'], shell: true }
);

console.log('[demo] exit:', res.status, 'signal:', res.signal);
console.log('[demo] stdout (last 500):', (res.stdout ?? '').slice(-500));
const err = (res.stderr ?? '').trim();
if (err) console.log('[demo] stderr:', err.slice(0, 400));

const ok = existsSync(RESULT);
console.log('[demo] verdict file exists:', ok, 'at', RESULT);
if (ok) {
  const text = readFileSync(RESULT, 'utf-8');
  console.log('[demo] verdict content:', text.slice(0, 400));
} else {
  process.exit(1);
}
