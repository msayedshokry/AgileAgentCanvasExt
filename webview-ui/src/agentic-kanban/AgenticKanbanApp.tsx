import { useState, useEffect, useMemo, useRef } from 'react';
import { KanbanColumn } from '../components/kanban/KanbanColumn';
import type { KanbanItem, KanbanColumnKey } from '../components/kanban/KanbanTypes';
import { KANBAN_COLUMNS, normalizeToKanbanColumn } from '../components/kanban/KanbanTypes';
import { vscode } from '../vscodeApi';
import '../components/kanban/Kanban.css';

import { TerminalModal } from './TerminalModal';
import { AgenticDetailPanel } from './AgenticDetailPanel';
import { ContextMenu } from './ContextMenu';
import { useEvent } from './useEvent';
import { AutonomyBar, type SchedulerStateMessage, type BudgetStatus, type ProposedGoal, type SystemicIssue } from './AutonomyBar';
import { TracePanel } from './TracePanel';
import { GoalDecomposerModal } from './GoalDecomposerModal';
import type { TraceBreakdownMessage } from '../types';
import './Autonomy.css';
import type { DependencyBadge } from './kanban-helpers';
import {
  ArtifactLike,
  AgentInfo,
  KanbanToast,
  artifactToKanbanItem,
  isAgenticType,
} from './kanban-helpers';

