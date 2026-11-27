/**
 * The header's Plan | Agents switch: reachable, remembered, and live.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { mockVsCodeApi } from '@test/setup';

const dispatchMessage = (type: string, data: Record<string, unknown> = {}) => {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { type, ...data } }));
  });
};

describe('App header', () => {
  it('opens on the Canvas the first time', () => {
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Add artifact' })).toBeInTheDocument();
  });

  it('remembers the Agents board as the last view', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /^Agents/ }));
    expect(mockVsCodeApi.setState).toHaveBeenCalledWith(expect.objectContaining({ mainView: 'agents' }));
    // The plan-only actions leave with the Canvas.
    expect(screen.queryByRole('button', { name: 'Add artifact' })).not.toBeInTheDocument();
  });

  it('reopens on the Agents board when that was the last view', () => {
    mockVsCodeApi.getState.mockReturnValue({ mainView: 'agents' });
    render(<App />);
    expect(screen.getByRole('tab', { name: /^Agents/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('asks for the Inbox on start and shows running agents and what needs you', () => {
    render(<App />);
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'kanban:getInbox' });

    dispatchMessage('agentStateUpdated', { artifactId: 'S-1', agentState: { status: 'running' } });
    dispatchMessage('agentStateUpdated', { artifactId: 'S-2', agentState: { status: 'completed' } });
    dispatchMessage('kanban:inbox', { items: [{ artifactId: 'S-3' }, { artifactId: 'S-4' }] });

    expect(screen.getByRole('tab', { name: 'Agents, 1 running, 2 needs you' })).toBeInTheDocument();
  });

  it('opens the Agents board when the status bar focuses a card', () => {
    render(<App />);
    dispatchMessage('kanban:focusCard', { artifactId: 'S-1' });
    expect(screen.getByRole('tab', { name: /^Agents/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps Model, Workflows and the ⋯ menu in the header on both views', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /^Agents/ }));
    expect(screen.getByRole('button', { name: 'Launch Workflow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });
});
