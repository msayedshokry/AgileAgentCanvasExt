/**
 * Autonomy Webview Step Definitions
 * Cucumber step definitions for the AutonomyBar / GoalDecomposerModal
 * surface and the dependency-badge data flow.
 *
 * The webview is exercised through a shadow context that mirrors what
 * AgenticKanbanApp would render from the current state, without booting
 * a real React tree. Steps fall into three families:
 *   1) "the user clicks X" / "the user types Y" — mutates postMessage history
 *   2) "the extension broadcasts X" — applies a message to the webview state
 *   3) "the AutonomyBar should show X" / "vscode.postMessage should ..." —
 *      asserts on the resulting state or postMessage history
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

// ─── Domain types (mirrored from the webview/extension, no imports) ───────

type SchedulerState = 'idle' | 'paused' | 'running';

interface SchedulerStateMessage {
  state: SchedulerState;
  nextUp: string | null;
  inProgress: string[];
  enabled: boolean;
}

interface BudgetStatus {
  perStory: { used: number; cap: number; exceeded: boolean };
  daily: { used: number; cap: number; exceeded: boolean };
  anyExceeded: boolean;
  bannerMessage: string | null;
  remaining: number;
}

interface ProposedStory {
  id: string;
  title: string;
  description?: string;
  priority?: string;
}

interface ProposedGoal {
  id: string;
  goal: string;
  status: 'pending' | 'decomposing' | 'review' | 'approved' | 'rejected' | 'dispatched';
  proposedStories: ProposedStory[];
  approvedStories: ProposedStory[];
}

interface DependencyBadge {
  id: string;
  blockedBy: number;
  hasCycle: boolean;
  blockerTitles: string[];
}

interface KanbanItem {
  id: string;
  title: string;
  status: string;
  type: 'epic' | 'story' | string;
  blockedBy?: number;
  hasCycle?: boolean;
  blockerTitles?: string[];
}

interface Toast {
  message: string;
  type: 'info' | 'error' | 'success';
}

interface SystemicPattern {
  policyId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedArtifactIds: string[];
  count: number;
  sampleMessage?: string;
}

interface SystemicIssue {
  artifactId: string;
  artifactType: string;
  patterns: SystemicPattern[];
}

// ─── Context ────────────────────────────────────────────────────────────────

interface AutonomyContext {
  // Mount state
  mounted: boolean;
  pullMessagesSent: boolean;

  // Webview state
  schedulerState: SchedulerStateMessage | null;
  budgetStatus: BudgetStatus | null;
  pendingGoal: ProposedGoal | null;
  goalReviewOpen: boolean;
  depBadges: Map<string, DependencyBadge>;
  items: KanbanItem[];
  selectedStoryIds: Set<string>;
  toast: Toast | null;

  // Goal input
  goalDraft: string;

  // Systemic-issue banner (issue #4)
  systemicIssue: SystemicIssue | null;

  // Communication
  postMessageHistory: any[];
  lastPostMessage: any | null;

  // Internal
  submitCooldownUntil: number;
}

const contexts = new WeakMap<BmadWorld, AutonomyContext>();

function getCtx(world: BmadWorld): AutonomyContext {
  let ctx = contexts.get(world);
  if (!ctx) {
    ctx = {
      mounted: false,
      pullMessagesSent: false,
      schedulerState: null,
      budgetStatus: null,
      pendingGoal: null,
      goalReviewOpen: false,
      depBadges: new Map(),
      items: [],
      selectedStoryIds: new Set(),
      toast: null,
      goalDraft: '',
      systemicIssue: null,
      postMessageHistory: [],
      lastPostMessage: null,
      submitCooldownUntil: 0,
    };
    contexts.set(world, ctx);
  }
  return ctx;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Record a postMessage call. Centralised so tests can assert on history.
 */
function postMessage(ctx: AutonomyContext, message: any): void {
  ctx.postMessageHistory.push(message);
  ctx.lastPostMessage = message;
}

