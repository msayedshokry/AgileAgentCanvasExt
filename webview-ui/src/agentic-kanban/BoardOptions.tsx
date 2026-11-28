// ─── Board options row ───────────────────────────────────────────────────────
// How the board's agents work, as one row of chips (the way Copilot shows its
// session options): where a card runs, the branch it starts from, how an
// approved card lands, what agents may do, and which agent runs. Each chip
// opens a short list of choices. Values come with the harness status; a
// choice that cannot work here (no git, no GitHub CLI) is shown with why.

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
  /** The checked-out branch. */
  branch?: string;
  /** The branch cards start from; absent means the checked-out one. */
  baseBranch?: string;
  branches: string[];
  isGit: boolean;
  hasGh: boolean;
}

interface Choice<T extends string> {
  value: T;
  label: string;
  hint: string;
  /** Why this choice cannot be picked here. */
  unavailable?: string;
}

const NOT_GIT = 'Needs a git repository. This folder is not one, so agents work in your files.';
const NO_GH = 'Needs the GitHub CLI (gh), which is not installed. Install it from cli.github.com, then reload.';

const isolationChoices = (isGit: boolean): readonly Choice<Isolation>[] => [
  { value: 'worktree', label: 'Own branch', hint: 'Each card gets its own branch and working copy. Your checkout is never touched.', ...(isGit ? {} : { unavailable: NOT_GIT }) },
  { value: 'none', label: 'This checkout', hint: 'Agents edit your files directly. Cards running at once can collide.' },
];

const deliveryChoices = (target: string, hasGh: boolean): readonly Choice<Delivery>[] => [
  { value: 'merge', label: 'Merge', hint: `Approving a card merges its branch into ${target}, without switching your checkout.` },
  { value: 'pr', label: 'Pull request', hint: `Approving a card pushes its branch and opens a pull request into ${target}.`, ...(hasGh ? {} : { unavailable: NO_GH }) },
];

const POSTURE: readonly Choice<Posture>[] = [
  { value: 'sandboxed', label: 'Sandboxed', hint: 'Agents edit workspace files; unrestricted shell is withheld where the agent supports it.' },
  { value: 'full', label: 'Full access', hint: 'Every tool is approved without asking, including shell commands.' },
];

/** The options carried by a `harness:status` message, or null when it has none. */
export function optionsFromStatus(msg: unknown): BoardOptionsState | null {
  const m = msg as Partial<BoardOptionsState> & { type?: string } | null;
  if (m?.type !== 'harness:status') return null;
  const isGit = m.isGit !== false;
  return {
    isolation: m.isolation === 'none' ? 'none' : 'worktree',
    delivery: m.delivery === 'pr' ? 'pr' : 'merge',
    posture: m.posture === 'full' ? 'full' : 'sandboxed',
    ...(typeof m.branch === 'string' && m.branch ? { branch: m.branch } : {}),
    ...(typeof m.baseBranch === 'string' && m.baseBranch ? { baseBranch: m.baseBranch } : {}),
    branches: Array.isArray(m.branches) ? m.branches.filter((b): b is string => typeof b === 'string') : [],
    isGit,
    hasGh: m.hasGh !== false,
  };
}

/** Where cards really run: "Own branch" falls back to the checkout outside git. */
export function effectiveIsolation(state: BoardOptionsState): Isolation {
  return state.isGit ? state.isolation : 'none';
}

interface ChipProps<T extends string> {
  icon: IconName;
  name: string;
  value: T;
  choices: readonly Choice<T>[];
  onPick: (value: T) => void;
  /** Shown on the chip when the current value cannot work here. */
  problem?: string;
  /** Mono label (branch names). */
  mono?: boolean;
  footer?: (close: () => void) => ReactNode;
}

function OptionChip<T extends string>({ icon, name, value, choices, onPick, problem, mono, footer }: ChipProps<T>) {
  const current = choices.find((c) => c.value === value) ?? choices[0];
  return (
    <Popover
      label={<><Icon name={icon} size={14} /><span className={mono ? 'board-option-mono' : undefined}>{current.label}</span>{problem && <span className="board-option-warn" aria-hidden="true">!</span>}</>}
      ariaLabel={`${name}: ${current.label}${problem ? ', needs attention' : ''}`}
      title={problem ?? `${name}: ${current.hint}`}
      triggerClassName={`board-option${problem ? ' board-option--problem' : ''}`}
      align="left"
    >
      {(close) => (
        <div className="board-option-menu" role="menu" aria-label={name}>
          <div className="board-option-menu-title">{name}</div>
          {problem && <p className="board-option-problem" role="alert">{problem}</p>}
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              role="menuitemradio"
              aria-checked={c.value === value}
              disabled={!!c.unavailable && c.value !== value}
              className={`board-option-choice${c.value === value ? ' is-current' : ''}`}
              onClick={() => { close(); if (c.value !== value) onPick(c.value); }}
            >
              <span className="board-option-check" aria-hidden="true">{c.value === value ? '✓' : ''}</span>
              <span className="board-option-text">
                <span className={`board-option-label${mono ? ' board-option-mono' : ''}`}>{c.label}</span>
                <span className="board-option-hint">{c.unavailable ?? c.hint}</span>
              </span>
            </button>
          ))}
          {footer?.(close)}
        </div>
      )}
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

  const saveDefaults = (close: () => void) => (
    <button
      type="button"
      className="board-option-footer"
      onClick={() => { close(); vscode.postMessage({ type: 'harness:saveDefaults' }); }}
      title="New projects start with where cards run, what approving does and the agent you use here. Permissions stay per project."
    >
      Use as my default for new projects
    </button>
  );

  const isolation = state ? effectiveIsolation(state) : 'worktree';
  const target = state?.baseBranch ?? state?.branch ?? 'your current branch';
  const branchChoices: Choice<string>[] = state
    ? [
        { value: '', label: state.branch ?? 'Checked-out branch', hint: 'The branch you have checked out, whichever it is when a card starts.' },
        ...(state.branches ?? []).filter((b) => b !== state.branch).map((b) => ({ value: b, label: b, hint: `Cards start from ${b} and land on it; your checkout stays on ${state.branch ?? 'its branch'}.` })),
      ]
    : [];

  return (
    <div className="board-options" role="toolbar" aria-label="How agents work">
      {state && (
        <>
          <OptionChip icon="split" name="Where cards run" value={isolation} choices={isolationChoices(state.isGit)}
            problem={!state.isGit && state.isolation === 'worktree' ? NOT_GIT : undefined}
            onPick={(next) => set({ isolation: next }, { type: 'harness:setIsolation', isolation: next })}
            footer={saveDefaults} />
          {state.isGit && isolation === 'worktree' && (
            <OptionChip icon="git-branch" name="Cards start from" value={state.baseBranch ?? ''} choices={branchChoices} mono
              onPick={(next) => set({ baseBranch: next || undefined }, { type: 'harness:setBaseBranch', branch: next })} />
          )}
          {state.isGit && isolation === 'none' && state.branch && (
            <span className="board-option board-option--static" title={`Agents work on ${state.branch} in your checkout.`}>
              <Icon name="git-branch" size={14} /><span className="board-option-mono">{state.branch}</span>
            </span>
          )}
          {isolation === 'worktree' && (
            <OptionChip icon="git-pr" name="When you approve" value={state.delivery} choices={deliveryChoices(target, state.hasGh)}
              problem={state.delivery === 'pr' && !state.hasGh ? NO_GH : undefined}
              onPick={(delivery) => set({ delivery }, { type: 'harness:setDelivery', delivery })}
              footer={saveDefaults} />
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
