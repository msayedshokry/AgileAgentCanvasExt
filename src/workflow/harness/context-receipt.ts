// ─── Context receipt ─────────────────────────────────────────────────────────
// A per-run record of what context the agent was given: each source, its size,
// a short content hash and how it was delivered. It answers "why didn't the
// agent know X?" after the fact without keeping the content itself — only
// names, sizes and hashes are stored.
//
// Delivery:
//   inline      written into this run's prompt
//   discovered  an instruction file the CLI loads by itself from the working
//               directory (expected, not confirmed — the CLI does not report it)
//   resumed     already in the resumed conversation, not sent again
// Pure: file reads are injected.

import { createHash } from 'crypto';
import type { HarnessId } from './harness-adapters';

export type ReceiptKind = 'run-prompt' | 'workflow-definition' | 'project-context' | 'project-memory' | 'card' | 'instruction-file';
export type ReceiptDelivery = 'inline' | 'discovered' | 'resumed';

export interface ReceiptItem {
  readonly kind: ReceiptKind;
  readonly name: string;
  readonly chars: number;
  /** First 12 hex chars of the SHA-256 of the content. */
  readonly hash: string;
  readonly delivery: ReceiptDelivery;
}

/** Instruction files each CLI reads by itself from its working directory. */
export const AUTO_LOADED_FILES: Readonly<Record<HarnessId, readonly string[]>> = {
  'claude': ['CLAUDE.md'],
  'codex': ['AGENTS.md'],
  'gemini': ['GEMINI.md'],
  'copilot-cli': ['AGENTS.md', '.github/copilot-instructions.md'],
  'cursor-agent': ['AGENTS.md', '.cursorrules'],
  'opencode': ['AGENTS.md'],
  'pi': ['AGENTS.md'],
  'aider': [],
};

export function shortHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function item(kind: ReceiptKind, name: string, text: string, delivery: ReceiptDelivery): ReceiptItem {
  return { kind, name, chars: text.length, hash: shortHash(text), delivery };
}

export interface ReceiptInput {
  readonly harness: HarnessId;
  readonly prompt: string;
  readonly resumed: boolean;
  readonly workflowId: string;
  readonly skillContent?: string;
  readonly projectContext?: string;
  /** The project-memory section of the brief (project-memory.ts). */
  readonly projectMemory?: string;
  readonly artifactJson: string;
  /** Reads a file relative to the run's working directory; undefined when absent. */
  readonly readFile: (relPath: string) => string | undefined;
}

export function buildContextReceipt(input: ReceiptInput): ReceiptItem[] {
  const briefDelivery: ReceiptDelivery = input.resumed ? 'resumed' : 'inline';
  const items: ReceiptItem[] = [
    item('run-prompt', 'run prompt', input.prompt, 'inline'),
    item('card', 'card JSON', input.artifactJson, 'inline'),
  ];
  if (input.skillContent) items.push(item('workflow-definition', input.workflowId, input.skillContent, briefDelivery));
  if (input.projectContext) items.push(item('project-context', 'project context', input.projectContext, briefDelivery));
  if (input.projectMemory) items.push(item('project-memory', 'project memory', input.projectMemory, briefDelivery));
  for (const file of AUTO_LOADED_FILES[input.harness] ?? []) {
    const text = input.readFile(file);
    if (text !== undefined) items.push(item('instruction-file', file, text, 'discovered'));
  }
  return items;
}

/** One line for logs and tooltips, e.g. "run prompt 4.1k · CLAUDE.md 2.0k (discovered)". */
export function summarizeReceipt(items: readonly ReceiptItem[]): string {
  const size = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return items
    .map((i) => `${i.name} ${size(i.chars)}${i.delivery === 'inline' ? '' : ` (${i.delivery})`}`)
    .join(' · ');
}