/**
 * Apply a dot-notation key/value to a nested object.
 * e.g. setByPath({}, 'daily.used', 1.2) → { daily: { used: 1.2 } }
 * Numeric values from the BDD table are always numbers; everything else is
 * a string unless the existing value at that path is already a number/bool.
 */
function setByPath(obj: any, path: string, value: string): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== 'object') {
      cur[k] = {};
    }
    cur = cur[k];
  }
  const leaf = parts[parts.length - 1];
  // Coerce numbers/booleans based on existing value type
  if (typeof cur[leaf] === 'number') {
    cur[leaf] = Number(value);
  } else if (typeof cur[leaf] === 'boolean') {
    cur[leaf] = value === 'true';
  } else if (value === 'true' || value === 'false') {
    cur[leaf] = value === 'true';
  } else if (/^-?\d+(?:\.\d+)?$/.test(value) && cur[leaf] === undefined) {
    // Auto-coerce top-level numeric leaf values when the slot is unset
    cur[leaf] = Number(value);
  } else {
    cur[leaf] = value;
  }
}

/**
 * Apply a flat { key: value, ... } object (from `dataTable.rowsHash()`) to
 * a target object. Used for 2-column tables where each row is a key-value
 * pair (e.g. `| perStory.used | 0.5 |`) — `rowsHash()` returns a single
 * object instead of an array of single-key objects.
 */
function applyFlatObject<T extends Record<string, any>>(target: T, flat: Record<string, string>): T {
  for (const [key, value] of Object.entries(flat)) {
    setByPath(target, key, value);
  }
  return target;
}

/**
 * Format the budget gauge label exactly as AutonomyBar does:
 *   $${dailyUsed.toFixed(4)} / ${dailyCap.toFixed(2)} (${pct}%)
 */
function formatBudgetLabel(dailyUsed: number, dailyCap: number): string {
  const pct = dailyCap > 0 ? Math.min(100, Math.round((dailyUsed / dailyCap) * 100)) : 0;
  return `$${dailyUsed.toFixed(4)} / $${dailyCap.toFixed(2)} (${pct}%)`;
}

/**
 * The display state label AutonomyBar uses for a given scheduler state.
 * Mirrors the JSX in AutonomyBar.tsx exactly.
 */
function schedulerStateLabel(s: SchedulerState): string {
  if (s === 'idle') return '● idle';
  if (s === 'paused') return '⏸ paused';
  return '▶ running';
}

// ─── Background ─────────────────────────────────────────────────────────────

Given('a freshly mounted autonomy webview context', function (this: BmadWorld) {
  const ctx = getCtx(this);
  ctx.mounted = true;
  ctx.pullMessagesSent = false;
  ctx.schedulerState = null;
  ctx.budgetStatus = null;
  ctx.pendingGoal = null;
  ctx.goalReviewOpen = false;
  ctx.depBadges = new Map();
  ctx.items = [];
  ctx.selectedStoryIds = new Set();
  ctx.toast = null;
  ctx.goalDraft = '';
  ctx.systemicIssue = null;
  ctx.postMessageHistory = [];
  ctx.lastPostMessage = null;
  ctx.submitCooldownUntil = 0;
});

Given('the webview posts the autonomy pull-on-mount messages', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.mounted, 'Autonomy webview must be mounted before pull messages fire');
  // Mirrors the useEffect in AgenticKanbanApp.tsx that fires on mount
  postMessage(ctx, { type: 'kanban:getAutoAdvance' });
  postMessage(ctx, { type: 'getSchedulerState' });
  postMessage(ctx, { type: 'getBudgetStatus' });
  ctx.pullMessagesSent = true;
});

// ─── Section 1: Scheduler pause / resume ───────────────────────────────────

Given('the scheduler is in state {string} with {int} in progress', function (this: BmadWorld, state: string, count: number) {
  const ctx = getCtx(this);
  ctx.schedulerState = {
    state: state as SchedulerState,
    nextUp: count > 0 ? 'next-workflow' : null,
    inProgress: Array.from({ length: count }, (_, i) => `wip-${i + 1}`),
    enabled: state !== 'idle',
  };
});

