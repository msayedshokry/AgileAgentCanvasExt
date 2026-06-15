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

/** A single cross-artifact pattern detected by the harness engine. */
export interface SystemicPattern {
  policyId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedArtifactIds: string[];
  count: number;
  sampleMessage?: string;
}

/** Payload pushed by the autonomy lifecycle when cross-artifact issues are found. */
export interface SystemicIssue {
  artifactId: string;
  artifactType: string;
  patterns: SystemicPattern[];
}

interface AutonomyBarProps {
  schedulerState: SchedulerStateMessage | null;
  budgetStatus: BudgetStatus | null;
  pendingGoal: ProposedGoal | null;
  onOpenGoalReview: (goal: ProposedGoal) => void;
  /** Cross-artifact systemic issues from the harness engine (issue #4). */
  systemicIssue: SystemicIssue | null;
  /** Dismiss the current systemic-issue banner. */
  onDismissSystemicIssue: () => void;
}

/** Map severity to a rank for finding the max-severity across patterns. */
function severityRank(s: SystemicPattern['severity']): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[s];
}

// ── Component ────────────────────────────────────────────────────────────────

export function AutonomyBar({
  schedulerState,
  budgetStatus,
  pendingGoal,
  onOpenGoalReview,
  systemicIssue,
  onDismissSystemicIssue,
}: AutonomyBarProps) {
  const [goalDraft, setGoalDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);

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

  // ── Max severity across patterns for the banner color ─────────────────
  const maxSeverity: SystemicPattern['severity'] = (() => {
    if (!systemicIssue?.patterns.length) return 'low';
    return systemicIssue.patterns.reduce<SystemicPattern['severity']>(
      (max, p) => severityRank(p.severity) > severityRank(max) ? p.severity : max,
      'low',
    );
  })();

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

      {/* ── Systemic-issue banner (issue #4) ───────────────────────────── */}
      {systemicIssue && systemicIssue.patterns.length > 0 && (
        <div
          className={`autonomy-bar-group autonomy-bar-group--systemic autonomy-bar-systemic--${maxSeverity}`}
        >
          <button
            className="autonomy-bar-systemic-toggle"
            onClick={() => setShowPatterns(p => !p)}
            aria-expanded={showPatterns}
            title="Toggle pattern details"
          >
            <span className="autonomy-bar-systemic-icon">
              {maxSeverity === 'critical' ? '🚨' : maxSeverity === 'high' ? '⚠' : 'ℹ'}
            </span>
            <span className="autonomy-bar-systemic-summary" role="alert">
              {systemicIssue.patterns.length} systemic issue{systemicIssue.patterns.length !== 1 ? 's' : ''} detected
            </span>
            <span className="autonomy-bar-systemic-chevron">
              {showPatterns ? '▾' : '▸'}
            </span>
          </button>
          <button
            className="autonomy-bar-systemic-dismiss"
            onClick={onDismissSystemicIssue}
            title="Dismiss"
            aria-label="Dismiss systemic issue banner"
          >
            ✕
          </button>
          {showPatterns && (
            <div className="autonomy-bar-systemic-patterns">
              {systemicIssue.patterns.map((p, i) => (
                <div key={i} className={`autonomy-bar-systemic-pattern autonomy-bar-systemic-pattern--${p.severity}`}>
                  <span className={`autonomy-bar-systemic-severity autonomy-bar-systemic-severity--${p.severity}`}>
                    {p.severity.toUpperCase()}
                  </span>
                  <span className="autonomy-bar-systemic-policy">{p.policyId}</span>
                  <span className="autonomy-bar-systemic-count">
                    on {p.count} artifact{p.count !== 1 ? 's' : ''}
                  </span>
                  {p.sampleMessage && (
                    <span className="autonomy-bar-systemic-msg" title={p.sampleMessage}>
                      “{p.sampleMessage.length > 80 ? p.sampleMessage.slice(0, 80) + '…' : p.sampleMessage}”
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
