import { describe, it, expect } from 'vitest';
import { getAgentPathForArtifactType } from './agent-personas';

describe('ARTIFACT_TYPE_TO_AGENT after aac consolidation', () => {
  it('maps every artifact type to an aac-* skill (no bmad-* leakage)', () => {
    const types = ['vision', 'product-brief', 'prd', 'requirement', 'epic', 'story',
      'use-case', 'architecture', 'sprint', 'ux-design', 'readiness', 'party',
      'document', 'code-review', 'quick-spec', 'quick-dev'];
    for (const t of types) {
      const p = getAgentPathForArtifactType(t);
      expect(p, `type ${t}`).not.toMatch(/bmad-/);
    }
  });

  it('DEFAULT_AGENT returns aac-* (no bmad-*)', () => {
    // getAgentPathForArtifactType with an unknown type falls back to DEFAULT_AGENT
    const p = getAgentPathForArtifactType('nonexistent-type');
    expect(p).not.toMatch(/bmad-/);
    expect(p).toMatch(/^aac-/);
  });
});