Given('the scheduler is in state {string}', function (this: BmadWorld, state: string) {
  const ctx = getCtx(this);
  ctx.schedulerState = {
    state: state as SchedulerState,
    nextUp: null,
    inProgress: [],
    enabled: state !== 'idle',
  };
});

/**
 * Map a button label rendered by AutonomyBar / GoalDecomposerModal to an
 * IPC postMessage (or, for modal-only buttons, a state mutation). Dynamic
 * labels like "Approve 2 & Dispatch" and "Review (3)" are matched by
 * prefix/regex so the step definition doesn't need a hand-coded list of
 * every possible N.
 */
function clickAutonomyButton(ctx: AutonomyContext, button: string): void {
  if (button === 'Pause') {
    postMessage(ctx, { type: 'setSchedulerState', state: { action: 'pause' } });
  } else if (button === 'Resume' || button === 'Start') {
    postMessage(ctx, { type: 'setSchedulerState', state: { action: 'resume' } });
  } else if (button === 'Stop') {
    postMessage(ctx, { type: 'setSchedulerState', state: { action: 'stop' } });
  } else if (button === '⇄') {
    postMessage(ctx, { type: 'setSchedulerState', state: { action: 'toggle' } });
  } else if (button === '↻') {
    postMessage(ctx, { type: 'getBudgetStatus' });
  } else if (button === 'Submit Goal') {
    const text = ctx.goalDraft.trim();
    if (text && Date.now() >= ctx.submitCooldownUntil) {
      postMessage(ctx, { type: 'submitGoal', text });
      ctx.goalDraft = '';
      ctx.submitCooldownUntil = Date.now() + 1000;
    }
  } else if (/^Review \(\d+\)$/.test(button)) {
    // Open the goal review modal — no IPC, just opens the modal
    ctx.goalReviewOpen = true;
  } else if (button === 'Review') {
    ctx.goalReviewOpen = true;
  } else if (/^Approve \d+ & Dispatch$/.test(button) || button === 'Approve') {
    if (ctx.pendingGoal && ctx.selectedStoryIds.size > 0) {
      postMessage(ctx, {
        type: 'approveGoalStories',
        goalId: ctx.pendingGoal.id,
        storyIds: Array.from(ctx.selectedStoryIds),
      });
      ctx.goalReviewOpen = false;
      ctx.pendingGoal = null;
      ctx.selectedStoryIds = new Set();
    }
  } else if (button === 'Cancel' || button === '✕' || button === 'Close') {
    ctx.goalReviewOpen = false;
    ctx.pendingGoal = null;
    ctx.selectedStoryIds = new Set();
  } else {
    throw new Error(`Unknown AutonomyBar button: ${button}`);
  }
}

When('the user clicks the {string} button in the AutonomyBar', function (this: BmadWorld, button: string) {
  clickAutonomyButton(getCtx(this), button);
});

// Permissive variant: catch steps that omit the trailing context. The Submit
// Goal button and the Approve N & Dispatch button in the feature file
// intentionally use the shorter form (they're each rendered in their own
// sub-section of the bar, so the context is implicit). Same handler.
When('the user clicks the {string} button', function (this: BmadWorld, button: string) {
  clickAutonomyButton(getCtx(this), button);
});

When('the extension broadcasts a schedulerState with:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  const row = dataTable.rowsHash();
  const msg: SchedulerStateMessage = {
    state: (row.state || 'running') as SchedulerState,
    nextUp: row.nextUp === '' || row.nextUp === undefined ? null : row.nextUp,
    inProgress: row.inProgress ? row.inProgress.split(',').filter(Boolean) : [],
    enabled: row.enabled === 'true',
  };
  ctx.schedulerState = msg;
});

Then('the AutonomyBar should show state {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.schedulerState, 'schedulerState is null — no broadcast received');
  const actual = schedulerStateLabel(ctx.schedulerState.state);
  assert.strictEqual(actual, expected, `Expected state "${expected}", got "${actual}"`);
});

