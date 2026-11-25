import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const posted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { FollowUpComposer } from './FollowUpComposer';

const deliver = (data: unknown) => act(() => { window.dispatchEvent(new MessageEvent('message', { data })); });

beforeEach(() => { posted.length = 0; });

describe('FollowUpComposer', () => {
  it('sends a trimmed message and clears the box', () => {
    render(<FollowUpComposer artifactId="S-1" isRunning={false} />);
    const box = screen.getByRole('textbox', { name: 'Message to the agent' }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '  also handle empty passwords ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(posted).toEqual([{ type: 'kanban:followUp', artifactId: 'S-1', text: 'also handle empty passwords' }]);
    expect(box.value).toBe('');
  });

  it('sends with Ctrl+Enter and never sends an empty message', () => {
    render(<FollowUpComposer artifactId="S-1" isRunning={false} />);
    const box = screen.getByRole('textbox', { name: 'Message to the agent' });
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(posted).toEqual([]);
    fireEvent.change(box, { target: { value: 'go' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(posted).toHaveLength(1);
  });

  it('explains that a message to a running agent waits for the run to end', () => {
    render(<FollowUpComposer artifactId="S-1" isRunning />);
    expect(screen.getByRole('button', { name: 'Queue' })).toBeTruthy();
    expect(screen.getByText(/sent when this run ends/)).toBeTruthy();
    deliver({ type: 'kanban:followUpQueued', artifactId: 'S-1', pending: 2 });
    expect(screen.getByText('2 messages waiting — sent when this run ends')).toBeTruthy();
    deliver({ type: 'kanban:followUpSent', artifactId: 'OTHER', count: 1 });
    expect(screen.getByText('2 messages waiting — sent when this run ends')).toBeTruthy();
    deliver({ type: 'kanban:followUpSent', artifactId: 'S-1', count: 2 });
    expect(screen.getByText(/^Sent\./)).toBeTruthy();
  });
});
