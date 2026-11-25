// ─── Squad protocol ──────────────────────────────────────────────────────────
// How the members of an agent team work together:
//   - every member gets a brief: its role, the roster, and the rules
//     (be terse, don't restate the task, end with a handoff note)
//   - the coordinator decides who is needed: a `NEXT: crafter, gate` line
//     limits the remaining members to those roles (omitted: everyone runs)
//   - the gate's `VERDICT: CHANGES_REQUESTED` sends the work back to the
//     crafter once, then the gate reviews again
//   - members see each other's handoff notes, bounded in size, instead of
//     raw JSON dumps
// Pure: no vscode.

import type { AgentRole } from '../types';

export interface SquadMember {
  readonly role: AgentRole;
  readonly personaId: string;
  readonly order: number;
}

export interface HandoffNote {
  readonly role: AgentRole;
  readonly text: string;
}

export type GateVerdict = 'approved' | 'changes-requested' | 'unknown';

/** How many times the gate may send work back to the crafter. */
export const MAX_REWORK_ROUNDS = 1;
const NOTE_CHARS = 2000;
const NOTES_TOTAL_CHARS = 6000;

export const ROLE_DUTY: Readonly<Record<AgentRole, string>> = {
  coordinator: 'plans the work and decides which members are needed',
  researcher: 'gathers the information the others need',
  crafter: 'does the work and produces the result',
  gate: 'reviews the result and approves it or requests changes',
};

const ROLE_CLOSING: Readonly<Record<AgentRole, string>> = {
  coordinator: 'End with one line `NEXT: <roles>` naming only the members still needed, in order (for example `NEXT: crafter, gate`), followed by one sentence saying why.',
  researcher: 'End with the findings the crafter needs, as a short list.',
  crafter: 'End with a short handoff note: what you changed and what the reviewer should check.',
  gate: 'End with exactly one line: `VERDICT: APPROVED` or `VERDICT: CHANGES_REQUESTED`, followed by the specific changes needed.',
};

/** The squad brief prepended to a member's task. */
export function memberBrief(members: readonly SquadMember[], role: AgentRole): string {
  const roster = [...members]
    .sort((a, b) => a.order - b.order)
    .map((m) => `- ${m.role}${m.role === role ? ' (you)' : ''}: ${ROLE_DUTY[m.role]}`)
    .join('\n');
  return [
    '## Squad protocol',
    `You are the ${role} on this team. Roster:`,
    roster,
    '',
    'Rules: be terse. Do not restate the task or earlier notes — the others can read them. Do only your role\'s part.',
    ROLE_CLOSING[role],
  ].join('\n');
}

/**
 * Roles the coordinator asked for, in its order, limited to the team's
 * remaining roles. Undefined when it gave no usable `NEXT:` line.
 */
export function parseRouting(text: string, available: readonly AgentRole[]): AgentRole[] | undefined {
  const match = /^\s*\**NEXT\**\s*:\s*(.+)$/im.exec(text);
  if (!match) return undefined;
  const asked = match[1].toLowerCase().split(/[\s,]+/).filter(Boolean);
  const roles = asked.filter((r): r is AgentRole => (available as readonly string[]).includes(r));
  return roles.length > 0 ? [...new Set(roles)] : undefined;
}

/** The gate's decision from its `VERDICT:` line (the last one wins). */
export function parseGateVerdict(text: string): GateVerdict {
  const lines = [...text.matchAll(/^\s*\**VERDICT\**\s*:\s*\**\s*([A-Z_ -]+)/gim)];
  const last = lines.at(-1)?.[1].trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (last === 'APPROVED') return 'approved';
  if (last === 'CHANGES_REQUESTED' || last === 'NEEDS_FIXES') return 'changes-requested';
  return 'unknown';
}

/** Earlier members' notes, newest kept when over budget, each bounded. */
export function renderHandoffNotes(notes: readonly HandoffNote[]): string {
  const rendered: string[] = [];
  let total = 0;
  for (const note of [...notes].reverse()) {
    const text = note.text.trim();
    if (!text) continue;
    const body = text.length > NOTE_CHARS ? '…' + text.slice(-NOTE_CHARS) : text;
    if (total + body.length > NOTES_TOTAL_CHARS) break;
    total += body.length;
    rendered.unshift(`### From the ${note.role}\n${body}`);
  }
  return rendered.length > 0 ? `## Handoff notes\n${rendered.join('\n\n')}` : '';
}

/**
 * Queue changes after a member finishes: routing after the coordinator, a
 * rework round after a gate that requested changes. Returns the new queue.
 */
export function nextQueue(
  finished: AgentRole,
  output: string,
  queue: readonly SquadMember[],
  members: readonly SquadMember[],
  reworkRounds: number,
): { queue: SquadMember[]; note?: string; rework?: true } {
  if (finished === 'coordinator') {
    const routed = parseRouting(output, queue.map((m) => m.role));
    if (!routed) return { queue: [...queue] };
    const kept = queue.filter((m) => routed.includes(m.role));
    const skipped = queue.filter((m) => !routed.includes(m.role)).map((m) => m.role);
    return { queue: kept, note: skipped.length > 0 ? `coordinator skipped: ${skipped.join(', ')}` : undefined };
  }
  if (finished === 'gate' && parseGateVerdict(output) === 'changes-requested' && reworkRounds < MAX_REWORK_ROUNDS) {
    const crafter = members.find((m) => m.role === 'crafter');
    const gate = members.find((m) => m.role === 'gate');
    if (crafter && gate) return { queue: [crafter, gate, ...queue], note: 'gate requested changes — back to the crafter', rework: true };
  }
  return { queue: [...queue] };
}
