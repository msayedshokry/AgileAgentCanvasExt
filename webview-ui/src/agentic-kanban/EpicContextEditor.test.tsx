import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const posted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { EpicContextEditor } from './EpicContextEditor';

const deliver = (data: unknown) => act(() => { window.dispatchEvent(new MessageEvent('message', { data })); });

beforeEach(() => { posted.length = 0; });

describe('EpicContextEditor', () => {
  it("loads the epic's context and summarises it", () => {
    render(<EpicContextEditor epicId="E-1" />);
    expect(posted).toContainEqual({ type: 'kanban:getEpicContext', artifactId: 'E-1' });
    deliver({ type: 'kanban:epicContext', artifactId: 'E-1', context: { paths: ['docs/a.md', 'src/'], urls: ['https://x.test'], note: 'n' } });
    expect(screen.getByText('2 files · 1 link · a note')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Files and folders' }) as HTMLTextAreaElement).value).toBe('docs/a.md\nsrc/');
  });

  it('saves only when changed, and shows the error the extension sends back', () => {
    render(<EpicContextEditor epicId="E-1" />);
    deliver({ type: 'kanban:epicContext', artifactId: 'E-1', context: null });
    expect(screen.getByText('None yet')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save context' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Links' }), { target: { value: 'ftp://x' } });
    fireEvent.click(save);
    expect(posted).toContainEqual({ type: 'kanban:saveEpicContext', artifactId: 'E-1', context: { paths: '', urls: 'ftp://x', note: '' } });
    deliver({ type: 'kanban:epicContextError', artifactId: 'E-1', error: 'Link "ftp://x" must start with http:// or https://' });
    expect(screen.getByRole('alert').textContent).toContain('must start with http');
  });

  it('ignores messages about other epics', () => {
    render(<EpicContextEditor epicId="E-1" />);
    deliver({ type: 'kanban:epicContext', artifactId: 'E-2', context: { paths: ['x'], urls: [] } });
    expect(screen.getByText('…')).toBeTruthy();
  });
});