Then('the AutonomyBar should show a {string} button', function (this: BmadWorld, button: string) {
  const ctx = getCtx(this);
  const state = ctx.schedulerState?.state ?? 'idle';
  // Mirrors the AutonomyBar JSX:
  //   isRunning → Pause, isPaused → Resume, isIdle → Start
  //   plus ⇄ (toggle) and ⏹ Stop when not idle
  const labels: string[] = [];
  if (state === 'running') labels.push('Pause');
  else if (state === 'paused') labels.push('Resume');
  else labels.push('Start');
  if (state !== 'idle') {
    labels.push('⇄');
    labels.push('Stop');
  }
  assert.ok(labels.includes(button), `Expected AutonomyBar to show "${button}" for state "${state}". Rendered: [${labels.join(', ')}]`);
});

Then('the AutonomyBar should not show a {string} button', function (this: BmadWorld, button: string) {
  const ctx = getCtx(this);
  const state = ctx.schedulerState?.state ?? 'idle';
  const labels: string[] = [];
  if (state === 'running') labels.push('Pause');
  else if (state === 'paused') labels.push('Resume');
  else labels.push('Start');
  if (state !== 'idle') {
    labels.push('⇄');
    labels.push('Stop');
  }
  assert.ok(!labels.includes(button), `Did not expect AutonomyBar to show "${button}" for state "${state}"`);
});

Then('the AutonomyBar should show a {string} meta badge', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  const n = ctx.schedulerState?.inProgress.length ?? 0;
  if (n === 0) {
    assert.fail(`Expected "${expected}" meta badge, but inProgress is empty (badge hidden)`);
  }
  // Format: "<N> running"
  const actual = `${n} running`;
  assert.strictEqual(actual, expected, `Expected meta badge "${expected}", got "${actual}"`);
});

// ─── Section 2: Budget gauge ───────────────────────────────────────────────

Given('the budget gauge is rendered with:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  const status: BudgetStatus = {
    perStory: { used: 0, cap: 0, exceeded: false },
    daily: { used: 0, cap: 0, exceeded: false },
    anyExceeded: false,
    bannerMessage: null,
    remaining: 0,
  };
  applyFlatObject(status as any, dataTable.rowsHash());
  ctx.budgetStatus = status;
});

Given('the budget gauge is rendered with daily.used {float} and daily.cap {float}', function (this: BmadWorld, used: number, cap: number) {
  const ctx = getCtx(this);
  ctx.budgetStatus = {
    perStory: { used: 0, cap: 0, exceeded: false },
    daily: { used, cap, exceeded: used > cap },
    anyExceeded: used > cap,
    bannerMessage: null,
    remaining: Math.max(0, cap - used),
  };
});

When('the extension broadcasts a budgetStatus with:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  const status: BudgetStatus = {
    perStory: { used: 0, cap: 0, exceeded: false },
    daily: { used: 0, cap: 0, exceeded: false },
    anyExceeded: false,
    bannerMessage: null,
    remaining: 0,
  };
  applyFlatObject(status as any, dataTable.rowsHash());
  ctx.budgetStatus = status;
});

Then('the budget gauge should show {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.budgetStatus, 'budgetStatus is null — no broadcast received');
  const actual = formatBudgetLabel(ctx.budgetStatus.daily.used, ctx.budgetStatus.daily.cap);
  assert.strictEqual(actual, expected, `Expected gauge label "${expected}", got "${actual}"`);
});

Then('the AutonomyBar should not render a budget gauge', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.budgetStatus, 'budgetStatus is null');
  assert.strictEqual(ctx.budgetStatus.daily.cap, 0, 'Expected daily.cap=0 to skip gauge render');
});

Then('the AutonomyBar should show a {string} warning', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.budgetStatus, 'budgetStatus is null');
  // The "⚠ Cap hit" warning is shown when anyExceeded is true
  if (expected === 'Cap hit') {
    assert.strictEqual(ctx.budgetStatus.anyExceeded, true, 'Expected anyExceeded=true for Cap hit warning');
  } else {
    assert.fail(`Unknown warning: "${expected}"`);
  }
});

