// ─── Unit tests: kanban-settings ───────────────────────────────────────────────
// Covers: isKanbanAutoAdvanceEnabled reads the runtime override (happy path)
// and getKanbanWipLimits filters to valid column keys (most common error
// path — invalid keys / non-positive ints silently dropped).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { isKanbanAutoAdvanceEnabled, setKanbanAutoAdvance, getKanbanWipLimits } from './kanban-settings';

describe('kanban-settings', () => {
  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockClear();
  });

  afterEach(async () => {
    // Clear the module-level override so it doesn't leak across tests.
    await setKanbanAutoAdvance(false);
  });

  it('happy: setKanbanAutoAdvance stores the override; isKanbanAutoAdvanceEnabled reads it', async () => {
    await setKanbanAutoAdvance(true);
    expect(isKanbanAutoAdvanceEnabled()).toBe(true);
    await setKanbanAutoAdvance(false);
    expect(isKanbanAutoAdvanceEnabled()).toBe(false);
  });

  it('error: getKanbanWipLimits filters out invalid column keys and non-positive values', () => {
    const cfg = { get: vi.fn((_key: string, dflt: unknown) => dflt) };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(cfg as any);
    cfg.get.mockReturnValueOnce({
      'in-progress': 3,        // valid
      'review': 2,             // valid
      'invalid-col': 5,        // bad key → dropped
      'done': -1,              // non-positive → dropped
      'backlog': 'oops',       // not a number → dropped
    });
    const limits = getKanbanWipLimits();
    expect(limits).toEqual({ 'in-progress': 3, 'review': 2 });
  });
});
