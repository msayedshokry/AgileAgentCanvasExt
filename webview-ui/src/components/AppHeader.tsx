import type { KeyboardEvent, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './AppHeader.css';

/** The two sections of the app: planning artifacts, and agents running them. */
export type AppView = 'plan' | 'agents';

/** The view to open on: the one saved in the webview state, else Plan. */
export function savedView(state: unknown): AppView {
  const saved = (state as { mainView?: unknown } | null | undefined)?.mainView;
  return saved === 'agents' ? 'agents' : 'plan';
}

interface AppHeaderProps {
  view: AppView;
  onViewChange: (view: AppView) => void;
  projectName?: string;
  onSwitchProject?: () => void;
  /** Agents running or queued right now. */
  runningCount: number;
  /** Items in the board's Inbox: questions, approvals, stopped runs. */
  needsYouCount: number;
  /** Global actions shown on the right (model picker, workflows, menu). */
  children?: ReactNode;
}

interface ViewTab {
  view: AppView;
  label: string;
  icon: IconName;
  hint: string;
}

const TABS: readonly ViewTab[] = [
  { view: 'plan', label: 'Plan', icon: 'plan', hint: 'Plan — your product artifacts on the canvas' },
  { view: 'agents', label: 'Agents', icon: 'agent', hint: 'Agents — AI agents work through your stories on the board' },
];

function agentsTabName(running: number, needsYou: number): string {
  const parts = ['Agents'];
  if (running > 0) parts.push(`${running} running`);
  if (needsYou > 0) parts.push(`${needsYou} needs you`);
  return parts.join(', ');
}

/** Top bar: project, the Plan | Agents switch, and global actions. */
export function AppHeader({ view, onViewChange, projectName, onSwitchProject, runningCount, needsYouCount, children }: AppHeaderProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.view === view);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = TABS[(index + step + TABS.length) % TABS.length];
    onViewChange(next.view);
    // Keep focus on the newly selected tab (roving tabindex).
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[TABS.indexOf(next)]?.focus();
  };

  return (
    <header className="app-header">
      {onSwitchProject && (
        <button
          type="button"
          className="app-header-project"
          onClick={onSwitchProject}
          title={projectName ? `Project folder: ${projectName} — click to switch` : 'Switch or browse project folder'}
        >
          <Icon name="folder" size={14} />
          <span className="app-header-project-name">{projectName || 'Choose folder'}</span>
          <Icon name="chevron-down" size={12} />
        </button>
      )}

      <div className="view-switch" role="tablist" aria-label="Views">
        {TABS.map((tab) => {
          const selected = tab.view === view;
          const isAgents = tab.view === 'agents';
          return (
            <button
              key={tab.view}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              aria-label={isAgents ? agentsTabName(runningCount, needsYouCount) : tab.label}
              title={tab.hint}
              className={`view-switch-tab view-switch-tab--${tab.view}${selected ? ' is-selected' : ''}`}
              onClick={() => onViewChange(tab.view)}
              onKeyDown={handleKeyDown}
            >
              <Icon name={tab.icon} size={15} />
              <span className="view-switch-label">{tab.label}</span>
              {isAgents && runningCount > 0 && <span className="view-switch-live" aria-hidden="true" />}
              {isAgents && needsYouCount > 0 && (
                <span className="view-switch-count" aria-hidden="true">{needsYouCount}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="app-header-actions">{children}</div>
    </header>
  );
}