Then('the AutonomyBar should not show a {string} warning', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  if (expected === 'Cap hit') {
    const exceeded = ctx.budgetStatus?.anyExceeded ?? false;
    assert.strictEqual(exceeded, false, 'Did not expect Cap hit warning but anyExceeded is true');
  }
});

Then('the AutonomyBar should show {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  if (expected === 'No daily cap set') {
    assert.ok(ctx.budgetStatus, 'budgetStatus is null');
    assert.strictEqual(ctx.budgetStatus.daily.cap, 0, 'Expected daily.cap=0 to render "No daily cap set"');
  } else {
    assert.fail(`Unknown AutonomyBar text assertion: "${expected}"`);
  }
});

// ─── Section 3: Goal submit → decompose → review → dispatch ────────────────

Given('no goal is pending review', function (this: BmadWorld) {
  const ctx = getCtx(this);
  ctx.pendingGoal = null;
  ctx.goalReviewOpen = false;
  ctx.selectedStoryIds = new Set();
});

When('the user types {string} into the goal input', function (this: BmadWorld, text: string) {
  const ctx = getCtx(this);
  ctx.goalDraft = text;
});

When('the extension broadcasts a goalSubmitted with:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  const row = dataTable.rowsHash();
  if (row.goalId) {
    ctx.toast = { message: 'Goal submitted (decomposing…)', type: 'info' };
  }
});

When('the extension broadcasts a goalSubmitError with error {string}', function (this: BmadWorld, error: string) {
  const ctx = getCtx(this);
  ctx.toast = { message: `Goal submit failed: ${error}`, type: 'error' };
});

When('the extension broadcasts a goalReadyForReview with goal:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  const row = dataTable.rowsHash();
  const proposedIds = (row.proposedStories || '').split(',').filter(Boolean);
  ctx.pendingGoal = {
    id: row.id,
    goal: row.goal,
    status: 'review',
    proposedStories: proposedIds.map(id => ({ id, title: id, priority: 'P2' })),
    approvedStories: [],
  };
  // Mirrors AgenticKanbanApp.tsx: setPendingGoal + setGoalReviewOpen(true)
  ctx.goalReviewOpen = true;
  // Default selection: all proposed stories start selected
  ctx.selectedStoryIds = new Set(proposedIds);
  ctx.toast = { message: 'Goal decomposed — review the proposed stories', type: 'info' };
});

Given('the GoalDecomposerModal is open for goal {string} with proposed stories:', function (this: BmadWorld, goalId: string, dataTable: any) {
  const ctx = getCtx(this);
  const stories = dataTable.hashes().map((r: any) => ({
    id: r.id,
    title: r.title,
    priority: r.priority,
  }));
  ctx.pendingGoal = {
    id: goalId,
    goal: `Goal ${goalId}`,
    status: 'review',
    proposedStories: stories,
    approvedStories: [],
  };
  ctx.goalReviewOpen = true;
  ctx.selectedStoryIds = new Set(stories.map((s: any) => s.id));
});

When('the user deselects the story {string} in the modal', function (this: BmadWorld, storyId: string) {
  const ctx = getCtx(this);
  if (ctx.selectedStoryIds.has(storyId)) {
    const next = new Set(ctx.selectedStoryIds);
    next.delete(storyId);
    ctx.selectedStoryIds = next;
  }
});

When('the extension broadcasts a goalReviewed with status {string} and {int} approved', function (this: BmadWorld, status: string, approvedCount: number) {
  const ctx = getCtx(this);
  // Mirrors AgenticKanbanApp.tsx goalReviewed branch
  ctx.goalReviewOpen = false;
  ctx.pendingGoal = null;
  ctx.selectedStoryIds = new Set();
  if (status === 'approved') {
    ctx.toast = {
      message: `Goal approved — ${approvedCount} story(ies) dispatched`,
      type: 'success',
    };
  } else {
    ctx.toast = { message: 'Goal review complete (no stories approved)', type: 'info' };
  }
});

When('the extension broadcasts a goalDispatched with {int} persisted', function (this: BmadWorld, _persisted: number) {
  const ctx = getCtx(this);
  // Mirrors AgenticKanbanApp.tsx goalDispatched branch
  postMessage(ctx, { type: 'agenticKanban:refresh' });
});

