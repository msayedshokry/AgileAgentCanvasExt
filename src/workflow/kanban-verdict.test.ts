// ─── Unit tests: kanban-verdict ────────────────────────────────────────────────
// Covers: normalizeVerdict accepts the agent schema and maps to KanbanVerdict
// (happy path) and falls back to UNKNOWN for invalid verdicts (most common
// error path).

import { describe, it, expect } from 'vitest';
import { normalizeVerdict, extractVerdictFromText, sanitizeId } from './kanban-verdict';

describe('kanban-verdict', () => {
  it('happy: normalizeVerdict maps verdict + fix_requests from the agent schema', () => {
    const parsed = {
      verdict: 'NEEDS_FIXES',
      fix_requests: [{ failing_criterion: 'AC-1', minimal_change: 'rename x to y' }],
      summary: '3 of 5 criteria failed',
    };
    const v = normalizeVerdict(parsed);
    expect(v.verdict).toBe('NEEDS_FIXES');
    expect(v.fixRequests).toHaveLength(1);
    expect(v.fixRequests![0].failing_criterion).toBe('AC-1');
    expect(v.summary).toBe('3 of 5 criteria failed');
  });

  it('error: invalid verdict string falls back to UNKNOWN', () => {
    const v = normalizeVerdict({ verdict: 'banana' });
    expect(v.verdict).toBe('UNKNOWN');
  });

  it('extractVerdictFromText returns the last JSON object containing "verdict"', () => {
    const text = 'some preamble {"foo": 1} more text\n```json\n{"verdict": "APPROVED", "summary": "all good"}\n```';
    const v = extractVerdictFromText(text);
    expect(v?.verdict).toBe('APPROVED');
    expect(v?.summary).toBe('all good');
  });

  it('sanitizeId replaces path-unsafe chars and collapses dashes', () => {
    expect(sanitizeId('foo/bar baz!')).toBe('foo-bar-baz');
    expect(sanitizeId('a---b')).toBe('a-b');
  });
});
