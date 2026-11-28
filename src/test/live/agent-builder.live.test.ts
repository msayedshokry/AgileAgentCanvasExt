// Build with AI against a real model: the exact prompt the extension sends,
// answered by Claude Code in print mode, parsed by the extension's parser.
// Skipped unless AAC_LIVE_MODEL=1 (it spends tokens and needs `claude` signed in).
//   AAC_LIVE_MODEL=1 npx vitest run src/test/live/agent-builder.live.test.ts

import { describe, it, expect } from 'vitest';
import * as cp from 'child_process';
import * as path from 'path';
import { agentBuilderPrompt, parseAgentDraft } from '../../workflow/harness/agent-builder';
import { listSkills } from '../../workflow/harness/skill-catalog';
import { askCli } from '../../workflow/harness/cli-ask';
import { getHarnessAdapter } from '../../workflow/harness/harness-adapters';

const LIVE = process.env.AAC_LIVE_MODEL === '1';
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn('claude', ['-p', '--model', process.env.AAC_LIVE_MODEL_ID ?? 'haiku'], { shell: process.platform === 'win32' });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { err += String(d); });
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`claude exited ${code}: ${err.slice(0, 400)}`))));
    child.stdin.end(prompt);
  });
}

describe.skipIf(!LIVE)('Build with AI (live model)', () => {
  const skills = listSkills(repoRoot, path.join(repoRoot, 'resources', '_aac', 'skills')).map(({ id, name, description }) => ({ id, name, description }));
  const clis = [{ id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'OpenAI Codex CLI' }];

  it('drafts a usable agent from a one-line request', async () => {
    const prompt = agentBuilderPrompt({
      request: 'Reviews frontend pull requests for accessibility problems and never edits code itself',
      draft: {},
      team: [{ name: 'Amelia', role: 'Implements web stories' }],
      skills, clis,
    });
    const reply = await askClaude(prompt);
    const result = parseAgentDraft(reply, { skills, clis });
    expect(result.ok, reply.slice(0, 500)).toBe(true);
    if (!result.ok) return;
    console.info('[live draft]', JSON.stringify(result.draft, null, 2));
    expect(result.draft.skills?.length ?? 0).toBeGreaterThan(0);
    expect(result.draft.name).toBeTruthy();
    expect(result.draft.role).toBeTruthy();
    expect(result.draft.instructions?.length ?? 0).toBeGreaterThan(80);
    for (const id of result.draft.skills ?? []) expect(skills.some((s) => s.id === id)).toBe(true);
  }, 180_000);

  it('refines the current form instead of starting over', async () => {
    const prompt = agentBuilderPrompt({
      request: 'Also have it check colour contrast',
      draft: { name: 'A11y Reviewer', role: 'Reviews frontend PRs for accessibility', instructions: 'Never edit code. Comment on the PR only.' },
      team: [], skills, clis,
    });
    const result = parseAgentDraft(await askClaude(prompt), { skills, clis });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    console.info('[live refine]', JSON.stringify(result.draft, null, 2));
    expect(result.draft.instructions ?? '').toMatch(/contrast/i);
    expect(result.draft.instructions ?? '').toMatch(/(never|do not|don't) edit/i);
  }, 180_000);
});

// The path the extension takes when the board's agent is a CLI: askCli with the
// real adapter's sandboxed launch, the answer written to a file.
describe.skipIf(!LIVE)('Build with AI through the board agent (live CLI)', () => {
  const skills = listSkills(repoRoot, path.join(repoRoot, 'resources', '_aac', 'skills')).map(({ id, name, description }) => ({ id, name, description }));
  const clis = [{ id: 'claude', label: 'Claude Code' }];
  const harness = process.env.AAC_LIVE_HARNESS ?? 'claude';

  it(`drafts an agent with ${harness}`, async () => {
    const adapter = getHarnessAdapter(harness);
    if (!adapter) throw new Error(`unknown harness ${harness}`);
    const prompt = agentBuilderPrompt({ request: 'Writes release notes from merged pull requests; never pushes', draft: {}, team: [], skills, clis });
    const answer = await askCli({ adapter, binary: adapter.binaries[0], prompt });
    expect(answer.ok, answer.ok ? '' : answer.error).toBe(true);
    if (!answer.ok) return;
    const result = parseAgentDraft(answer.text, { skills, clis });
    expect(result.ok, answer.text.slice(0, 500)).toBe(true);
    if (result.ok) console.info('[live cli draft]', JSON.stringify(result.draft, null, 2));
  }, 300_000);
});
