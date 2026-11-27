import { describe, it, expect } from 'vitest';
import { agentBuilderPrompt, parseAgentDraft } from './agent-builder';

const skills = [
  { id: 'aac-code-review', name: 'Code review', description: 'Review a diff' },
  { id: 'aac-e2e', name: 'E2E tests', description: 'Write Playwright tests' },
];
const clis = [{ id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'OpenAI Codex CLI' }];

describe('agentBuilderPrompt', () => {
  it('gives the model the request, the current draft, the team, the skills and the CLIs, and asks for JSON only', () => {
    const prompt = agentBuilderPrompt({
      request: 'Reviews frontend pull requests for accessibility',
      draft: { name: 'Reviewer', instructions: 'Never edit code.' },
      team: [{ name: 'Amelia', role: 'Implements web stories' }],
      skills, clis,
    });
    expect(prompt).toContain('Reviews frontend pull requests for accessibility');
    expect(prompt).toContain('Never edit code.');
    expect(prompt).toContain('Amelia');
    expect(prompt).toContain('aac-code-review');
    expect(prompt).toContain('claude');
    expect(prompt).toMatch(/JSON/);
  });
});

describe('parseAgentDraft', () => {
  it('keeps what fits and only skills and CLIs that exist', () => {
    const draft = parseAgentDraft(JSON.stringify({
      name: 'Frontend Reviewer', role: 'Reviews frontend PRs', instructions: 'Read the diff first.',
      skills: ['aac-code-review', 'made-up-skill'], harness: 'claude', model: 'sonnet',
    }), { skills, clis });
    expect(draft).toEqual({ ok: true, draft: {
      name: 'Frontend Reviewer', role: 'Reviews frontend PRs', instructions: 'Read the diff first.',
      skills: ['aac-code-review'], harness: 'claude', model: 'sonnet',
    } });
  });

  it('drops a CLI that is not installed and cuts over-long fields', () => {
    const result = parseAgentDraft(`Here you go:\n\`\`\`json\n${JSON.stringify({ name: 'x'.repeat(80), role: 'r'.repeat(300), harness: 'gemini' })}\n\`\`\``, { skills, clis });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.name).toHaveLength(40);
    expect(result.draft.role).toHaveLength(120);
    expect(result.draft.harness).toBeUndefined();
  });

  it('says so when the reply has no usable draft', () => {
    expect(parseAgentDraft('Sorry, I cannot help.', { skills, clis }).ok).toBe(false);
    expect(parseAgentDraft('{"role": 5}', { skills, clis }).ok).toBe(false);
  });
});