Then('the GoalDecomposerModal should be open', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.pendingGoal, 'pendingGoal is null — modal cannot be open');
  assert.strictEqual(ctx.goalReviewOpen, true, 'goalReviewOpen should be true');
});

Then('the GoalDecomposerModal should be closed', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.goalReviewOpen, false, 'goalReviewOpen should be false');
  assert.strictEqual(ctx.pendingGoal, null, 'pendingGoal should be cleared');
});

Then('the pending goal should have {int} proposed stories', function (this: BmadWorld, count: number) {
  const ctx = getCtx(this);
  assert.ok(ctx.pendingGoal, 'pendingGoal is null');
  assert.strictEqual(ctx.pendingGoal.proposedStories.length, count, `Expected ${count} proposed stories, got ${ctx.pendingGoal.proposedStories.length}`);
});

Then('the AutonomyBar should show a {string} button with proposed count {int}', function (this: BmadWorld, buttonPrefix: string, expected: number) {
  const ctx = getCtx(this);
  assert.ok(ctx.pendingGoal, 'pendingGoal is null — Review button would not render');
  assert.strictEqual(
    ctx.pendingGoal.proposedStories.length,
    expected,
    `Expected pendingGoal.proposedStories.length=${expected}, got ${ctx.pendingGoal.proposedStories.length}`,
  );
  // The actual button label rendered by AutonomyBar is `Review (N)` — assert
  // that the rendered text matches the prefix + count.
  const rendered = `${buttonPrefix} (${expected})`;
  assert.ok(/^Review \(\d+\)$/.test(rendered), `Expected rendered label to match "Review (N)", got "${rendered}"`);
});

// ─── Section 4: Dependency badges ──────────────────────────────────────────

When('the extension broadcasts an updateDependencyBadges with:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  const rows = dataTable.hashes();
  // If the table has no data rows (only the header), clear the map
  if (rows.length === 0) {
    ctx.depBadges = new Map();
    return;
  }
  const incoming: DependencyBadge[] = rows.map((r: any) => ({
    id: r.id,
    blockedBy: Number(r.blockedBy ?? 0),
    hasCycle: r.hasCycle === 'true',
    blockerTitles: (r.blockerTitles || '').split(',').filter(Boolean),
  }));
  ctx.depBadges = new Map(incoming.map(b => [b.id, b]));
});

Given('the autonomy webview has item {string} in {string} column', function (this: BmadWorld, id: string, column: string) {
  // Distinct from the `AgenticKanbanApp has item ...` step in
  // agentic-kanban.steps.ts: that one writes to KanbanWebviewContext.cards,
  // this one writes to AutonomyContext.items. The dep-badge merge logic in
  // AgenticKanbanApp reads from `items`, so the autonomy tests need items
  // in the autonomy context.
  const ctx = getCtx(this);
  const statusMap: Record<string, string> = {
    'Backlog': 'backlog',
    'Ready for Dev': 'ready-for-dev',
    'In Progress': 'in-progress',
    'Review': 'review',
    'Done': 'done',
  };
  const status = statusMap[column] || column.toLowerCase().replace(/\s/g, '-');
  if (!ctx.items.find(i => i.id === id)) {
    ctx.items.push({ id, title: id, status, type: 'story' });
  }
});

/**
 * Compute the merged display item, mirroring the useMemo in AgenticKanbanApp.
 * The dep badge fields are merged onto the base item when a badge exists.
 */
function getDisplayItem(ctx: AutonomyContext, id: string): KanbanItem | null {
  const item = ctx.items.find(i => i.id === id);
  if (!item) return null;
  const badge = ctx.depBadges.get(id);
  if (!badge) return { ...item };
  return {
    ...item,
    blockedBy: badge.blockedBy,
    hasCycle: badge.hasCycle,
    blockerTitles: [...badge.blockerTitles],
  };
}

