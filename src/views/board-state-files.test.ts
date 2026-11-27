import { describe, it, expect } from 'vitest';
import { isBoardStateFile } from './board-state-files';

describe('isBoardStateFile', () => {
  it("treats the board's own state as not an artifact change", () => {
    expect(isBoardStateFile('C:\\p\\.agileagentcanvas-context\\terminal-sessions.json')).toBe(true);
    expect(isBoardStateFile('/p/.agileagentcanvas-context/_terminal-output/prompts/S-1.mcp.json')).toBe(true);
    expect(isBoardStateFile('/p/.agileagentcanvas-context/.autopilot-claims/a.json')).toBe(true);
    expect(isBoardStateFile('/p/.agileagentcanvas-context/agent-team.json')).toBe(true);
  });

  it('still reports changes to artifacts', () => {
    expect(isBoardStateFile('/p/.agileagentcanvas-context/planning/epics.json')).toBe(false);
    expect(isBoardStateFile('/p/.agileagentcanvas-context/epics/epic-1/stories/S-1.1.json')).toBe(false);
    expect(isBoardStateFile('/p/.agileagentcanvas-context/vision.json')).toBe(false);
  });
});
