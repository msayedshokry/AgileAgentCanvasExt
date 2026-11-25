import { describe, it, expect } from 'vitest';
import { buildContextReceipt, shortHash, summarizeReceipt, AUTO_LOADED_FILES } from './context-receipt';
import { HARNESS_IDS } from './harness-adapters';

const files: Record<string, string> = { 'CLAUDE.md': 'claude rules', 'AGENTS.md': 'agent rules' };
const base = {
  harness: 'claude' as const,
  prompt: 'P'.repeat(4100),
  resumed: false,
  workflowId: 'dev-story',
  skillContent: 'skill body',
  projectContext: 'npm test',
  artifactJson: '{"id":"S-1"}',
  readFile: (rel: string) => files[rel],
};

describe('buildContextReceipt', () => {
  it('records each source with size, hash and delivery, never the content', () => {
    const r = buildContextReceipt(base);
    expect(r.map((i) => [i.kind, i.delivery])).toEqual([
      ['run-prompt', 'inline'],
      ['card', 'inline'],
      ['workflow-definition', 'inline'],
      ['project-context', 'inline'],
      ['instruction-file', 'discovered'],
    ]);
    expect(r[4]).toMatchObject({ name: 'CLAUDE.md', chars: 12, hash: shortHash('claude rules') });
    expect(JSON.stringify(r)).not.toContain('claude rules');
  });

  it('lists only the instruction files the chosen CLI loads, and only when present', () => {
    const codex = buildContextReceipt({ ...base, harness: 'codex' });
    expect(codex.filter((i) => i.kind === 'instruction-file').map((i) => i.name)).toEqual(['AGENTS.md']);
    const cursor = buildContextReceipt({ ...base, harness: 'cursor-agent' });
    expect(cursor.filter((i) => i.kind === 'instruction-file').map((i) => i.name)).toEqual(['AGENTS.md']);
  });

  it('marks the brief as already in the conversation on a resumed run', () => {
    const r = buildContextReceipt({ ...base, resumed: true });
    expect(r.find((i) => i.kind === 'workflow-definition')?.delivery).toBe('resumed');
    expect(r.find((i) => i.kind === 'run-prompt')?.delivery).toBe('inline');
  });

  it('knows the auto-loaded files of every harness', () => {
    for (const id of HARNESS_IDS) expect(AUTO_LOADED_FILES[id]).toBeDefined();
  });
});

describe('summarizeReceipt', () => {
  it('renders a compact one-line summary', () => {
    const line = summarizeReceipt(buildContextReceipt({ ...base, skillContent: undefined, projectContext: undefined }));
    expect(line).toBe('run prompt 4.1k · card JSON 12 · CLAUDE.md 12 (discovered)');
  });
});