Then('the merged displayItem for {string} should have blockedBy {int}', function (this: BmadWorld, id: string, expected: number) {
  const ctx = getCtx(this);
  const item = getDisplayItem(ctx, id);
  assert.ok(item, `Item ${id} not found in items`);
  assert.strictEqual(item.blockedBy ?? 0, expected, `Expected blockedBy=${expected}, got ${item.blockedBy ?? 0}`);
});

Then('the merged displayItem for {string} should have hasCycle {word}', function (this: BmadWorld, id: string, expected: string) {
  const ctx = getCtx(this);
  const item = getDisplayItem(ctx, id);
  assert.ok(item, `Item ${id} not found in items`);
  const expectedBool = expected === 'true';
  assert.strictEqual(!!item.hasCycle, expectedBool, `Expected hasCycle=${expectedBool}, got ${!!item.hasCycle}`);
});

Then('the merged displayItem for {string} should have blockerTitles:', function (this: BmadWorld, id: string, dataTable: any) {
  const ctx = getCtx(this);
  const item = getDisplayItem(ctx, id);
  assert.ok(item, `Item ${id} not found in items`);
  const expected = dataTable.raw().map((row: string[]) => row[0]).filter(Boolean);
  const actual = item.blockerTitles ?? [];
  assert.deepStrictEqual(actual, expected, `Expected blockerTitles=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
});

// ─── Common: postMessage and toast assertions ──────────────────────────────

// Note: `vscode.postMessage should have been called with type {string}` and
// the `with:` variant live in agentic-kanban.steps.ts. We delegate by
// re-using that context. To keep this file self-contained for the autonomy
// flow, we re-check against the autonomy context (which records its own
// postMessage history) — but only for assertion paths that have *both*
// a kanban and autonomy context. When only the autonomy context applies,
// we use a custom step below.

// `vscode.postMessage should have been called with type {string}` and the
// `with:` variant live in agentic-kanban.steps.ts and read from the kanban
// context. The autonomy flow has its own postMessage history, so we
// re-export them with the `autonomy ` prefix and use those in the feature
// file to avoid context-mixing false positives.

Then('autonomy vscode.postMessage should not have been called with type {string}', function (this: BmadWorld, msgType: string) {
  const ctx = getCtx(this);
  const found = ctx.postMessageHistory.find(m => m.type === msgType);
  assert.ok(!found, `Expected autonomy vscode.postMessage NOT to have been called with type "${msgType}", but it was. History: [${ctx.postMessageHistory.map(m => m.type).join(', ')}]`);
});

Then('autonomy vscode.postMessage should have been called with type {string}', function (this: BmadWorld, msgType: string) {
  const ctx = getCtx(this);
  const found = ctx.postMessageHistory.find(m => m.type === msgType);
  assert.ok(found, `Expected autonomy vscode.postMessage to have been called with type "${msgType}". History: [${ctx.postMessageHistory.map(m => m.type).join(', ')}]`);
});

// ── Autonomous git hook callback coverage (#17) ───────────────────────
// Triggers the git onBranch hook directly on the singleton (which the
// autonomy lifecycle configured during activation). The hook should
// call vscode.postMessage with { type: 'gitBranch', ... }.
When('the autonomy lifecycle fires the git onBranch hook for story {string} with branch {string}', function (this: BmadWorld, storyId: string, branchName: string) {
  // Load the singleton — it was configured by the autonomy lifecycle.
  // Call the registered onBranch hook directly.
  const { autonomousGit } = require('../../src/workflow/autonomous-git');
  const mod = autonomousGit as any;
  const hooks = mod.hooks;
  assert.ok(hooks, 'autonomousGit hooks not set — autonomy lifecycle did not configure them');
  assert.strictEqual(typeof hooks.onBranch, 'function', 'onBranch hook is not a function');
  // Fire the hook — it should call vscode.postMessage with the gitBranch type.
  hooks.onBranch(storyId, branchName);
});

Then('autonomy vscode.postMessage should have been called with:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  const expected = dataTable.rowsHash();
  // Find the first postMessage that matches the type
  const candidates = ctx.postMessageHistory.filter(m => m.type === expected.type);
  assert.ok(candidates.length > 0, `No postMessage with type "${expected.type}". History: [${ctx.postMessageHistory.map(m => m.type).join(', ')}]`);
  const last = candidates[candidates.length - 1];
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'type') continue;
    // Support nested keys via dot-notation: state.action, blockerTitles, etc.
    const parts = key.split('.');
    let actual: any = last;
    for (const p of parts) {
      if (actual === undefined || actual === null) break;
      actual = actual[p];
    }
    // For comma-separated lists (storyIds, blockerTitles), compare as array
    const expectedValue = String(value);
    let expectedNorm: any = expectedValue;
    if (typeof actual === 'string' && expectedValue.includes(',')) {
      expectedNorm = expectedValue.split(',').filter(Boolean);
      assert.deepStrictEqual(
        actual.split(',').filter(Boolean),
        expectedNorm,
        `Expected postMessage.${key} to equal ${JSON.stringify(expectedNorm)}, got ${JSON.stringify(actual)}`,
      );
    } else {
      assert.strictEqual(String(actual ?? ''), expectedValue, `Expected postMessage.${key} to equal "${expectedValue}", got "${actual}"`);
    }
  }
});

Then('the webview should show a toast with text containing {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.toast, 'No toast is set');
  assert.ok(ctx.toast.message.includes(expected), `Expected toast to contain "${expected}", got "${ctx.toast.message}"`);
});

Then('the webview should show a toast with type {string} and text containing {string}', function (this: BmadWorld, expectedType: string, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.toast, 'No toast is set');
  assert.strictEqual(ctx.toast.type, expectedType, `Expected toast type "${expectedType}", got "${ctx.toast.type}"`);
  assert.ok(ctx.toast.message.includes(expected), `Expected toast to contain "${expected}", got "${ctx.toast.message}"`);
});

// ─── Section 5: Systemic-issue banner (issue #4) ─────────────────────────

/** Map severity to a rank (mirrors AutonomyBar.tsx severityRank). */
function severityRank(s: SystemicPattern['severity']): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[s];
}

/** Compute the max severity across patterns (mirrors AutonomyBar.tsx). */
function maxSeverity(patterns: SystemicPattern[]): SystemicPattern['severity'] {
  return patterns.reduce<SystemicPattern['severity']>(
    (max, p) => severityRank(p.severity) > severityRank(max) ? p.severity : max,
    'low',
  );
}

When('the extension broadcasts a systemicIssue with patterns:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  const rows = dataTable.hashes();
  const patterns: SystemicPattern[] = rows.map((r: any) => ({
    policyId: r.policyId,
    severity: r.severity as SystemicPattern['severity'],
    affectedArtifactIds: (r.affectedArtifactIds || '').split(',').filter(Boolean),
    count: Number(r.count ?? 0),
    sampleMessage: r.sampleMessage || undefined,
  }));
  ctx.systemicIssue = {
    artifactId: 'test-artifact',
    artifactType: 'story',
    patterns,
  };
});

Then('the systemic-issue banner should show severity {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.systemicIssue, 'systemicIssue is null — banner should not be hidden');
  const actual = maxSeverity(ctx.systemicIssue.patterns);
  assert.strictEqual(actual, expected, `Expected banner severity "${expected}", got "${actual}"`);
});

Then('the systemic-issue banner should show summary {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.systemicIssue, 'systemicIssue is null — banner should be visible');
  const count = ctx.systemicIssue.patterns.length;
  const actual = `${count} systemic issue${count !== 1 ? 's' : ''} detected`;
  assert.strictEqual(actual, expected, `Expected banner summary "${expected}", got "${actual}"`);
});

When('the user clicks the dismiss button on the systemic-issue banner', function (this: BmadWorld) {
  const ctx = getCtx(this);
  // Mirrors AgenticKanbanApp.tsx: onDismissSystemicIssue sets systemicIssue to null
  ctx.systemicIssue = null;
});

Then('the systemic-issue banner should not be visible', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.systemicIssue, null, 'Expected systemicIssue to be null (banner hidden), but it is still set');
});
