// ─── Build an agent with AI ──────────────────────────────────────────────────
// Like Multica's "Let AI write it": you say what the agent is for, a model
// drafts its name, role, instructions, skills, CLI and model, and you review
// the form before saving. Pure: the prompt and the parsing of the reply.

import { extractJson } from '../../lib/json-extract';

const MAX_NAME = 40;
const MAX_ROLE = 120;
const MAX_INSTRUCTIONS = 4000;
const MAX_SKILLS = 8;

export interface BuilderSkill { readonly id: string; readonly name: string; readonly description: string }
export interface BuilderCli { readonly id: string; readonly label: string }

export interface AgentDraft {
  readonly name?: string;
  readonly role?: string;
  readonly instructions?: string;
  readonly skills?: readonly string[];
  readonly harness?: string;
  readonly model?: string;
}

export interface BuilderRequest {
  readonly request: string;
  /** What the form holds now; the model refines it instead of starting over. */
  readonly draft: AgentDraft;
  readonly team: ReadonlyArray<{ name: string; role?: string }>;
  readonly skills: readonly BuilderSkill[];
  readonly clis: readonly BuilderCli[];
}

export function agentBuilderPrompt(req: BuilderRequest): string {
  const lines = [
    'You design one coding agent for a team that works a Kanban board. Each agent runs a coding CLI on the cards assigned to it.',
    '',
    `What the user wants: ${req.request.trim()}`,
    '',
    'The form as it is now (keep what is good, improve the rest):',
    JSON.stringify(req.draft, null, 2),
    '',
    'Other agents on the team (avoid overlapping their roles):',
    ...(req.team.length ? req.team.map((a) => `- ${a.name}${a.role ? `: ${a.role}` : ''}`) : ['- none yet']),
    '',
    'Skills you may pick (use only these ids, at most 8, only ones that clearly help):',
    ...(req.skills.length ? req.skills.slice(0, 200).map((s) => `- ${s.id}: ${s.description.slice(0, 120)}`) : ['- none available']),
    '',
    `CLIs installed: ${req.clis.map((c) => `${c.id} (${c.label})`).join(', ') || 'none'}`,
    '',
    'Write instructions the agent follows on every run: what it is and is not responsible for, what to check first,',
    'what it may change, how to deliver, and when to stop and ask. Short, concrete sentences.',
    '',
    'Reply with JSON only, no prose:',
    '{"name": "<= 40 chars", "role": "one line, <= 120 chars", "instructions": "...", "skills": ["skill-id"], "harness": "cli id or omit", "model": "model id or omit"}',
  ];
  return lines.join('\n');
}

export type DraftResult = { ok: true; draft: AgentDraft } | { ok: false; error: string };

const text = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

/** The model's reply as a form draft: only fields that fit, skills and CLIs that exist. */
export function parseAgentDraft(raw: string, known: { skills: readonly BuilderSkill[]; clis: readonly BuilderCli[] }): DraftResult {
  const extracted = extractJson(raw);
  if (!extracted.ok || !extracted.data || typeof extracted.data !== 'object' || Array.isArray(extracted.data)) {
    return { ok: false, error: 'The model did not return a draft. Try again, or describe the agent differently.' };
  }
  const d = extracted.data as Record<string, unknown>;
  const skillIds = new Set(known.skills.map((s) => s.id));
  const skills = Array.isArray(d.skills) ? d.skills.filter((s): s is string => typeof s === 'string' && skillIds.has(s)).slice(0, MAX_SKILLS) : undefined;
  const harness = typeof d.harness === 'string' && known.clis.some((c) => c.id === d.harness) ? d.harness : undefined;
  const model = text(d.model, 100);
  const draft: AgentDraft = {
    ...(text(d.name, MAX_NAME) ? { name: text(d.name, MAX_NAME) } : {}),
    ...(text(d.role, MAX_ROLE) ? { role: text(d.role, MAX_ROLE) } : {}),
    ...(text(d.instructions, MAX_INSTRUCTIONS) ? { instructions: text(d.instructions, MAX_INSTRUCTIONS) } : {}),
    ...(skills && skills.length ? { skills } : {}),
    ...(harness ? { harness } : {}),
    ...(model && /^[\w.:/@-]+$/.test(model) ? { model } : {}),
  };
  if (!draft.name && !draft.role && !draft.instructions) {
    return { ok: false, error: 'The model did not return a draft. Try again, or describe the agent differently.' };
  }
  return { ok: true, draft };
}
