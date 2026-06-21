import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TerminalGrid } from './TerminalGrid';

vi.mock('./AgentTerminal', () => ({
  AgentTerminal: ({ sessionId }: { sessionId: string }) => <div data-testid="term" data-sid={sessionId} />,
}));

beforeEach(() => cleanup());

describe('TerminalGrid', () => {
  const sessions = [
    { sessionId: 'a1', title: 'Story A', agentRole: 'Crafter', statusKey: 'running' },
    { sessionId: 'a2', title: 'Story B', agentRole: 'Reviewer', statusKey: 'running' },
  ];
  it('renders one AgentTerminal tile per running session', () => {
    render(<TerminalGrid sessions={sessions} />);
    const tiles = screen.getAllByTestId('term');
    expect(tiles.map(t => t.getAttribute('data-sid'))).toEqual(['a1', 'a2']);
  });
  it('renders an empty state when there are no sessions', () => {
    render(<TerminalGrid sessions={[]} />);
    expect(screen.getByText(/no active agents/i)).toBeTruthy();
  });
});