interface AgenticKanbanAppProps {
  /** Pre-populated artifacts (canvas mode). When provided, no extension request. */
  initialArtifacts?: ArtifactLike[];
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Stable column order used for keyboard navigation (←/→). */
const KANBAN_ORDER: KanbanColumnKey[] = [
  'backlog', 'ready-for-dev', 'in-progress', 'review', 'done',
];

/** Priority sort order: P0 (highest) → P3 → MoSCoW → no priority (lowest). */
const PRIORITY_ORDER: Record<string, number> = {
  'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3,
  'must-have': 4, 'should-have': 5, 'could-have': 6, "won't-have": 7,
};

/** WIP limits applied when no `agileagentcanvas.kanban.wipLimits` setting is sent. */
const DEFAULT_WIP_LIMITS: Record<string, number> = { 'in-progress': 5, 'review': 4 };

/** Max time to wait for the last batch transition result before discarding the batch. */
const BATCH_STUCK_TIMEOUT_MS = 10_000;

/** Toast auto-dismiss duration. */
const TOAST_DISMISS_MS = 5_000;

/** Skeleton cards for the loading state. */
const SKELETON_CARDS = [
  { lines: ['long', 'medium'] },
  { lines: ['long', 'short'] },
  { lines: ['medium', 'long'] },
] as const;

const EMPTY_TEXT: Record<KanbanColumnKey, string> = {
  'backlog': 'Drop a story or epic here to begin',
  'ready-for-dev': 'Drop a story here to start development',
  'in-progress': 'Drop a story here to run a workflow',
  'review': 'Drop a completed story here for review',
  'done': 'Stories land here when complete',
  'optional': 'Drop here',
};

// ── Component ────────────────────────────────────────────────────────────────

export function AgenticKanbanApp({ initialArtifacts }: AgenticKanbanAppProps) {
  const [items, setItems] = useState<KanbanItem[]>(
    () => initialArtifacts?.filter(isAgenticType).map(a => artifactToKanbanItem(a)) ?? [],
  );
  // Unified selection: a single Set is the source of truth for which cards are
  // selected. The detail panel opens when exactly one card is selected.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Shift-range anchor (formerly `lastClickedId`). Tracks the most recently
  // clicked card so shift+click can compute a range from anchor → current.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [pendingTransitions, setPendingTransitions] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<KanbanToast | null>(null);
  const [loading, setLoading] = useState<boolean>(!initialArtifacts);
  const [terminalModal, setTerminalModal] = useState<{ artifactId: string; artifactTitle: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const agentInfoCache = useRef<Map<string, { info: AgentInfo; status: string }>>(new Map());
  const [resumingArtifactId, setResumingArtifactId] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(false);
  // Disabled until the first chatSessionState message arrives (pessimistic).
  const [chatSessionActive, setChatSessionActive] = useState<boolean>(false);
  const [chatSessionModel, setChatSessionModel] = useState<string | undefined>();
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'title' | 'status' | 'type' | 'priority'>('title');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: KanbanItem; focusIndex: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wipLimits, setWipLimits] = useState<Record<string, number>>(DEFAULT_WIP_LIMITS);
  // ── Autonomy UI state (issue #22) ──────────────────────────────────────
  const [schedulerState, setSchedulerState] = useState<SchedulerStateMessage | null>(null);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [pendingGoal, setPendingGoal] = useState<ProposedGoal | null>(null);
  const [goalReviewOpen, setGoalReviewOpen] = useState<boolean>(false);
  // Cross-artifact systemic issues from the harness engine (issue #4).
  const [systemicIssue, setSystemicIssue] = useState<SystemicIssue | null>(null);
  // Trace breakdown for the most recent Kanban autonomous-loop run window
  // (audit follow-up to gap #20/#42). Pulled on mount and refreshable.
  const [traceBreakdown, setTraceBreakdown] = useState<TraceBreakdownMessage | null>(null);
  // Dependency badges pushed by the extension's autonomy lifecycle.
  // Keyed by story id; merged into displayItems so the KanbanCard badge
  // (🔗/⛔ Blocked by N) stays in sync with the live dependency graph.
  const [depBadges, setDepBadges] = useState<Map<string, DependencyBadge>>(() => new Map());

  // ── Imperative refs (NOT state mirrors) ──────────────────────────────────
  // These track backend IPC bookkeeping, not React state. They survive
  // re-renders without participating in the render cycle.
  const preDropStatus = useRef<Map<string, string>>(new Map());
  const lastDroppedTarget = useRef<Map<string, string>>(new Map());
  const preDropType = useRef<Map<string, string>>(new Map());
  const pendingBatch = useRef<{
    ids: Set<string>;
    count: number;
    targetColumn: KanbanColumnKey;
    targetStatus: string;
    undoData: Array<{ id: string; fromStatus: string; toStatus: string; artifactType: string }>;
  } | null>(null);

  // ── Selection-derived values ──────────────────────────────────────────────
  // The detail panel is open when exactly one card is selected. This unifies
  // the three previously-separate pieces of state (selectedId, selectedIds,
  // lastClickedId) into a single source of truth.
  const detailOpenId = useMemo(
    () => (selectedIds.size === 1 ? Array.from(selectedIds)[0] : null),
    [selectedIds],
  );

  // ── Message handler (useEvent: stable identity, latest closure) ──────────
  // Previously: pendingRef mirrored pendingTransitions. Now the handler
  // closes over pendingTransitions directly, but its identity is stable so
  // the useEffect listener doesn't churn.
  const onMessage = useEvent((message: any) => {
    switch (message.type) {
      case 'updateArtifacts':
        setLoading(false);
        // Preserve optimistically-set status, agentState, lockInfo, and
        // harnessResults from the previous render so a refresh doesn't
        // snap a card back to its origin column while its drop is in flight.
        setItems(prev => {
          const prevMeta = new Map(prev.map(i => [i.id, {
            agentState: i.agentState,
            lockInfo: i.lockInfo,
            harnessResults: i.harnessResults,
            status: i.status,
          }]));
          // pendingTransitions is captured from the message-handler closure
          // (not read from a ref). Intentional: the value at event time is
          // what we want to preserve status against, not the latest value at
          // render time (which a ref would give us). In practice the values
          // are identical because the updater runs in the next microtask and
          // no user drop can interleave, but capturing deliberately avoids
          // a class of bugs where stale state is read inside the updater.
          return (message.artifacts as ArtifactLike[])
            .filter(isAgenticType)
            .map(a => {
              const item = artifactToKanbanItem(a);
              const meta = prevMeta.get(item.id);
              if (!meta) return item;
              // If the card is in flight (pending transition), keep the
              // optimistic status; otherwise use the backend's status.
              const status = pendingTransitions.has(item.id) ? meta.status : item.status;
              return {
                ...item,
                status,
                agentState: meta.agentState,
                lockInfo: meta.lockInfo,
                harnessResults: meta.harnessResults,
              };
            });
        });
        break;
      case 'autoAdvanceState':
        setAutoAdvance(!!message.enabled);
        break;
      case 'chatSessionState':
        setChatSessionActive(!!message.active);
        setChatSessionModel(message.model ?? undefined);
        break;
      case 'schedulerState': {
        setSchedulerState(message as SchedulerStateMessage);
        break;
      }
      case 'budgetStatus': {
        setBudgetStatus(message as BudgetStatus);
        break;
      }
      case 'goalSubmitted': {
        if (message.goalId) {
          setToast({ message: 'Goal submitted (decomposing…)', type: 'info' });
        }
        break;
      }
      case 'goalSubmitError': {
        setToast({ message: `Goal submit failed: ${message.error ?? 'unknown'}`, type: 'error' });
        break;
      }
      case 'goalReadyForReview': {
        setPendingGoal(message.goal as ProposedGoal);
        setGoalReviewOpen(true);
        setToast({ message: 'Goal decomposed — review the proposed stories', type: 'info' });
        break;
      }
      case 'circuitStatus': {
        if (message.status?.state === 'open') {
          setToast({ message: `Circuit breaker open for ${message.workflowId}`, type: 'error' });
        }
        break;
      }
      case 'goalReviewed': {
        // Decomposer finished approving stories (either auto-approved or all
        // rejected). Close the modal and refresh so new stories appear.
        setGoalReviewOpen(false);
        setPendingGoal(null);
        if (message.goal?.status === 'approved') {
          setToast({ message: `Goal approved — ${message.goal.approvedStories?.length ?? 0} story(ies) dispatched`, type: 'success' });
        } else {
          setToast({ message: 'Goal review complete (no stories approved)', type: 'info' });
        }
        break;
      }
      case 'goalDispatched': {
        // Stories were persisted + scheduler notified. Refresh board to show
        // the new artifacts in the ready-for-dev column.
        vscode.postMessage({ type: 'agenticKanban:refresh' });
        break;
      }
      case 'goalStoryPersisted': {
        // A single story was persisted (e.g. from goal decomposer).
        // Refresh the board so the new card appears.
        vscode.postMessage({ type: 'agenticKanban:refresh' });
        break;
      }
      // #24: Autonomous git events — show as informational toasts.
      case 'gitBranch': {
        if (message.branchName) {
          setToast({ message: `Branch created: ${message.branchName}`, type: 'info' });
        }
        break;
      }
      case 'gitCommit': {
        if (message.sha) {
          setToast({ message: `Committed: ${String(message.sha).slice(0, 7)}`, type: 'info' });
        }
        break;
      }
      case 'gitPR': {
        if (message.url) {
          setToast({ message: `PR created: ${message.url}`, type: 'success' });
        }
        break;
      }
      case 'terminalReconnected': {
        // Issue #35: the autonomy lifecycle restored the stream for an
        // orphaned terminal after VS Code restart / network blip. Show a
        // toast so the user knows the agent is back online, and auto-open
        // the TerminalModal so the buffered chunks become visible
        // immediately. If a modal is already open (for this artifact or
        // another), skip the auto-open so the modal's own `terminalReconnected`
        // listener handles the state — we don't want to throwaway whatever
        // the user is currently looking at.
        const name = message.terminalName ?? message.sessionId ?? 'terminal';
        const chunks = typeof message.bufferedData === 'string' ? message.bufferedData : '';
        if (!terminalModal && message.artifactId && chunks.length > 0) {
          setTerminalModal({ artifactId: message.artifactId, artifactTitle: name });
        }
        setToast({ message: `Terminal reconnected: ${name}`, type: 'success' });
        break;
      }
      case 'systemicIssue': {
        // Cross-artifact harness pattern detected — display as a dismissable
        // banner in the AutonomyBar (issue #4).
        setSystemicIssue(message as SystemicIssue);
        break;
      }
      case 'traceBreakdownResponse': {
        // Audit follow-up to gap #20/#42 — per-workflow tool-call aggregation
        // for the most recent Kanban autonomous-loop run window. Drives the
        // Trace panel below AutonomyBar.
        setTraceBreakdown(message as TraceBreakdownMessage);
        break;
      }
      case 'kanban:wipLimits':
        // An empty object `{}` from settings means "no limits" — replace
        // defaults entirely. A falsy/missing payload preserves existing state.
        if (message.limits && typeof message.limits === 'object') {
          setWipLimits(message.limits as Record<string, number>);
        }
        break;
      case 'updateDependencyBadges': {
        // Replace the badge map with the latest snapshot from the extension.
        // An empty badges array means "no stories are currently blocked", so
        // we clear the map (rather than leave stale entries on cards that
        // were unblocked by a status change).
        const incoming: DependencyBadge[] = Array.isArray(message.badges) ? message.badges : [];
        setDepBadges(new Map(incoming.map(b => [b.id, b])));
        break;
      }
      case 'agentStateUpdated': {
        const incomingStatus = message.agentState?.status;
        if (incomingStatus === 'completed' || incomingStatus === 'failed' || incomingStatus === 'interrupted') {
          agentInfoCache.current.delete(message.artifactId);
        }
        setResumingArtifactId(prev => prev === message.artifactId ? null : prev);
        setPendingTransitions(prev => {
          if (!prev.has(message.artifactId)) return prev;
          const next = new Set(prev);
          next.delete(message.artifactId);
          return next;
        });
        setItems(prev => prev.map(item =>
          item.id === message.artifactId
            ? { ...item, agentState: message.agentState, lockInfo: message.lockInfo }
            : item
        ));
        break;
      }
      case 'transitionResult': {
        setPendingTransitions(prev => {
          const next = new Set(prev);
          next.delete(message.artifactId);
          const batch = pendingBatch.current;
          if (batch && batch.ids.has(message.artifactId)) {
            batch.ids.delete(message.artifactId);
            if (batch.ids.size === 0) {
              const statusLabel = batch.targetStatus.replace(/-/g, ' ');
              const batchUndo = batch.undoData;
              queueMicrotask(() => {
                setToast({
                  message: `Moved ${batch.count} cards to ${statusLabel}`,
                  type: 'success',
                  undoTransition: batchUndo.length >= 1
                    ? {
                        artifactId: batchUndo[0].id,
                        fromStatus: batchUndo[0].fromStatus,
                        toStatus: batchUndo[0].toStatus,
                        artifactType: batchUndo[0].artifactType,
                      }
                    : undefined,
                });
                pendingBatch.current = null;
              });
            }
          }
          return next;
        });
        if (!message.ok) {
          const original = preDropStatus.current.get(message.artifactId);
          const triedTarget = lastDroppedTarget.current.get(message.artifactId);
          if (original !== undefined) {
            setItems(prev => prev.map(i => {
              if (i.id !== message.artifactId) return i;
              if (triedTarget !== undefined && i.status !== triedTarget) return i;
              return { ...i, status: original };
            }));
          }
          setToast({
            message: `Transition failed: ${(message.blockedBy as string[])?.join(', ') ?? 'unknown reason'}`,
            type: 'error',
          });
        } else if (message.status === 'moved_without_workflow') {
          setToast({ message: 'Card moved. No workflow run.', type: 'info' });
        } else {
          const from = preDropStatus.current.get(message.artifactId);
          const to = lastDroppedTarget.current.get(message.artifactId);
          const dropType = preDropType.current.get(message.artifactId);
          if (from && to) {
            setToast({
              message: `Moved to ${to.replace(/-/g, ' ')}`,
              type: 'success',
              undoTransition: {
                artifactId: message.artifactId,
                fromStatus: to,
                toStatus: from,
                artifactType: dropType ?? 'unknown',
              },
            });
          }
        }
        preDropStatus.current.delete(message.artifactId);
        lastDroppedTarget.current.delete(message.artifactId);
        preDropType.current.delete(message.artifactId);
        break;
      }
    }
  });

  // ── Listen for messages from extension ────────────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => onMessage(event.data);
    window.addEventListener('message', handler);

    const timeout = setTimeout(() => setLoading(false), 5_000);

    if (!initialArtifacts) {
      vscode.postMessage({ type: 'agenticKanbanReady' });
    }
    vscode.postMessage({ type: 'kanban:getAutoAdvance' });
    // Issue #22: pull autonomy state on mount so the bar isn't empty
    vscode.postMessage({ type: 'getSchedulerState' });
    vscode.postMessage({ type: 'getBudgetStatus' });
    // Audit follow-up to gap #20/#42: pull the per-workflow trace breakdown
    // for the most recent Kanban run so the Trace panel isn't empty on load.
    vscode.postMessage({ type: 'getTraceBreakdown' });

    return () => {
      window.removeEventListener('message', handler);
      clearTimeout(timeout);
    };
  }, [initialArtifacts, onMessage]);

  // ── Auto-refresh Trace breakdown on scheduler state boundaries ───────────
  // When the scheduler transitions into 'running' or 'idle' (start-of-loop and
  // end-of-loop boundaries respectively), re-pull the trace breakdown so the
  // panel reflects the new run window without manual refresh.
  // Pause/resume don't trigger because the trace window is unchanged (the
  // loop keeps accumulating entries while paused). The very first state update
  // (null → first state) is skipped because the mount-pull already requested
  // `getTraceBreakdown` for the initial render — posting it again would be a
  // wasted round-trip to the extension.
  const prevSchedulerStateRef = useRef<'idle' | 'paused' | 'running' | null>(null);
  useEffect(() => {
    const currentState = schedulerState?.state ?? null;
    const prevState = prevSchedulerStateRef.current;
    prevSchedulerStateRef.current = currentState;
    if (prevState === null) return;            // skip initial-mount transition
    if (currentState === prevState) return;    // skip no-op re-renders
    if (currentState === 'running' || currentState === 'idle') {
      vscode.postMessage({ type: 'getTraceBreakdown' });
    }
  }, [schedulerState?.state]);

  // ── `/` focuses the search input (avoids VS Code's Ctrl+F conflict) ──────
  // Ctrl+F is owned by VS Code (Find in Files). Using `/` matches the
  // convention of GitHub, Jira, and most editors.
  const handleSearchShortcut = useEvent((e: KeyboardEvent) => {
    // Don't hijack / when the user is typing in an input/textarea, and
    // also skip during IME composition (CJK keyboards use / as a switch
    // key) — `keyCode === 229` is the legacy IME-input indicator.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === '/') {
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  });
  useEffect(() => {
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, [handleSearchShortcut]);

  // ── Auto-dismiss toast ────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Derived: enriched items + search dimming ──────────────────────────────
  const { displayItems, dimmedIds } = useMemo<{ displayItems: KanbanItem[]; dimmedIds: Set<string> }>(() => {
    const enriched: KanbanItem[] = items.map(item => {
      const queued = pendingTransitions.has(item.id)
        ? { ...item, agentState: { ...item.agentState, status: 'queued' as const, agentRole: item.agentState?.agentRole } }
        : item;
      // Merge dep badges from the extension's autonomy lifecycle into the
      // card so the KanbanCard "Blocked by N" badge stays in sync with the
      // live dependency graph. Cards without a badge entry show no badge.
      const badge = depBadges.get(item.id);
      if (!badge) return queued;
      return {
        ...queued,
        blockedBy: badge.blockedBy,
        hasCycle: badge.hasCycle,
        blockerTitles: badge.blockerTitles,
      };
    });
    const dimmed = new Set<string>();
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      for (const item of enriched) {
        const matches = item.title.toLowerCase().includes(q) ||
          (item.epicKey ?? '').toLowerCase().includes(q) ||
          item.status.toLowerCase().includes(q);
        if (!matches) dimmed.add(item.id);
      }
    }
    return { displayItems: enriched, dimmedIds: dimmed };
  }, [items, pendingTransitions, searchQuery, depBadges]);

  const epicIdsWithChildren = useMemo(() => {
    const ids = new Set<string>();
    for (const item of displayItems) {
      if (item.epicKey && item.type === 'story') ids.add(item.epicKey);
    }
    return ids;
  }, [displayItems]);

  // ── Grouped items by column (with epic grouping + sort) ───────────────────
  const groupedItems = useMemo(() => {
    const epicToChildren = new Map<string, KanbanItem[]>();
    for (const item of displayItems) {
      if (item.epicKey && item.type === 'story') {
        const children = epicToChildren.get(item.epicKey) || [];
        children.push(item);
        epicToChildren.set(item.epicKey, children);
      }
    }

    const sorted = [...displayItems].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      if (sortBy === 'type') return a.type.localeCompare(b.type);
      if (sortBy === 'priority') {
        const pa = PRIORITY_ORDER[a.priority ?? ''] ?? 99;
        const pb = PRIORITY_ORDER[b.priority ?? ''] ?? 99;
        if (pa !== pb) return pa - pb;
        // Same priority → fall back to title
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    const groups = new Map<KanbanColumnKey, KanbanItem[]>();
    KANBAN_COLUMNS.forEach(c => groups.set(c.key, []));
    const placedChildren = new Set<string>();

    for (const item of sorted) {
      const col = normalizeToKanbanColumn(item.status);
      const columnItems = groups.get(col)!;

      if (item.epicKey && item.type === 'story' && expandedEpics.has(item.epicKey)) {
        const parentEpic = sorted.find(e => e.id === item.epicKey && e.isEpic);
        if (parentEpic && normalizeToKanbanColumn(parentEpic.status) === col) {
          placedChildren.add(item.id);
          continue;
        }
      }
      columnItems.push(item);
    }

    for (const [colKey, columnItems] of groups) {
      const result: KanbanItem[] = [];
      for (const item of columnItems) {
        result.push(item);
        if (item.isEpic && expandedEpics.has(item.id)) {
          const children = epicToChildren.get(item.id) || [];
          const childrenInThisColumn = children
            .filter(c => placedChildren.has(c.id) && normalizeToKanbanColumn(c.status) === colKey)
            .sort((a, b) => a.title.localeCompare(b.title));
          for (const child of childrenInThisColumn) {
            result.push({ ...child, isChild: true });
          }
        }
      }
      groups.set(colKey, result);
    }

    return groups;
  }, [displayItems, sortBy, expandedEpics]);

  // ── DnD: Drop handler with WIP enforcement, batch move, rollback tracking ─
  // useEvent: stable identity, reads current `items`/`wipLimits`/`groupedItems`
  // at call time. Eliminates the previous itemsRef/wipLimitsRef/groupedItemsRef.
  const handleDrop = useEvent((itemId: string, targetColumn: KanbanColumnKey) => {
    const ids = itemId.includes(',') ? itemId.split(',') : [itemId];
    // For the default workflow, column keys and status strings are 1:1.
    const targetStatus = targetColumn;

    // WIP enforcement (reads live state — no ref needed with useEvent).
    const wipLimit = wipLimits[targetColumn];
    if (wipLimit !== undefined) {
      const currentCount = (groupedItems.get(targetColumn) ?? []).length;
      const newIds = ids.filter(id => {
        const it = items.find(i => i.id === id);
        return it && normalizeToKanbanColumn(it.status) !== targetColumn;
      });
      if (currentCount + newIds.length > wipLimit) {
        setToast({ message: `WIP limit: max ${wipLimit} cards in ${targetColumn.replace(/-/g, ' ')}`, type: 'error' });
        return;
      }
    }

    const targetIdx = KANBAN_ORDER.indexOf(targetColumn);
    const movedIds: string[] = [];

    for (const id of ids) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      if (item.status === targetStatus) continue;

      movedIds.push(id);
      preDropStatus.current.set(id, item.status);
      lastDroppedTarget.current.set(id, targetStatus);
      preDropType.current.set(id, item.type);

      vscode.postMessage({
        type: 'kanban:statusChanged',
        artifactId: id,
        fromStatus: item.status,
        toStatus: targetStatus,
        artifactType: item.type,
      });
    }

    setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, status: targetStatus } : i));
    setPendingTransitions(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });

    if (movedIds.length > 1) {
      const undoData = movedIds.map(id => {
        const item = items.find(i => i.id === id);
        const from = item ? item.status : (preDropStatus.current.get(id) ?? '');
        return {
          id,
          fromStatus: targetStatus,
          toStatus: from,
          artifactType: preDropType.current.get(id) ?? 'unknown',
        };
      });
      pendingBatch.current = { ids: new Set(movedIds), count: movedIds.length, targetColumn, targetStatus, undoData };
      setTimeout(() => {
        if (pendingBatch.current && pendingBatch.current.ids.size > 0) {
          pendingBatch.current = null;
        }
      }, BATCH_STUCK_TIMEOUT_MS);
    }

    setSelectedIds(new Set());
    setAnchorId(null);

    if (movedIds.length === 1) {
      const item = items.find(i => i.id === movedIds[0]);
      if (item) {
        const currentIdx = KANBAN_ORDER.indexOf(normalizeToKanbanColumn(item.status));
        if (currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx) {
          setToast({ message: `Moved backward to ${targetColumn.replace(/-/g, ' ')}`, type: 'info' });
        }
      }
    }
  });

  // ── Card click: shift range, ctrl toggle, plain select ──────────────────
  // Unified selection model: a single Set is the source of truth. The detail
  // panel follows automatically (derived from selectedIds.size === 1).
  const handleCardClick = useEvent((item: KanbanItem, e?: React.MouseEvent) => {
    const ctrlOrMeta = e?.ctrlKey || e?.metaKey;
    const shift = e?.shiftKey;

    if (shift && anchorId) {
      const allIds = displayItems.map(i => i.id);
      const lastIdx = allIds.indexOf(anchorId);
      const curIdx = allIds.indexOf(item.id);
      if (lastIdx >= 0 && curIdx >= 0) {
        const [from, to] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        const rangeIds = new Set(allIds.slice(from, to + 1));
        setSelectedIds(prev => {
          const next = new Set(prev);
          rangeIds.forEach(id => next.add(id));
          return next;
        });
        setAnchorId(item.id);
        return;
      }
    }

    if (ctrlOrMeta) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (prev.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      setAnchorId(item.id);
      return;
    }

    // Plain click: replace selection with this single id. Detail panel opens
    // automatically because selectedIds.size === 1.
    setSelectedIds(new Set([item.id]));
    setAnchorId(item.id);
  });

  // ── Keyboard nav: ←/→ moves selected (incl. multi-select) between columns ─
  const handleKeyDown = useEvent((e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    // Skip during IME composition (CJK keyboards route many keys through
    // the IME — keyCode 229 is the legacy indicator; isComposing is modern).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    // anchorId is set on every click (plain, ctrl, shift). It's the single
    // source of truth for the "active card" in keyboard nav. We don't fall
    // back to selectedIds because a user can only multi-select via shift-
    // range, and shift-range always updates the anchor.
    const activeId = anchorId;
    if (!activeId) return;
    const item = items.find(i => i.id === activeId);
    if (!item) return;
    const currentIdx = KANBAN_ORDER.indexOf(normalizeToKanbanColumn(item.status));

    if (e.key === 'ArrowLeft' && currentIdx > 0) {
      e.preventDefault();
      const idsToMove = selectedIds.size > 1 ? Array.from(selectedIds).join(',') : activeId;
      handleDrop(idsToMove, KANBAN_ORDER[currentIdx - 1]);
    } else if (e.key === 'ArrowRight' && currentIdx < KANBAN_ORDER.length - 1) {
      e.preventDefault();
      const idsToMove = selectedIds.size > 1 ? Array.from(selectedIds).join(',') : activeId;
      handleDrop(idsToMove, KANBAN_ORDER[currentIdx + 1]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSelectedIds(new Set());
      setAnchorId(null);
    } else if (e.key === 'F2' && !editingId) {
      e.preventDefault();
      setEditingId(item.id);
    } else if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && selectedIds.size >= 1) {
      // Keyboard-equivalent of right-click: open the context menu for the
      // active card. Position near the card if we can find it, else center.
      e.preventDefault();
      const cardEl = document.querySelector(`[data-kanban-card-id="${activeId}"]`) as HTMLElement | null;
      const rect = cardEl?.getBoundingClientRect();
      const x = rect ? rect.left + 16 : window.innerWidth / 2;
      const y = rect ? rect.bottom : window.innerHeight / 2;
      setContextMenu({ x, y, item, focusIndex: 0 });
    }
  });

  // ── Inline-edit handlers ──────────────────────────────────────────────────
  const handleStartEdit = useEvent((item: KanbanItem) => setEditingId(item.id));
  const handleCancelEdit = useEvent(() => setEditingId(null));
  const handleSubmitEdit = useEvent((artifactId: string, newTitle: string) => {
    setEditingId(null);
    setItems(prev => prev.map(i => i.id === artifactId ? { ...i, title: newTitle } : i));
    vscode.postMessage({ type: 'kanban:updateArtifactTitle', artifactId, title: newTitle });
  });

  // ── Toolbar / toast handlers (useEvent) ──────────────────────────────────
  // Trivial one-liners and the toast undo. Captured here for stable identity
  // and consistency with the rest of the file.

  const handleClearSearch = useEvent(() => setSearchQuery(''));
  const handleOpenTraceViewer = useEvent(() => vscode.postMessage({ type: 'openTraceViewer' }));
  const handleRefreshBoard = useEvent(() => vscode.postMessage({ type: 'agenticKanban:refresh' }));

  // Per-column right-click: open the context menu for the right-clicked card.
  // Hoisted out of the KanbanColumn JSX so the handler has stable identity
  // across re-renders (and so future changes have one place to edit).
  const handleColumnContextMenu = useEvent((e: React.MouseEvent, item: KanbanItem) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item, focusIndex: 0 });
  });

  // Toast undo: reverts the dropped card to its previous column and re-posts
  // the status change. Captures multiple refs and setters from the closure.
  const handleToastUndo = useEvent(() => {
    if (!toast?.undoTransition) return;
    const { artifactId, fromStatus, toStatus, artifactType } = toast.undoTransition;
    setItems(prev => prev.map(i =>
      i.id === artifactId ? { ...i, status: toStatus } : i
    ));
    setPendingTransitions(prev => new Set(prev).add(artifactId));
    preDropStatus.current.set(artifactId, fromStatus);
    lastDroppedTarget.current.set(artifactId, toStatus);
    preDropType.current.set(artifactId, artifactType);
    vscode.postMessage({ type: 'kanban:statusChanged', artifactId, fromStatus, toStatus, artifactType });
    setToast(null);
  });

  const selectedItem = useMemo(
    () => (detailOpenId ? displayItems.find(i => i.id === detailOpenId) : undefined),
    [detailOpenId, displayItems],
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="agentic-kanban">
        <header className="agentic-kanban-header">
          <h2>Agentic Execution Board</h2>
        </header>
        <div className="kanban-skeleton-board" role="status" aria-busy="true" aria-label="Loading kanban board">
          {KANBAN_COLUMNS.map(col => (
            <div key={col.key} className="kanban-skeleton-column" style={{ borderTopColor: col.accent }}>
              <div className="kanban-skeleton-header">
                <div className="kanban-skeleton-label" />
                <div className="kanban-skeleton-count" />
              </div>
              {SKELETON_CARDS.map((card, i) => (
                <div key={i} className="kanban-skeleton-card">
                  {card.lines.map((w, j) => (
                    <div key={j} className={`kanban-skeleton-line kanban-skeleton-line--${w}`} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="agentic-kanban" onKeyDown={handleKeyDown}>
      <header className="agentic-kanban-header">
        <h2>Agentic Execution Board</h2>
        <div className="agentic-kanban-toolbar">
          <input
            ref={searchInputRef}
            className="agentic-kanban-search"
            type="text"
            placeholder="Press / to filter…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Filter cards by title, epic, or status"
            aria-keyshortcuts="/"
            style={{
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px',
              width: '140px',
            }}
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              style={{ background: 'transparent', color: 'var(--vscode-descriptionForeground)', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '4px 6px' }}
              aria-label="Clear filter"
              title="Clear filter"
            >
              ✕
            </button>
          )}
          <select
            className="agentic-kanban-sort"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'title' | 'status' | 'type' | 'priority')}
            title="Sort cards within columns"
            aria-label="Sort cards"
          >
            <option value="title">By Title</option>
            <option value="status">By Status</option>
            <option value="type">By Type</option>
            <option value="priority">By Priority</option>
          </select>
          <label
            className="agentic-kanban-autoadvance"
            title="ON: dropping into In-Progress runs the implement→review→done loop. With YOLO mode on, the per-drop confirm is also skipped."
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}
          >
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => {
                const next = e.target.checked;
                setAutoAdvance(next);
                vscode.postMessage({ type: 'kanban:setAutoAdvance', enabled: next });
              }}
            />
            Auto-advance
          </label>
          <button onClick={handleOpenTraceViewer}>
            View Traces
          </button>
          <button onClick={handleRefreshBoard}>
            Refresh
          </button>
        </div>
      </header>

      <AutonomyBar
        schedulerState={schedulerState}
        budgetStatus={budgetStatus}
        pendingGoal={pendingGoal}
        onOpenGoalReview={() => setGoalReviewOpen(true)}
        systemicIssue={systemicIssue}
        onDismissSystemicIssue={() => setSystemicIssue(null)}
      />

      <TracePanel breakdown={traceBreakdown} />

      <div className="agentic-kanban-board">
        {KANBAN_COLUMNS.map(col => (
          <KanbanColumn
            key={col.key}
            column={col}
            items={groupedItems.get(col.key) ?? []}
            draggable={true}
            onDrop={handleDrop}
            onCardClick={handleCardClick}
            resumingArtifactId={resumingArtifactId}
            dimmedIds={dimmedIds}
            emptyText={EMPTY_TEXT[col.key]}
            wipLimit={wipLimits[col.key]}
            expandedEpics={expandedEpics}
            onToggleEpic={(epicId) => setExpandedEpics(prev => {
              const next = new Set(prev);
              next.has(epicId) ? next.delete(epicId) : next.add(epicId);
              return next;
            })}
            epicIdsWithChildren={epicIdsWithChildren}
            onContextMenu={handleColumnContextMenu}
            selectedIds={selectedIds}
            editingId={editingId}
            onStartEdit={handleStartEdit}
            onSubmitEdit={handleSubmitEdit}
            onCancelEdit={handleCancelEdit}
          />
        ))}
      </div>

      {selectedItem && (
        <AgenticDetailPanel
          item={selectedItem}
          onClose={() => { setSelectedIds(new Set()); setAnchorId(null); }}
          onOpenTerminal={(item) => setTerminalModal({ artifactId: item.id, artifactTitle: item.title })}
          infoCache={agentInfoCache}
          resumingArtifactId={resumingArtifactId}
          onResumeStateChange={setResumingArtifactId}
          chatSessionActive={chatSessionActive}
          chatSessionModel={chatSessionModel}
        />
      )}

      {/* Toast — role="status" implies aria-live="polite" + aria-atomic="true" for screen reader announcement. */}
      {toast && (
        <div className={`kanban-toast kanban-toast--${toast.type}`} role="status">
          <span>{toast.message}</span>
          {toast.undoTransition && (
            <button
              className="kanban-toast-undo-btn"
              onClick={handleToastUndo}
            >
              Undo
            </button>
          )}
        </div>
      )}

      {terminalModal && (
        <TerminalModal
          artifactId={terminalModal.artifactId}
          artifactTitle={terminalModal.artifactTitle}
          onClose={() => {
            vscode.postMessage({ type: 'kanban:closeTerminal', artifactId: terminalModal.artifactId });
            setTerminalModal(null);
          }}
        />
      )}

      {goalReviewOpen && pendingGoal && (
        <GoalDecomposerModal
          goal={pendingGoal}
          onClose={() => {
            setGoalReviewOpen(false);
            setPendingGoal(null);
          }}
        />
      )}

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpenDetail={() => { handleCardClick(contextMenu.item); setContextMenu(null); }}
          onMoveBacklog={() => { handleDrop(contextMenu.item.id, 'backlog'); setContextMenu(null); }}
          onMoveDone={() => { handleDrop(contextMenu.item.id, 'done'); setContextMenu(null); }}
          onViewTrace={contextMenu.item.agentState?.sessionId
            ? () => { vscode.postMessage({ type: 'kanban:viewTrace', sessionId: contextMenu.item.agentState!.sessionId }); setContextMenu(null); }
            : undefined}
          onJumpToTerminal={contextMenu.item.agentState?.terminalId
            ? () => { vscode.postMessage({ type: 'kanban:jumpToTerminal', artifactId: contextMenu.item.id }); setContextMenu(null); }
            : undefined}
        />
      )}
    </div>
  );
}

