import { useState, useEffect, useMemo, useRef } from 'react';
import { vscode } from '../vscodeApi';
import { useEvent } from './useEvent';
import type { ApprovalRequest } from './ApprovalBanner';

// ── Types (mirrored from extension/src/workflow/*) ───────────────────────────
// Kept in sync via IPC; the extension is the source of truth.

export type SchedulerState = 'idle' | 'paused' | 'running';

/** P1 #6: User-facing display state for the continuous-mode contract. */
export type DisplayState = 'idle' | 'running' | 'waiting-on-human' | 'blocked';

export interface SchedulerStateMessage {
  state: SchedulerState;
  /** P1 #6: User-facing display state. */
  displayState: DisplayState;
  /** P1 #6: why the scheduler last paused (for tooltip/details). */
  pauseReason?: string;
  nextUp: string | null;
  inProgress: string[];
  enabled: boolean;
  /** Audit gap #50 — stories paused at the user's request. */
  pausedStories: Array<{ id: string; reason?: string; pausedAt: number }>;
  /** P1 #6: whether continuous mode is currently toggled on. */
  continuousMode: boolean;
}

/** Per-workflow cost breakdown row (mirrored from src/workflow/budget-enforcer.ts). */
export interface WorkflowCostRow {
  workflow: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface BudgetStatus {
  perStory: { used: number; cap: number; exceeded: boolean };
  daily: { used: number; cap: number; exceeded: boolean };
  anyExceeded: boolean;
  bannerMessage: string | null;
  remaining: number;
  /** Per-workflow subtotals since midnight UTC, sorted by cost DESC. */
  workflowBreakdown: WorkflowCostRow[];
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

// ── P1 #7: Inbox item — each entry is something the OS can't resolve alone ──

export type InboxItemType = 'approval' | 'budget' | 'circuit' | 'systemic' | 'queue-empty';
export type InboxSeverity = 'info' | 'warning' | 'critical';

export interface InboxItem {
  type: InboxItemType;
  severity: InboxSeverity;
  title: string;
  detail?: string;
  artifactId?: string;
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
  /** P1 #7: active approval request (null = no pending approval). */
  approvalRequest?: ApprovalRequest | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map severity to a rank for finding the max-severity across patterns. */
function severityRank(s: SystemicPattern['severity']): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[s];
}

// ── Display-state labels + colors ────────────────────────────────────────────

const DISPLAY_STATE_CONFIG: Record<DisplayState, { label: string; className: string; icon: string }> = {
  idle:              { label: '● Idle',              className: 'autonomy-display--idle',              icon: '●' },
  running:           { label: '▶ Running',           className: 'autonomy-display--running',           icon: '▶' },
  'waiting-on-human':{ label: '🛑 Needs You',        className: 'autonomy-display--waiting',           icon: '🛑' },
  blocked:           { label: '⛔ Blocked',           className: 'autonomy-display--blocked',           icon: '⛔' },
};

/** Human-friendly label for pause reasons shown in tooltip. */
function pauseReasonLabel(reason?: string): string {
  switch (reason) {
    case 'budget':        return 'Paused — daily budget cap hit. Increase cap or wait for reset.';
    case 'circuit':       return 'Paused — circuit breaker open. Resume manually after investigation.';
    case 'approval':      return 'Paused — approval required for the next step.';
    case 'queue-empty':   return 'Paused — no eligible stories left. Add stories or adjust WIP.';
    default:              return reason ? `Paused — ${reason}.` : '';
  }
}

// ── Inbox item icons ─────────────────────────────────────────────────────────

const INBOX_ICONS: Record<InboxItemType, string> = {
  approval:     '🛡',
  budget:       '💰',
  circuit:      '⚡',
  systemic:     '🔬',
  'queue-empty':'📭',
};

const INBOX_SEVERITY_CLASS: Record<InboxSeverity, string> = {
  info:     'inbox-item--info',
  warning:  'inbox-item--warning',
  critical: 'inbox-item--critical',
};

// ── Component ────────────────────────────────────────────────────────────────

export function AutonomyBar({
  schedulerState,
  budgetStatus,
  pendingGoal,
  onOpenGoalReview,
  systemicIssue,
  onDismissSystemicIssue,
  approvalRequest = null,
}: AutonomyBarProps) {
  const [goalDraft, setGoalDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);

  // ── P1 #7: Inbox dropdown open/close ────────────────────────────────────
  const [inboxOpen, setInboxOpen] = useState(false);
  const inboxRef = useRef<HTMLDivElement>(null);

  // Close inbox on outside click
  useEffect(() => {
    if (!inboxOpen) return;
    const handler = (e: MouseEvent) => {
      if (inboxRef.current && !inboxRef.current.contains(e.target as Node)) {
        setInboxOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inboxOpen]);

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

  // ── P1 #6: Continuous Mode toggle ───────────────────────────────────────
  const continuousMode = schedulerState?.continuousMode ?? false;
  const handleContinuousModeToggle = useEvent(() => {
    vscode.postMessage({
      type: 'setSchedulerState',
      state: { action: 'setContinuousMode', enabled: !continuousMode },
    });
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

  // P1 #6: User-facing display state
  const displayState: DisplayState = schedulerState?.displayState ?? 'idle';
  const dsConfig = DISPLAY_STATE_CONFIG[displayState];
  const pauseTooltip = pauseReasonLabel(schedulerState?.pauseReason);

  // Budget: prefer backend gauge string for consistency with extension
  const dailyUsed = budgetStatus?.daily.used ?? 0;
  const dailyCap = budgetStatus?.daily.cap ?? 0;
  const budgetExceeded = budgetStatus?.anyExceeded ?? false;
  const budgetPct = dailyCap > 0 ? Math.min(100, Math.round((dailyUsed / dailyCap) * 100)) : 0;
  const workflowBreakdown = budgetStatus?.workflowBreakdown ?? [];

  // ── Max severity across patterns for the banner color ─────────────────
  const maxSeverity: SystemicPattern['severity'] = (() => {
    if (!systemicIssue?.patterns.length) return 'low';
    return systemicIssue.patterns.reduce<SystemicPattern['severity']>(
      (max, p) => severityRank(p.severity) > severityRank(max) ? p.severity : max,
      'low',
    );
  })();

  // ── P1 #7: Compute inbox items from all existing props ──────────────────
  const inboxItems: InboxItem[] = useMemo(() => {
    const items: InboxItem[] = [];

    // 1) Approval checkpoint — active approval request
    if (approvalRequest) {
      const policyCount = approvalRequest.policyFailures.length;
      items.push({
        type: 'approval',
        severity: 'critical',
        title: `Approval needed for ${approvalRequest.artifactId}`,
        detail: approvalRequest.workflowId
          ? `${policyCount} policy failure(s) in ${approvalRequest.workflowId}`
          : `${policyCount} policy failure(s)`,
        artifactId: approvalRequest.artifactId,
      });
    }

    // 2) Budget exceeded
    if (budgetExceeded) {
      items.push({
        type: 'budget',
        severity: 'warning',
        title: budgetStatus?.bannerMessage ?? 'Budget daily cap exceeded',
        detail: `$${dailyUsed.toFixed(2)} / $${dailyCap.toFixed(2)} used today`,
      });
    }

    // 3) Scheduler paused with system reasons
    const reason = schedulerState?.pauseReason;
    if (reason === 'circuit') {
      items.push({
        type: 'circuit',
        severity: 'critical',
        title: 'Circuit breaker open',
        detail: 'A workflow type is repeatedly failing. Investigate and reset.',
      });
    }
    if (reason === 'queue-empty' && continuousMode) {
      items.push({
        type: 'queue-empty',
        severity: 'info',
        title: 'Queue empty — backlog drained',
        detail: 'All eligible stories are done or blocked. Add new stories to resume.',
      });
    }

    // 4) Systemic issues from harness engine
    if (systemicIssue && systemicIssue.patterns.length > 0) {
      for (const p of systemicIssue.patterns) {
        items.push({
          type: 'systemic',
          severity: p.severity === 'critical' || p.severity === 'high' ? 'critical' : 'warning',
          title: `${p.policyId} — ${p.count} artifact(s) affected`,
          detail: p.sampleMessage,
        });
      }
    }

    return items;
  }, [approvalRequest, budgetExceeded, budgetStatus?.bannerMessage, dailyUsed, dailyCap, schedulerState?.pauseReason, continuousMode, systemicIssue]);

  const inboxCount = inboxItems.length;
  const inboxHasCritical = inboxItems.some(i => i.severity === 'critical');

  // Close inbox on Escape
  const handleInboxKeyDown = useEvent((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setInboxOpen(false);
    }
  });

  return (
    <div className="autonomy-bar">
      {/* ── P1 #7: "Needs you" inbox badge ─────────────────────────────── */}
      <div className="autonomy-bar-group autonomy-bar-group--inbox" ref={inboxRef}>
        <button
          className={`autonomy-inbox-btn ${inboxHasCritical ? 'autonomy-inbox-btn--critical' : ''} ${inboxOpen ? 'autonomy-inbox-btn--open' : ''}`}
          onClick={() => setInboxOpen(o => !o)}
          onKeyDown={handleInboxKeyDown}
          aria-expanded={inboxOpen}
          aria-label={`Needs you inbox — ${inboxCount} item${inboxCount !== 1 ? 's' : ''}`}
          title={inboxCount > 0
            ? `${inboxCount} item${inboxCount !== 1 ? 's' : ''} need${inboxCount === 1 ? 's' : ''} your attention`
            : 'Nothing needs your attention right now'}
        >
          <span className="autonomy-inbox-icon">🔔</span>
          {inboxCount > 0 && (
            <span className={`autonomy-inbox-badge ${inboxHasCritical ? 'autonomy-inbox-badge--critical' : ''}`}>
              {inboxCount}
            </span>
          )}
          <span className="autonomy-inbox-label">Inbox</span>
          {inboxOpen ? (
            <span className="autonomy-inbox-chevron">▴</span>
          ) : (
            <span className="autonomy-inbox-chevron">▾</span>
          )}
        </button>

        {/* ── Dropdown popover ── */}
        {inboxOpen && (
          <div className="autonomy-inbox-dropdown" role="listbox">
            {inboxItems.length === 0 ? (
              <div className="autonomy-inbox-empty" role="option">
                <span className="autonomy-inbox-empty-icon">✅</span>
                <span>All clear — nothing needs your attention.</span>
              </div>
            ) : (
              inboxItems.map((item, i) => (
                <div
                  key={i}
                  className={`autonomy-inbox-item ${INBOX_SEVERITY_CLASS[item.severity]}`}
                  role="option"
                >
                  <span className="autonomy-inbox-item-icon" title={item.type}>
                    {INBOX_ICONS[item.type]}
                  </span>
                  <div className="autonomy-inbox-item-body">
                    <div className="autonomy-inbox-item-title">{item.title}</div>
                    {item.detail && (
                      <div className="autonomy-inbox-item-detail">{item.detail}</div>
                    )}
                  </div>
                  {item.artifactId && (
                    <span className="autonomy-inbox-item-artifact">{item.artifactId}</span>
                  )}
                </div>
              ))
            )}
            {/* ── Footer: dismiss all (closes the dropdown) ── */}
            <div className="autonomy-inbox-footer">
              <button
                className="autonomy-inbox-footer-btn"
                onClick={() => setInboxOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── P1 #6: Continuous Mode toggle + display state ──────────────── */}
      <div className="autonomy-bar-group autonomy-bar-group--continuous">
        <label
          className="autonomy-continuous-toggle"
          title={continuousMode
            ? 'Continuous mode ON — scheduler runs until backlog empty or needs you. Click to disable.'
            : 'Continuous mode OFF — move cards manually. Click to enable hands-off execution.'}
        >
          <span className="autonomy-continuous-label">Continuous:</span>
          <div className={`autonomy-continuous-switch ${continuousMode ? 'autonomy-continuous-switch--on' : ''}`}>
            <div className="autonomy-continuous-switch-knob" />
          </div>
          <span className={`autonomy-continuous-text ${continuousMode ? 'autonomy-continuous-text--on' : ''}`}>
            {continuousMode ? 'ON' : 'OFF'}
          </span>
          <input
            type="checkbox"
            checked={continuousMode}
            onChange={handleContinuousModeToggle}
            className="autonomy-continuous-checkbox"
            aria-label="Toggle continuous mode"
          />
        </label>

        {/* State label — only shown when continuous mode is ON */}
        {continuousMode && (
          <span
            className={`autonomy-display-state ${dsConfig.className}`}
            title={pauseTooltip || undefined}
          >
            <span className="autonomy-display-state-icon">{dsConfig.icon}</span>
            {dsConfig.label}
          </span>
        )}
      </div>

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
        {/* ── Per-workflow cost columns (follow-up to audit gap #20/#42) ── */}
        {workflowBreakdown.length > 0 && (
          <div className="autonomy-bar-workflow-costs" aria-label="Per-workflow cost breakdown">
            {workflowBreakdown.map(row => (
              <span
                key={row.workflow}
                className="autonomy-bar-workflow-chip"
                title={`${row.workflow}: $${row.cost.toFixed(4)} across ${row.calls} call${row.calls !== 1 ? 's' : ''} (${row.inputTokens.toLocaleString()} input + ${row.outputTokens.toLocaleString()} output tokens)`}
              >
                <span className="autonomy-bar-workflow-chip-name">{row.workflow}</span>
                <span className="autonomy-bar-workflow-chip-cost">${row.cost.toFixed(4)}</span>
                <span className="autonomy-bar-workflow-chip-calls">{row.calls}</span>
              </span>
            ))}
          </div>
        )}
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
