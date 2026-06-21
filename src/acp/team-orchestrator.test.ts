import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('team-orchestrator persona IDs', () => {
  it('contains no bmad-* persona identifiers', () => {
    const src = fs.readFileSync(path.join(__dirname, 'team-orchestrator.ts'), 'utf8');
    const hits = src.match(/bmad-agent-[a-z-]+/g) ?? [];
    expect(hits, `found ${hits.length} bmad refs: ${hits.join(', ')}`).toHaveLength(0);
  });
});
