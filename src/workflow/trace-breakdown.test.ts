// ─── Regression tests: isBreakdownMessage defensive type-guard (audit gap #20/#42 follow-up) ──
// Bumps coverage on the row-shape predicate that landed when the standalone
// `isBreakdownRow` export was removed — it now lives inside `isBreakdownMessage`'s
// `perWorkflow.every(...)` callback as an inline arrow predicate.
//
// Placed in `src/workflow/` because `vitest.config.ts` limits `include` to
// `src/workflow/`, `src/acp/`, and `src/views/`. The code under test lives
// at `src/types/trace-breakdown.ts`; this mirrors the precedent set by
// `schema-validator.test.ts` (see its L1-L4 header comment) for testing
// shared state/types helpers from a downstream test directory.

import { describe, it, expect } from 'vitest';
import {
  isBreakdownMessage,
  UNTAGGED_BUCKET,
  type TraceBreakdownMessage,
  type TraceBreakdownRow,
} from '../types/trace-breakdown';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeValidRow(overrides: Partial<TraceBreakdownRow> = {}): TraceBreakdownRow {
  return {
    workflow: 'dev-story',
    toolCallCount: 3,
    errorCount: 0,
    distinctTools: ['read_file', 'edit_file'],
    totalEntries: 5,
    ...overrides,
  };
}

function makeValidMessage(
  overrides: Partial<TraceBreakdownMessage> = {},
): TraceBreakdownMessage {
  return {
    type: 'traceBreakdownResponse',
    workflowName: 'dev-story',
    startedAt: '2025-01-01T00:00:00Z',
    endedAt: '2025-01-01T00:10:00Z',
    isRunning: false,
    totalEntries: 10,
    totalToolCalls: 5,
    totalErrors: 1,
    perWorkflow: [makeValidRow()],
    ...overrides,
  };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('isBreakdownMessage — happy path', () => {
  it('returns true for a fully-valid message with valid rows', () => {
    expect(isBreakdownMessage(makeValidMessage())).toBe(true);
  });

  it('returns true for a valid message with an empty perWorkflow array', () => {
    expect(isBreakdownMessage(makeValidMessage({ perWorkflow: [] }))).toBe(true);
  });

  it('returns true when isRunning=true and endedAt=null (mid-run shape)', () => {
    expect(
      isBreakdownMessage(makeValidMessage({ isRunning: true, endedAt: null })),
    ).toBe(true);
  });

  it('returns true when a row uses UNTAGGED_BUCKET as the workflow label', () => {
    expect(
      isBreakdownMessage(
        makeValidMessage({
          perWorkflow: [makeValidRow({ workflow: UNTAGGED_BUCKET })],
        }),
      ),
    ).toBe(true);
  });
});

// ─── Non-object input ─────────────────────────────────────────────────────────

describe('isBreakdownMessage — rejects non-object input', () => {
  it.each<[string, unknown]>([
    ['null',         null],
    ['undefined',    undefined],
    ['empty string', ''],
    ['a number',     42],
    ['a boolean',    true],
    ['an array',     []],
  ])('returns false when value is %s', (_label, value) => {
    expect(isBreakdownMessage(value)).toBe(false);
  });
});

// ─── Type discriminator ───────────────────────────────────────────────────────

describe('isBreakdownMessage — type discriminator', () => {
  it('returns false when the type discriminator is missing', () => {
    expect(
      isBreakdownMessage({
        ...makeValidMessage(),
        type: undefined as unknown as 'traceBreakdownResponse',
      }),
    ).toBe(false);
  });

  it('returns false when the type discriminator is the wrong literal', () => {
    expect(
      isBreakdownMessage(
        makeValidMessage({
          type: 'somethingElse' as unknown as 'traceBreakdownResponse',
        }),
      ),
    ).toBe(false);
  });
});

// ─── Top-level field types ────────────────────────────────────────────────────

describe('isBreakdownMessage — top-level field types', () => {
  it.each([
    ['workflowName not a string',   { workflowName: 42 }],
    ['startedAt not a string',      { startedAt: 1234567890 }],
    ['endedAt not a string or null',{ endedAt: 1234567890 }],
    ['isRunning not a boolean',     { isRunning: 'yes' }],
    ['totalEntries not a number',   { totalEntries: '10' }],
    ['totalToolCalls not a number', { totalToolCalls: '5' }],
    ['totalErrors not a number',    { totalErrors: '1' }],
  ])('returns false when %s', (_label, override) => {
    expect(isBreakdownMessage({ ...makeValidMessage(), ...override })).toBe(false);
  });
});

// ─── perWorkflow must be an array ─────────────────────────────────────────────

describe('isBreakdownMessage — perWorkflow must be an array', () => {
  it.each<[string, unknown]>([
    ['null',        null],
    ['an object',   { workflow: 'x', toolCallCount: 1 }],
    ['a primitive', '[]'],
    ['a number',    42],
  ])('returns false when perWorkflow is %s', (_label, perWorkflow) => {
    expect(
      isBreakdownMessage(
        makeValidMessage({ perWorkflow: perWorkflow as TraceBreakdownRow[] }),
      ),
    ).toBe(false);
  });
});

// ─── Per-workflow row shape (inlined predicate, audit-gap #20 follow-up) ──────
//
// All `as unknown as TraceBreakdownRow` casts inside this block are intentional:
// the tests below deliberately feed the guard malformed rows to verify it
// rejects them. The casts satisfy tsc strict mode (which would otherwise block
// `badRow: unknown` and structurally-malformed spread overrides from flowing
// into the `Partial<TraceBreakdownMessage>` factory signature) without
// compromising the runtime shape that `isBreakdownMessage` is being asked to
// validate.

describe('isBreakdownMessage — per-workflow row shape (inlined predicate)', () => {
  describe('rejects non-object rows', () => {
    it.each<[string, unknown]>([
      ['null',                null],
      ['a primitive string',  'oops'],
      ['a number',            42],
      ['undefined',           undefined],
      ['a bare array',        []],
    ])('returns false when a row is %s', (_label, badRow) => {
      expect(
        isBreakdownMessage(
          makeValidMessage({
            perWorkflow: [badRow as unknown as TraceBreakdownRow],
          }),
        ),
      ).toBe(false);
    });
  });

  describe('rejects malformed object rows', () => {
    it.each([
      ['missing workflow',                   { workflow: undefined }],
      ['non-string workflow',                { workflow: 42 }],
      ['missing toolCallCount',              { toolCallCount: undefined }],
      ['non-number toolCallCount',           { toolCallCount: '5' }],
      ['missing errorCount',                 { errorCount: undefined }],
      ['non-number errorCount',              { errorCount: false }],
      ['non-array distinctTools',            { distinctTools: '[]' }],
      // inlined predicate's unique inner-loop sub-check: distinctTools.every((t) => typeof t === 'string')
      ['non-string element in distinctTools',{ distinctTools: ['read_file', 42, 'edit_file'] }],
      ['all-non-string distinctTools',       { distinctTools: [1, 2, 3] }],
      ['missing totalEntries',               { totalEntries: undefined }],
      ['non-number totalEntries',            { totalEntries: '5' }],
    ])('returns false when row has %s', (_label, override) => {
      const m = makeValidMessage({
        perWorkflow: [
          { ...makeValidRow(), ...override } as unknown as TraceBreakdownRow,
        ],
      });
      expect(isBreakdownMessage(m)).toBe(false);
    });
  });
});
