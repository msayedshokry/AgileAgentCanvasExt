import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppHeader, savedView } from './AppHeader';

function setup(overrides: Partial<Parameters<typeof AppHeader>[0]> = {}) {
  const onViewChange = vi.fn();
  const onSwitchProject = vi.fn();
  render(
    <AppHeader
      view="plan"
      onViewChange={onViewChange}
      projectName="taskflow-live"
      onSwitchProject={onSwitchProject}
      runningCount={0}
      needsYouCount={0}
      {...overrides}
    >
      <button type="button">Workflows</button>
    </AppHeader>,
  );
  return { onViewChange, onSwitchProject };
}

describe('AppHeader', () => {
  it('names both sections as tabs and marks the current one', () => {
    setup({ view: 'agents' });
    expect(screen.getByRole('tablist', { name: 'Views' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Plan/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /Agents/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to the agentic board when Agents is clicked', () => {
    const { onViewChange } = setup();
    fireEvent.click(screen.getByRole('tab', { name: /Agents/ }));
    expect(onViewChange).toHaveBeenCalledWith('agents');
  });

  it('moves between tabs with the arrow keys', () => {
    const { onViewChange } = setup();
    fireEvent.keyDown(screen.getByRole('tab', { name: /Plan/ }), { key: 'ArrowRight' });
    expect(onViewChange).toHaveBeenCalledWith('agents');
  });

  it('says how many agents are running and how many need you', () => {
    setup({ runningCount: 2, needsYouCount: 1 });
    expect(screen.getByRole('tab', { name: 'Agents, 2 running, 1 needs you' })).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('keeps the Agents tab name plain when nothing is happening', () => {
    setup();
    expect(screen.getByRole('tab', { name: 'Agents' })).toBeInTheDocument();
  });

  it('shows the project and opens the folder picker from it', () => {
    const { onSwitchProject } = setup();
    fireEvent.click(screen.getByRole('button', { name: /taskflow-live/ }));
    expect(onSwitchProject).toHaveBeenCalled();
  });

  it('renders the actions it is given on the right', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
  });
});

describe('savedView', () => {
  it('reopens the Agents board when it was the last view', () => {
    expect(savedView({ mainView: 'agents', themeOverride: 'dark' })).toBe('agents');
  });

  it.each([undefined, null, {}, { mainView: 'kanban' }])('opens the Canvas for %j', (state) => {
    expect(savedView(state)).toBe('plan');
  });
});
