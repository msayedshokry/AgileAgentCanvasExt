// ─── Board options row ───────────────────────────────────────────────────────
// How the board's agents work, as one row of chips (the way Copilot shows its
// session options): where a card runs, the branch it starts from, how an
// approved card lands, what agents may do, and which agent runs. Each chip
// opens a short list of choices. Values come with the harness status.

import { useEffect, useState, type ReactNode } from 'react';
import { vscode } from '../vscodeApi';
import { Icon, type IconName } from '../components/Icon';
import { Popover } from './Popover';
import { AgentStatusBar } from './AgentStatusBar';
import './BoardOptions.css';

type Isolation = 'worktree' | 'none';
type Delivery = 'merge' | 'pr';
type Posture = 'sandboxed' | 'full';

export interface BoardOptionsState {
  isolation: Isolation;
  delivery: Delivery;
  posture: Posture;
  branch?: string;
}

interface Choice<T extends string> {
  value: T;
  label: string;
  hint: string;
}

const ISOLATION: readonly Choice<Isolation>[] = [
  { value: 'worktree', label: 'Own branch', hint: 'Each card gets its own branch and working copy. Your checkout is never touched.' },
  { value: 'none', label: 'This checkout', hint: 'Agents edit your files directly. Cards running at once can collide.' },
];

const deliveryChoices = (branch?: string): readonly Choice<Delivery>[] => [
  { value: 'merge', label: 'Merge', hint: `Approving a card merges its branch into ${branch ?? 'your current branch'}.` },
  { value: 'pr', label: 'Pull request', hint: 'Approving a card pushes its branch and opens a pull request (needs the GitHub CLI).' },
];

const POSTURE: readonly Choice<Posture>[] = [
  { value: 'sandboxed', label: 'Sandboxed', hint: 'Agents edit workspace files; unrestricted shell is withheld where the agent supports it.' },
  { value: 'full', label: 'Full access', hint: 'Every tool is approved without asking, including shell commands.' },
];

/** The options carried by a `harness:status` message, or null when it has none. */
export function optionsFromStatus(msg: unknown): BoardOptionsState | null {
  const m = msg as Partial<BoardOptionsState> & { type?: string } | null;
  if (m?.type !== 'harness:status') return null;
  return {
    isolation: m.isolation === 'none' ? 'none' : 'worktree',
    delivery: m.delivery === 'pr' ? 'pr' : 'merge',
    posture: m.posture === 'full' ? 'full' : 'sandboxed',
    ...(typeof m.branch === 'string' && m.branch ? { branch: m.branch } : {}),
  };
}

interface ChipProps<T extends string> {
  icon: IconName;
  name: string;
  value: T;
  choices: readonly Choice<T>[];
  onPick: (value: T) => void;
}

function OptionChip<T extends string>({ icon, name, value, choices, onPick }: ChipProps<T>) {
  const current = choices.find((c) => c.value === value) ?? choices[0];
  return (
    <Popover
      label={<><Icon name={icon} size={14} /><span>{current.label}</span></>}
      ariaLabel={`${name}: ${current.label}`}
      title={`${name}: ${current.hint}`}
      triggerClassName="board-option"
      align="left"
    >
      {(close) => (
        <div className="board-option-menu" role="menu" aria-label={name}>
          <div className="board-option-menu-title">{name}</div>
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              role="menuitemradio"
              aria-checked={c.value === value}
              className={`board-option-choice${c.value === value ? ' is-current' : ''}`}
              onClick={() => { close(); if (c.value !== value) onPick(c.value); }}
            >
              <span className="board-option-check" aria-hidden="true">{c.value === value ? '✓' : ''}</span>
              <span className="board-option-text">
                <span className="board-option-label">{c.label}</span>
                <span className="board-option-hint">{c.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function BranchChip({ branch, isolation }: { branch: string; isolation: Isolation }) {
  const note = isolation === 'worktree'
    ? `Cards branch from ${branch} and come back to it.`
    : `Agents work on ${branch} in your checkout.`;
  return (
    <Popover
      label={<><Icon name="git-branch" size={14} /><span className="board-option-branch">{branch}</span></>}
      ariaLabel={`Branch: ${branch}`}
      title={note}
      triggerClassName="board-option"
      align="left"
    >
      <div className="board-option-menu">
        <div className="board-option-menu-title">Branch</div>
        <p className="board-option-note">{note} Switch branches in VS Code's Source Control.</p>
      </div>
    </Popover>
  );
}

/** The row of option chips; `children` are extra chips (e.g. Autopilot) at the end. */
export function BoardOptions({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<BoardOptionsState | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const next = optionsFromStatus(event.data);
      if (next) setState(next);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const set = (patch: Partial<BoardOptionsState>, message: Record<string, unknown>) => {
    setState((s) => (s ? { ...s, ...patch } : s));
    vscode.postMessage(message);
  };

  return (
    <div className="board-options" role="toolbar" aria-label="How agents work">
      {state && (
        <>
          <OptionChip icon="split" name="Where cards run" value={state.isolation} choices={ISOLATION}
            onPick={(isolation) => set({ isolation }, { type: 'harness:setIsolation', isolation })} />
          {state.branch && <BranchChip branch={state.branch} isolation={state.isolation} />}
          {state.isolation === 'worktree' && (
            <OptionChip icon="git-pr" name="When you approve" value={state.delivery} choices={deliveryChoices(state.branch)}
              onPick={(delivery) => set({ delivery }, { type: 'harness:setDelivery', delivery })} />
          )}
          <OptionChip icon="shield" name="Permissions" value={state.posture} choices={POSTURE}
            onPick={(posture) => set({ posture }, { type: 'harness:setPosture', posture })} />
        </>
      )}
      <AgentStatusBar compact />
      {children}
    </div>
  );
}
