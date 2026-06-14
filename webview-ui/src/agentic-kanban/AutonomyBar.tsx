import { useState } from 'react';
import { vscode } from '../vscodeApi';
import { useEvent } from './useEvent';

// ── Types (mirrored from extension/src/workflow/*) ───────────────────────────
// Kept in sync via IPC; the extension is the source of truth.

export type SchedulerState = 'idle' | 'paused' | 'running';

export interface SchedulerStateMessage {
  state: SchedulerState;
  nextUp: string | null;
  inProgress: string[];
  enabled: boolean;
}

export interface BudgetStatus {
  perStory: { used: number; cap: number; exceeded: boolean };
  daily: { used: number; cap: number; exceeded: boolean };
  anyExceeded: boolean;
  bannerMessage: string | null;
  remaining: number;
}

export interface ProposedGoal {
  id: string;
  goal: string;
  status: 'pending' | 'decomposing' | 'review' | 'approved' | 'rejected' | 'dispatched';
  proposedStories: Array<{ id: string; title: string; description?: string; priority?: string }>;
  approvedStories: Array<{ id: string; title: string }>;
}

interface AutonomyBarProps {
  schedulerState: SchedulerStateMessage | null;
  budgetStatus: BudgetStatus | null;
  pendingGoal: ProposedGoal | null;
  onOpenGoalReview: (goal: ProposedGoal) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AutonomyBar({
  schedulerState,
  budgetStatus,
  pendingGoal,
  onOpenGoalReview,
}: AutonomyBarProps) {
  const [goalDraft, setGoalDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Scheduler controls ──────────────────────────────────────────────────
  const handlePause = useEvent(() => {
    vscode.postMessage({ type: 'setSchedulerState', state: { action: 'pause' } });
  });
  const handleResume = useEvent(() => {
    vscode.postMessage({ type: 'setSchedulerState', state: { action: 'resume' } });
  });
  const handleStop = useEvent(() => {
    vscode.postMessage({ type: 'setSchedulerState', state: { action: 'stop' } });
  });
  const handleToggle = useEvent(() => {
    vscode.postMessage({ type: 'setSchedulerState', state: { action: 'toggle' } });
  });

  // ── Budget refresh (pull on mount + on demand) ──────────────────────────
  const handleRefreshBudget = useEvent(() => {
    vscode.postMessage({ type: 'getBudgetStatus' });
  });

  // ── Goal submission ─────────────────────────────────────────────────────
  const handleSubmitGoal = useEvent(() => {
    const text = goalDraft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    vscode.postMessage({ type: 'submitGoal', text });
    setGoalDraft('');
    // Brief cooldown to prevent double-submit if the broadcast lags
    setTimeout(() => setSubmitting(false), 1000);
  });

  const handleGoalKeyDown = useEvent((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitGoal();
    }
  });

  // ── Derived display values ──────────────────────────────────────────────
  const state: SchedulerState = schedulerState?.state ?? 'idle';
  const isRunning = state === 'running';
  const isPaused = state === 'paused';
  const isIdle = state === 'idle';

  // Budget: prefer backend gauge string for consistency with extension
  const dailyUsed = budgetStatus?.daily.used ?? 0;
  const dailyCap = budgetStatus?.daily.cap ?? 0;
  const budgetExceeded = budgetStatus?.anyExceeded ?? false;
  const budgetPct = dailyCap > 0 ? Math.min(100, Math.round((dailyUsed / dailyCap) * 100)) : 0;

  return (
    <div className="autonomy-bar">
      {/* ── Scheduler controls ─────────────────────────────────────────── */}
      <div className="autonomy-bar-group autonomy-bar-group--scheduler">
        <span className="autonomy-bar-label">Scheduler:</span>
        <span className={`autonomy-bar-state autonomy-bar-state--${state}`}>
          {isIdle ? '● idle' : isPaused ? '⏸ paused' : '▶ running'}
        </span>
        {isRunning && (
          <button className="autonomy-bar-btn" onClick={handlePause} title="Pause scheduler">
            ⏸ Pause
          </button>
        )}
        {isPaused && (
          <button className="autonomy-bar-btn" onClick={handleResume} title="Resume scheduler">
            ▶ Resume
          </button>
        )}
        {isIdle && (
          <button className="autonomy-bar-btn" onClick={handleResume} title="Start scheduler">
            ▶ Start
          </button>
        )}
        {!isIdle && (
          <button className="autonomy-bar-btn autonomy-bar-btn--toggle" onClick={handleToggle} title="Toggle pause/resume">
            ⇄
          </button>
        )}
        {!isIdle && (
          <button className="autonomy-bar-btn autonomy-bar-btn--danger" onClick={handleStop} title="Stop scheduler">
            ⏹ Stop
          </button>
        )}
        {schedulerState && schedulerState.inProgress.length > 0 && (
          <span className="autonomy-bar-meta" title="Workflows currently in progress">
            {schedulerState.inProgress.length} running
          </span>
        )}
      </div>

      {/* ── Budget gauge ───────────────────────────────────────────────── */}
      <div className="autonomy-bar-group autonomy-bar-group--budget">
        <span className="autonomy-bar-label">Budget:</span>
        {dailyCap > 0 ? (
          <>
            <div
              className={`autonomy-bar-gauge${budgetExceeded ? ' autonomy-bar-gauge--exceeded' : ''}`}
              title={budgetStatus?.bannerMessage ?? `Daily spend $${dailyUsed.toFixed(4)} of $${dailyCap.toFixed(2)} cap`}
            >
              <div
                className="autonomy-bar-gauge-fill"
                style={{ width: `${budgetPct}%` }}
              />
              <span className="autonomy-bar-gauge-text">
                ${dailyUsed.toFixed(4)} / ${dailyCap.toFixed(2)} ({budgetPct}%)
              </span>
            </div>
            {budgetExceeded && (
              <span className="autonomy-bar-warn" title={budgetStatus?.bannerMessage ?? 'Budget cap exceeded'}>
                ⚠ Cap hit
              </span>
            )}
          </>
        ) : (
          <span className="autonomy-bar-meta">No daily cap set</span>
        )}
        <button className="autonomy-bar-btn-icon" onClick={handleRefreshBudget} title="Refresh budget status">
          ↻
        </button>
      </div>

      {/* ── Goal submission ────────────────────────────────────────────── */}
      <div className="autonomy-bar-group autonomy-bar-group--goal">
        <input
          className="autonomy-bar-goal-input"
          type="text"
          placeholder="Describe a goal to decompose into stories…"
          value={goalDraft}
          onChange={e => setGoalDraft(e.target.value)}
          onKeyDown={handleGoalKeyDown}
          disabled={submitting}
          aria-label="Goal text"
        />
        <button
          className="autonomy-bar-btn autonomy-bar-btn--primary"
          onClick={handleSubmitGoal}
          disabled={!goalDraft.trim() || submitting}
          title="Submit goal for decomposition"
        >
          {submitting ? '⟳ Submitting…' : '🎯 Submit Goal'}
        </button>
        {pendingGoal && (
          <button
            className="autonomy-bar-btn autonomy-bar-btn--accent"
            onClick={() => onOpenGoalReview(pendingGoal)}
            title={`Review ${pendingGoal.proposedStories.length} proposed story(s) for goal "${pendingGoal.goal.slice(0, 40)}…"`}
          >
            📋 Review ({pendingGoal.proposedStories.length})
          </button>
        )}
      </div>
    </div>
  );
}
