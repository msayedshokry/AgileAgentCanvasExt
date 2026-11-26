import { describe, it, expect } from 'vitest';
import { buildAgentBrief, buildResumeBrief, readAgentNotes } from './agent-brief';

const dev = { id: 'dev', name: 'Dev Agent', harness: 'claude', model: 'sonnet', role: 'Implements stories', instructions: 'Add a test for every change.' };
const reviewer = { id: 'reviewer', name: 'Reviewer', harness: 'codex', role: 'Reviews against acceptance criteria' };
const lead = { id: 'cos', name: 'Chief of Staff', harness: 'claude', lead: true };

describe('buildAgentBrief', () => {
  const brief = buildAgentBrief({
    agent: dev, cliLabel: 'Claude Code', model: 'sonnet', roster: [dev, reviewer, lead],
    notes: [{ author: 'Reviewer', text: 'Error states missing', at: '2026-11-25 10:00' }],
  });

  it('tells the agent who it is, with its role, CLI and model', () => {
    expect(brief).toContain('You are **Dev Agent** (agent id `dev`), running on Claude Code with model `sonnet`. Your role: Implements stories.');
  });

  it('gives the agent its own instructions, marked as the user\'s', () => {
    expect(brief).toContain('### Your instructions (from the user — follow them)\nAdd a test for every change.');
  });

  it('teaches the board block and lists the other agents by id, without itself', () => {
    expect(brief).toContain('`"questions"`');
    expect(brief).toContain('`"handoff"`: `{"to": "<agent id>"');
    expect(brief).toContain('- `reviewer` — Reviewer: Reviews against acceptance criteria');
    expect(brief).toContain('- `cos` — Chief of Staff (lead)');
    expect(brief).not.toContain('- `dev` —');
  });

  it('puts card notes last, after the stable sections, so the cached prefix holds', () => {
    expect(brief.indexOf('### Notes on this card')).toBeGreaterThan(brief.indexOf('### Instruction precedence'));
    expect(brief).toContain('- Reviewer (2026-11-25 10:00): Error states missing');
  });

  it('works for a card with no assignee and a team of one', () => {
    const plain = buildAgentBrief({ cliLabel: 'Codex', roster: [], notes: [] });
    expect(plain).toContain('the board\'s default agent');
    expect(plain).toContain('nobody to hand off to');
    expect(plain).not.toContain('### Your instructions');
    expect(plain).not.toContain('### Notes on this card');
  });
});

describe('buildResumeBrief', () => {
  it('names who is running now and repeats only new notes', () => {
    const short = buildResumeBrief({ agent: reviewer, cliLabel: 'OpenAI Codex CLI', roster: [dev, reviewer], notes: [{ author: 'Dev Agent', text: 'Used rules.ts', at: 't' }] });
    expect(short).toContain('You are **Reviewer**');
    expect(short).toContain('Used rules.ts');
    expect(short).not.toContain('### The board');
  });
});

describe('readAgentNotes', () => {
  it('reads notes from card metadata and ignores junk', () => {
    expect(readAgentNotes({ metadata: { agentNotes: [{ author: 'A', text: 'x', at: 't' }, { text: 'no author' }, 5] } }))
      .toEqual([{ author: 'A', text: 'x', at: 't' }]);
    expect(readAgentNotes({})).toEqual([]);
  });
});

describe('readAgentNotes — where the store keeps them', () => {
  it('reads the top-level field the story reducer lifts metadata into', () => {
    expect(readAgentNotes({ agentNotes: [{ author: 'A', text: 'lifted', at: 't' }] })).toEqual([{ author: 'A', text: 'lifted', at: 't' }]);
  });
});

describe('buildAgentBrief — skills', () => {
  it('lists the agent\'s skills with where to read them, before the board rules', () => {
    const brief = buildAgentBrief({
      agent: { id: 'dev', name: 'Dev', harness: 'claude' }, cliLabel: 'Claude Code', roster: [], notes: [],
      skills: [{ id: 'aac-dev', name: 'Dev story', description: 'Implements a story', path: '.agileagentcanvas-context/_terminal-output/skills/aac-dev/SKILL.md' }],
    });
    expect(brief).toContain('### Your skills');
    expect(brief).toContain('- **Dev story** (`.agileagentcanvas-context/_terminal-output/skills/aac-dev/SKILL.md`): Implements a story');
    expect(brief.indexOf('### Your skills')).toBeLessThan(brief.indexOf('### The board'));
  });
});

describe('buildAgentBrief — live board tools', () => {
  it('lists the board tools only for runs that have them', () => {
    const base = { agent: { id: 'dev', name: 'Dev', harness: 'claude' }, cliLabel: 'Claude Code', roster: [], notes: [] };
    expect(buildAgentBrief({ ...base, liveTools: true })).toContain('`board_check_messages`');
    expect(buildAgentBrief(base)).not.toContain('Board tools (live)');
    expect(buildResumeBrief({ ...base, liveTools: true })).toContain('call board_check_messages first');
  });
});

describe('epic context in the brief', () => {
  const input = { agent: dev, cliLabel: 'Claude Code', roster: [dev], notes: [{ author: 'Reviewer', text: 'Fix it', at: '2026-11-26 09:00' }] };

  it('lists the epic context after the precedence rules and before the card notes', () => {
    const brief = buildAgentBrief({ ...input, epicContext: { epicId: 'E-1', context: { paths: ['docs/auth.md'], urls: [], note: 'Use v2' } } });
    const at = brief.indexOf('### Context for this epic (E-1)');
    expect(at).toBeGreaterThan(brief.indexOf('### Instruction precedence'));
    expect(at).toBeLessThan(brief.indexOf('### Notes on this card'));
    expect(brief).toContain('- `docs/auth.md`');
  });

  it('leaves it out when the epic has none, and marks people on the team', () => {
    const brief = buildAgentBrief({ ...input, roster: [dev, { id: 'maya', name: 'Maya', harness: '', kind: 'person' as const }] });
    expect(brief).not.toContain('Context for this epic');
    expect(brief).toContain('- `maya` — Maya (person)');
  });
});

