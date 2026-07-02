import { Component, useState, useEffect, useMemo, useRef } from 'react';
import { useEvent } from './agentic-kanban/useEvent';
import type { ErrorInfo, ReactNode } from 'react';
import { Canvas } from './components/Canvas';
import type { LayoutMode } from './components/Canvas';
import { AICursor } from './components/AICursor';
import { Toolbar } from './components/Toolbar';
import { DetailPanel } from './components/DetailPanel';
import { ElicitationPicker } from './components/ElicitationPicker';
import { WorkflowLauncher } from './components/WorkflowLauncher';
import { HelpModal } from './components/HelpModal';
import { AskModal } from './components/AskModal';
import { JiraModal } from './components/JiraModal';
import { GraphifyModal } from './components/GraphifyModal';
import { SprintPlanningView, parseSprintStatusYaml } from './components/SprintPlanningView';
import type { SprintData } from './components/SprintPlanningView';
import { AgenticKanbanApp } from './agentic-kanban/AgenticKanbanApp';
import { AgentSessionsPanel } from './components/AgentSessionsPanel';
import { VisualPlanApp } from './visual-plan/VisualPlanApp';
import { VisualPlanModal } from './visual-plan/VisualPlanModal';
import type { VisualPlan as VisualPlanData } from './visual-plan/types';
import { SearchBox } from './components/SearchBox';
import { CatalogueModal } from './components/CatalogueModal';
import { ProviderSelector } from './components/ProviderSelector';
import { Icon } from './components/Icon';
import { IdeasDrawer } from './components/IdeasDrawer';
import { vscode } from './vscodeApi';
import type { Artifact, AICursorState, ElicitationMethod, BmmWorkflow, Idea } from './types';

// Read injected mode/id globals (set by the extension for detail-tab mode)
// The extension injects <script>window.__AC_MODE__='detail'; window.__AC_DETAIL_ID__='...';</script>
const AC_MODE: string = (window as unknown as Record<string, string>).__AC_MODE__ || '';
const AC_DETAIL_ID: string = (window as unknown as Record<string, string>).__AC_DETAIL_ID__ || '';

// ==========================================================================
// ERROR BOUNDARY — catches render errors and shows a recovery UI instead
// of a white screen.  Required to be a class component by React.
// ==========================================================================

interface EBState { error: Error | null; info: ErrorInfo | null }

class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, EBState> {
  state: EBState = { error: null, info: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary-fallback" style={{ padding: '16px', color: 'var(--vscode-errorForeground, #f44)', fontSize: '13px' }}>
          <h4 style={{ margin: '0 0 8px' }}>Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}</h4>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.85, fontSize: '12px' }}>
            {this.state.error.message}
          </pre>
          <button
            style={{ marginTop: '8px', cursor: 'pointer' }}
            className="btn btn-secondary btn-small"
            onClick={() => this.setState({ error: null, info: null })}
          >
            Dismiss &amp; retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [aiCursor, setAiCursor] = useState<AICursorState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState<boolean>(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Per-category expansion: parentId → Set of expanded badge labels
  const [expandedCategories, setExpandedCategories] = useState<Map<string, Set<string>>>(new Map());
  const [error] = useState<string | null>(null);
  const [externalChange, setExternalChange] = useState<{ filePath: string; count: number } | null>(null);
  const [reloadRequested, setReloadRequested] = useState<boolean>(false);
  const [needsReload, setNeedsReload] = useState<boolean>(false);
  
  // Elicitation picker state
  const [elicitationMethods, setElicitationMethods] = useState<ElicitationMethod[]>([]);
  const [elicitPickerOpen, setElicitPickerOpen] = useState<boolean>(false);
  const [elicitTarget, setElicitTarget] = useState<Artifact | null>(null);

  // Workflow launcher state
  const [bmmWorkflows, setBmmWorkflows] = useState<BmmWorkflow[]>([]);
  const [workflowLauncherOpen, setWorkflowLauncherOpen] = useState<boolean>(false);
  
  // Help modal state
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  
  // Ask modal state
  const [askOpen, setAskOpen] = useState<boolean>(false);

  // Sprint planning view state
  const [showSprintView, setShowSprintView] = useState<boolean>(false);
  const [sprintData, setSprintData] = useState<SprintData>({ found: false });

  // Jira modal state
  const [jiraModalOpen, setJiraModalOpen] = useState<boolean>(false);

  // Graphify modal state
  const [graphifyModalOpen, setGraphifyModalOpen] = useState<boolean>(false);
  const [graphifyReady, setGraphifyReady] = useState<boolean>(false);

  // Skill Catalogue modal state
  const [catalogueOpen, setCatalogueOpen] = useState<boolean>(false);
  
  // Kanban toggle: show agentic execution board in the main canvas area
  const [showKanban, setShowKanban] = useState<boolean>(false);

  const handleToggleKanban = useEvent(() => {
    setShowKanban(prev => !prev);
  });

  // Canvas search state (SearchBox rendered in App, to the left of workflow FAB)
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string>>(new Set());
  
  // Detected project count (for switch button visibility)
  const [, setDetectedProjectCount] = useState<number>(0);

  // Active folder name (sent by extension alongside artifacts)
  const [activeFolderName, setActiveFolderName] = useState<string>('');
  
  
  // Force edit mode when a new artifact is created
  const [forceEditMode, setForceEditMode] = useState<boolean>(false);

  // Canvas screenshot capture state (triggered by extension message)
  const [screenshotTrigger, setScreenshotTrigger] = useState<number>(0);
  const [screenshotFormat, setScreenshotFormat] = useState<'png' | 'pdf'>('png');

  // Schema validation errors surfaced from extension on save
  const [validationErrors, setValidationErrors] = useState<{ artifactType: string; artifactId: string; errors: string[] } | null>(null);

  // Ideas drawer state — simple, lightweight, independent from BMAD artifact flow
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [ideasFocus, setIdeasFocus] = useState<'capture' | 'list' | undefined>(undefined);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideasArchived, setIdeasArchived] = useState<Idea[]>([]);
  const [ideasProjectReady, setIdeasProjectReady] = useState<boolean>(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);

  // Schema issues detected on project load (files that don't match expected schemas)
  const [schemaIssues, setSchemaIssues] = useState<{ file: string; type: string; errors: string[] }[]>([]);
  const [schemaFixing, setSchemaFixing] = useState<boolean>(false);
  const [schemaFixMessage, setSchemaFixMessage] = useState<string | null>(null);
  const [schemaValidating, setSchemaValidating] = useState<boolean>(false);
  const [schemaValidateSuccess, setSchemaValidateSuccess] = useState<boolean | null>(null);

  // Sprint status mismatches state removed — statuses now come directly from epic/story JSON files.

  // Ref for schema-related toast timeouts so they can be cleaned up on unmount.
  // This is genuine timer-management (not a stale-closure workaround): the
  // setTimeout ID persists across renders so the unmount cleanup and the
  // successive setSchemaFixMessage calls can cancel any in-flight timer.
  const schemaToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unsaved changes protection: track whether the detail panel has dirty edits
  const [detailPanelDirty, setDetailPanelDirty] = useState<boolean>(false);
  // When user tries to navigate away from a dirty panel, store the pending action
  const [pendingNavigation, setPendingNavigation] = useState<{ type: 'select' | 'open' | 'selectAndEdit'; id: string } | null>(null);

  // Theme override: null = follow VS Code, 'light' or 'dark' = forced
  const [themeOverride, setThemeOverride] = useState<'light' | 'dark' | null>(() => {
    try {
      const saved = (vscode.getState() as Record<string, unknown>)?.themeOverride;
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) { /* ignore */ }
    return null;
  });

  // Apply/remove forced theme class on body whenever themeOverride changes
  useEffect(() => {
    const body = document.body;
    body.classList.remove('ac-force-light', 'ac-force-dark');
    if (themeOverride === 'light') body.classList.add('ac-force-light');
    if (themeOverride === 'dark') body.classList.add('ac-force-dark');
    try {
      const current = (vscode.getState() as Record<string, unknown>) ?? {};
      vscode.setState({ ...current, themeOverride: themeOverride ?? undefined });
    } catch (_) { /* ignore */ }
  }, [themeOverride]);

  const handleToggleTheme = useEvent(() => {
    setThemeOverride(prev => {
      // Cycle: null → detect current VS Code theme to decide which to force
      if (prev === null) {
        // If body currently has vscode-light, force dark; otherwise force light
        return document.body.classList.contains('vscode-light') ? 'dark' : 'light';
      }
      if (prev === 'light') return 'dark';
      return null; // dark → back to auto
    });
  });

  // ── Canvas view (zoom + pan) persistence — PER LAYOUT MODE ───────────────
  // Each of `lanes | mindmap | corpus3d` remembers its own view so panning
  // the mindmap doesn't clobber the lanes view (and vice versa). Storage
  // shape is `canvasViewByMode: Record<LayoutMode, {zoom, pan}>`.
  //
  // Backwards compat: legacy persistence wrote a single `canvasView` blob
  // shared across all modes. On first mount after upgrade, we do PER-SLOT
  // hydration: each slot reads its own entry from the new `canvasViewByMode`
  // map if valid, else falls back to the legacy single-blob value if valid,
  // else defaults. This means a corrupt partial upgrade (e.g. the user
  // crashed mid-write so only `lanes` made it into `canvasViewByMode`)
  // doesn't lose the surviving valid entries. The modes will diverge
  // naturally once the user re-enters each layout and pans around.
  const makeDefaultView = (): { zoom: number; pan: { x: number; y: number } } => ({ zoom: 1, pan: { x: 0, y: 0 } });

  function readView(value: unknown): { zoom: number; pan: { x: number; y: number } } | null {
    if (!value || typeof value !== 'object') return null;
    const z = (value as { zoom?: unknown }).zoom;
    const p = (value as { pan?: { x?: unknown; y?: unknown } }).pan;
    if (typeof z !== 'number' || z < 0.25 || z > 2) return null;
    if (!p || typeof p !== 'object') return null;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    return { zoom: z, pan: { x: p.x, y: p.y } };
  }

  const [canvasViewByMode, setCanvasViewByMode] = useState<Record<LayoutMode, { zoom: number; pan: { x: number; y: number } }>>(() => {
    try {
      const saved = (vscode.getState() as Record<string, unknown>) ?? {};
      const byMode = saved.canvasViewByMode as Record<string, unknown> | undefined;
      const legacy = readView(saved.canvasView);
      // Per-slot: per-mode entry first, then legacy for upgrades, then default.
      const slot = (k: LayoutMode) =>
        readView(byMode?.[k as string]) ?? legacy ?? makeDefaultView();
      return {
        lanes: slot('lanes'),
        mindmap: slot('mindmap'),
        corpus3d: slot('corpus3d'),
      };
    } catch (_) { /* ignore */ }
    return {
      lanes: makeDefaultView(),
      mindmap: makeDefaultView(),
      corpus3d: makeDefaultView(),
    };
  });

  // Stable identity (useEvent) so Canvas's effect doesn't tear down on every
  // App render. Writes to vscode.setState on every (zoom, pan) change so
  // the view survives reload.
  //
  // Performance: `vscode.setState` is a synchronous IPC round-trip to the
  // extension host; drag-pan fires 60+ Hz pointermove ticks, so a naive write
  // here floods the IPC channel.  We update the React state synchronously
  // (so the in-canvas view stays responsive) but DEBOUNCE the host write
  // to a 150 ms trailing-edge flush — coalesces 60+ Hz drag into one write
  // per gesture.  We stash the latest (zoom, pan) WITH its owning mode in a
  // ref so the flush can route the write to the correct per-mode slot, and
  // so the unmount path can actually flush a pending write rather than
  // cancel it (otherwise the last 150 ms of drag distance would be silently
  // lost on a quick tab switch / webview reload).
  //
  // The `mode` argument comes from Canvas itself instead of being read from
  // a closure — this avoids any race with App's own layoutMode state being
  // out-of-sync with Canvas's internal mode when handleExitMindmapMode (or
  // any in-Canvas mode+view update) batches the change in a single commit.
  // Closing the race here removes the need for useLayoutEffect swaps and
  // component-remount keys; Canvas keeps its local state (filters, focus
  // mode, expandedStoryIds, etc.) across layout-mode switches.
  type PendingView = { mode: LayoutMode; zoom: number; pan: { x: number; y: number } };
  const canvasViewPendingRef = useRef<PendingView | null>(null);
  const canvasViewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushCanvasView = () => {
    if (!canvasViewPendingRef.current) return;
    const { mode, zoom, pan } = canvasViewPendingRef.current;
    try {
      const current = (vscode.getState() as Record<string, unknown>) ?? {};
      const existing = (current.canvasViewByMode as Record<string, { zoom: number; pan: { x: number; y: number } }> | undefined) ?? {};
      vscode.setState({
        ...current,
        canvasViewByMode: { ...existing, [mode]: { zoom, pan } },
      });
    } catch (_) { /* ignore */ }
    canvasViewPendingRef.current = null;
  };
  const handleCanvasViewChange = useEvent((mode: LayoutMode, zoom: number, pan: { x: number; y: number }) => {
    // No-op echo suppression: skip the IPC write when incoming
    // (zoom, pan) matches the slot we already know for this mode. This
    // absorbs: (a) the mount-time seed echo where Canvas's [zoom, pan]
    // effect re-fires the value it was just rendered with; (b) the mode
    // re-sync echo where the [initialCanvasView, layoutMode] resync
    // effect overwrites local zoom/pan and the [zoom, pan] observer
    // fires once more. The slot-reflection is safe to rely on because
    // every prior non-suppressed write to canvasViewByMode[...] happened
    // synchronously inside this handler — state stays in lockstep with
    // whatever pending / persisted values exist for `mode`.
    const slot = canvasViewByMode[mode];
    if (slot.zoom === zoom && slot.pan.x === pan.x && slot.pan.y === pan.y) {
      return;
    }
    setCanvasViewByMode(prev => ({ ...prev, [mode]: { zoom, pan } }));
    canvasViewPendingRef.current = { mode, zoom, pan };
    if (canvasViewDebounceRef.current) clearTimeout(canvasViewDebounceRef.current);
    canvasViewDebounceRef.current = setTimeout(() => {
      canvasViewDebounceRef.current = null;
      flushCanvasView();
    }, 150);
  });

  // ── Layout mode (lanes ⇄ mindmap ⇄ 3D corpus) persistence ────────────────
  // Mirrors the canvasView pattern above: lazy-seed from vscode.getState on
  // first mount, then write back on every user toggle. Layout flips are
  // discrete user actions (keyboard 'L' or the canvas toggle button), not
  // continuous 60+ Hz events, so we write synchronously — no debounce is
  // warranted and would only complicate the "last choice wins" contract.
  // Validation guards against stale / corrupted persisted values being
  // promoted to an unknown LayoutMode.
  const VALID_LAYOUT_MODES: ReadonlyArray<LayoutMode> = ['lanes', 'mindmap', 'corpus3d'];
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    try {
      const saved = (vscode.getState() as Record<string, unknown> | undefined)?.layoutMode;
      if (typeof saved === 'string' && (VALID_LAYOUT_MODES as readonly string[]).includes(saved)) {
        return saved as LayoutMode;
      }
    } catch (_) { /* ignore */ }
    return 'lanes';
  });
  const handleLayoutModeChange = useEvent((next: LayoutMode) => {
    // Sync React state to whatever Canvas now reports. The flow is:
    //   user → Canvas internal setLayoutMode → onLayoutModeChange effect → here.
    // We don't store React state ahead of Canvas (Canvas owns the truth
    // for the lifetime of its mount) so any race between React-side state
    // updates and Canvas-side toggles resolves naturally: Canvas always
    // reports last, and we follow its lead.
    setLayoutMode(next);
    try {
      const current = (vscode.getState() as Record<string, unknown>) ?? {};
      vscode.setState({ ...current, layoutMode: next });
    } catch (_) { /* ignore */ }
  });

  // Track artifact IDs to detect when a new project is loaded
  const [previousArtifactIds, setPreviousArtifactIds] = useState<string>('');

  // Auto-dismiss the external change toast after 8 seconds
  useEffect(() => {
    if (!externalChange) return;
    const t = setTimeout(() => setExternalChange(null), 8000);
    return () => clearTimeout(t);
  }, [externalChange]);

  // Auto-dismiss validation error toast after 12 seconds (longer — user needs time to read)
  useEffect(() => {
    if (!validationErrors) return;
    const t = setTimeout(() => setValidationErrors(null), 12000);
    return () => clearTimeout(t);
  }, [validationErrors]);

  // centerOnId: when set, Canvas will pan+flash to that artifact
  const [centerOnId, setCenterOnId] = useState<string | null>(null);

  // Initialize expanded state when artifacts load - expand all parents by default
  // Reset when a new project is loaded (different artifact IDs)
  useEffect(() => {
    if (artifacts.length === 0) return;
    
    // Create a signature of current artifact IDs to detect new project
    const currentIds = artifacts.map(a => a.id).sort().join(',');
    
    // If artifact IDs changed, this is a new project - reset and re-expand
    if (currentIds !== previousArtifactIds) {
      console.log('New project detected, re-initializing expanded state');
      console.log('Total artifacts:', artifacts.length);
      setPreviousArtifactIds(currentIds);
      
      // Find ALL items that have children (are referenced as parentId by another artifact)
      // This ensures the hierarchy is properly expanded
      const parentIds = new Set<string>();
      
      // First pass: collect all parentIds that are referenced
      artifacts.forEach(a => {
        if (a.parentId) {
          parentIds.add(a.parentId);
        }
      });
      
      // Also add items with childCount > 0
      artifacts.forEach(a => {
        if (a.childCount && a.childCount > 0) {
          parentIds.add(a.id);
        }
      });
      
      console.log('Expanding parents:', Array.from(parentIds));
      setExpandedIds(parentIds);

      // Initialize expandedCategories: all badge labels for each parent start expanded
      const catMap = new Map<string, Set<string>>();
      artifacts.forEach(a => {
        if (a.childBreakdown && a.childBreakdown.length > 0) {
          catMap.set(a.id, new Set(a.childBreakdown.map(b => b.label)));
        }
      });
      setExpandedCategories(catMap);

      setSelectedId(null); // Clear selection for new project
    }
  }, [artifacts, previousArtifactIds]);

  // Debug: log when detailPanelOpen changes
  useEffect(() => {
    console.log('[App] detailPanelOpen changed to:', detailPanelOpen);
  }, [detailPanelOpen]);

  // Hoisted message handler (useEvent: stable identity, latest closure).
  // With useEvent, this reads `detailPanelOpen` / `detailPanelDirty` /
  // `schemaFixing` from the latest closure at every message-arrival,
  // so the three deleted useRef workarounds (detailPanelOpenRef,
  // detailPanelDirtyRef, schemaFixingRef) are no longer needed.
  const handleMessage = useEvent((event: MessageEvent) => {
    const message = event.data;
    console.log('Canvas received message:', message.type);

    switch (message.type) {
      case 'updateArtifacts':
        console.log('Updating artifacts, count:', message.artifacts?.length);
        if (message.artifacts) {
          // Log breakdown by type for debugging
          const byType: Record<string, number> = {};
          message.artifacts.forEach((a: Artifact) => {
            byType[a.type] = (byType[a.type] || 0) + 1;
          });
          console.log('Artifacts by type:', byType);
          setArtifacts(message.artifacts);
        }
        if (message.activeFolderName !== undefined) {
          setActiveFolderName(message.activeFolderName);
        }
        // Use functional updater to read current reloadRequested (avoids stale closure)
        setReloadRequested(prev => {
          if (prev) {
            setExternalChange(null);
            setNeedsReload(false);
          }
          return false;
        });
        break;
      case 'aiCursorMove':
        setAiCursor(message.cursor);
        break;
      case 'aiCursorHide':
        setAiCursor(null);
        break;
      case 'selectArtifact':
        console.log('[App] MESSAGE: selectArtifact received', message.id);
        if (detailPanelOpen && detailPanelDirty) {
          setPendingNavigation({ type: 'select', id: message.id });
        } else {
          setSelectedId(message.id);
          setForceEditMode(false); // Normal selection, not edit mode
        }
        // Don't auto-open panel on external selection
        break;
      case 'selectAndEdit':
        // New artifact created - select it and open in edit mode
        console.log('[App] MESSAGE: selectAndEdit received - THIS OPENS THE PANEL', message.id);
        if (detailPanelOpen && detailPanelDirty) {
          setPendingNavigation({ type: 'selectAndEdit', id: message.id });
        } else {
          setSelectedId(message.id);
          setDetailPanelOpen(true); // Open panel for new artifacts
          setForceEditMode(true); // Force the detail panel to open in edit mode
        }
        break;
      case 'externalArtifactsChanged':
        setExternalChange(prev => ({
          filePath: message.filePath || prev?.filePath || '',
          count: (prev?.count || 0) + 1
        }));
        setReloadRequested(false);
        setNeedsReload(true);
        break;
      case 'elicitationMethods':
        console.log('Received elicitation methods, count:', message.methods?.length);
        if (message.methods) {
          setElicitationMethods(message.methods);
        }
        break;
      case 'bmmWorkflows':
        console.log('Received BMM workflows, count:', message.workflows?.length);
        if (message.workflows) {
          setBmmWorkflows(message.workflows);
        }
        break;
      case 'revealArtifact':
        console.log('[App] revealArtifact received:', message.id);
        if (message.id) {
          setSelectedId(message.id);
          setCenterOnId(message.id);
        }
        break;
      case 'detectedProjectCount':
        setDetectedProjectCount(message.count ?? 0);
        break;
      case 'validationError':
        setValidationErrors({
          artifactType: message.artifactType || '',
          artifactId: message.artifactId || '',
          errors: message.errors || [],
        });
        break;
      case 'schemaIssues':
        // Ignore schema issues arriving while a fix is in progress —
        // the fix flow sends its own schemaFixResult with remaining issues.
        if (!schemaFixing) {
          setSchemaIssues(message.issues || []);
        }
        break;
      case 'schemaFixResult':
        setSchemaFixing(false);
        if (message.cancelled) {
          // User cancelled — keep current issues visible, do nothing
        } else if (message.success) {
          setSchemaIssues([]);
          const fixed = message.fixedCount ?? 0;
          setSchemaFixMessage(fixed > 0 ? `Fixed ${fixed} issue(s) — all schemas valid` : 'All schemas valid');
          if (schemaToastTimerRef.current) clearTimeout(schemaToastTimerRef.current);
          schemaToastTimerRef.current = setTimeout(() => setSchemaFixMessage(null), 4000);
        } else if (message.remainingIssues?.length > 0) {
          setSchemaIssues(message.remainingIssues);
          if (message.noProgress) {
            setSchemaFixMessage(
              `Could not auto-fix ${message.remainingIssues.length} issue(s). Manual editing may be required.`
            );
            if (schemaToastTimerRef.current) clearTimeout(schemaToastTimerRef.current);
            schemaToastTimerRef.current = setTimeout(() => setSchemaFixMessage(null), 6000);
          } else {
            const fixed = message.fixedCount ?? 0;
            if (fixed > 0) {
              setSchemaFixMessage(
                `Fixed ${fixed} issue(s), ${message.remainingIssues.length} remaining`
              );
              if (schemaToastTimerRef.current) clearTimeout(schemaToastTimerRef.current);
              schemaToastTimerRef.current = setTimeout(() => setSchemaFixMessage(null), 5000);
            }
          }
        } else {
          // Error-only variant (success: false, no remainingIssues)
          const errMsg = message.error || 'Schema fix failed unexpectedly.';
          setSchemaFixMessage(errMsg);
          if (schemaToastTimerRef.current) clearTimeout(schemaToastTimerRef.current);
          schemaToastTimerRef.current = setTimeout(() => setSchemaFixMessage(null), 6000);
        }
        break;
      case 'schemaValidateResult':
        setSchemaValidating(false);
        if (message.issues?.length > 0) {
          setSchemaIssues(message.issues);
          setSchemaValidateSuccess(false);
        } else {
          setSchemaIssues([]);
          setSchemaValidateSuccess(true);
          // Auto-dismiss the success toast after 3 seconds
          if (schemaToastTimerRef.current) clearTimeout(schemaToastTimerRef.current);
          schemaToastTimerRef.current = setTimeout(() => setSchemaValidateSuccess(null), 3000);
        }
        break;
      case 'captureCanvas':
        // Extension requests a canvas screenshot — set format and bump trigger
        if (message.format === 'png' || message.format === 'pdf') {
          setScreenshotFormat(message.format);
        }
        setScreenshotTrigger(prev => prev + 1);
        break;
      case 'openAskModal':
        // Extension command (e.g. Ctrl+Shift+A) requests the Ask modal
        setAskOpen(true);
        break;
      case 'openIdeasDrawer':
        // Extension command (Ctrl+Alt+I) requests the Ideas drawer
        setIdeasOpen(true);
        setIdeasFocus((message as any).focus === 'capture' ? 'capture' : 'list');
        break;
      case 'ideasList':
        // Bulk payload: active + archived lists, replaced atomically on each push
        setIdeas(Array.isArray(message.ideas) ? message.ideas : []);
        setIdeasArchived(Array.isArray(message.archived) ? message.archived : []);
        if (typeof message.projectReady === 'boolean') setIdeasProjectReady(message.projectReady);
        break;
      case 'ideaError':
        if (message.error) {
          setIdeasError(message.error);
          // auto-dismiss after 6s
          setTimeout(() => setIdeasError(null), 6000);
        }
        break;
      case 'showGraphifyModal':
        setGraphifyModalOpen(true);
        break;
      case 'openCatalogueModal':
        setCatalogueOpen(true);
        break;
      case 'graphifyStatusResponse':
        if (message.status) {
          setGraphifyReady(message.status.recommendation === 'ready' || message.status.recommendation === 'update');
        }
        break;
      case 'sprintStatusResult':
        if (message.found) {
          // Build sprint items from live epics (single source of truth)
          // YAML content (if present) provides sprint groupings only
          const parsed = parseSprintStatusYaml(
            message.content as string | null | undefined,
            (message.epics as any[]) ?? []
          );
          setSprintData({ found: true, ...parsed });
        } else {
          setSprintData({ found: false });
        }
        break;
      // sprintStatusMismatches removed — statuses come from JSON files directly
    }
  });

  useEffect(() => {
    window.addEventListener('message', handleMessage);

    // Request initial data from extension
    console.log('Canvas sending ready message');
    vscode.postMessage({ type: 'ready' });

    return () => {
      window.removeEventListener('message', handleMessage);
      if (schemaToastTimerRef.current) clearTimeout(schemaToastTimerRef.current);
      // Flush any pending debounced canvas-view write so we don't lose the
      // last drag distance during a quick tab switch / webview reload.
      if (canvasViewDebounceRef.current) {
        clearTimeout(canvasViewDebounceRef.current);
        canvasViewDebounceRef.current = null;
      }
      flushCanvasView();
    };
  }, [handleMessage]);

  const handleReloadArtifacts = useEvent(() => {
    if (reloadRequested) return;
    setReloadRequested(true);
    vscode.postMessage({ type: 'reloadArtifacts' });
  });

  const handleSwitchProject = useEvent(() => {
    vscode.postMessage({ type: 'switchProject' });
  });

  const handleExport = useEvent(() => {
    vscode.postMessage({ type: 'exportArtifacts' });
  });

  const handleScreenshotReady = useEvent((dataUrl: string, format: 'png' | 'pdf') => {
    // Send the captured screenshot data back to the extension for saving
    vscode.postMessage({ type: 'canvasScreenshot', dataUrl, format });
  });

  const handleScreenshotError = useEvent((message: string) => {
    // Send the error to the extension so it can show a VS Code notification
    vscode.postMessage({ type: 'canvasScreenshotError', message });
  });

  const handleImport = useEvent(() => {
    vscode.postMessage({ type: 'importArtifacts' });
  });

  const handleOpenHelp = useEvent(() => {
    setHelpOpen(true);
  });

  const handleCloseHelp = useEvent(() => {
    setHelpOpen(false);
  });

  const handleOpenAsk = useEvent(() => {
    setAskOpen(true);
  });

  const handleCloseAsk = useEvent(() => {
    setAskOpen(false);
  });

  const handleOpenSprintView = useEvent(() => {
    setSprintData({ found: false, loading: true });
    setShowSprintView(true);
    vscode.postMessage({ type: 'getSprintStatus' });
  });

  const handleCloseSprintView = useEvent(() => {
    setShowSprintView(false);
  });

  const handleRunSprintPlanning = useEvent(() => {
    setShowSprintView(false);
    vscode.postMessage({
      type: 'launchWorkflow',
      workflow: {
        triggerPhrase: 'sprint planning',
      }
    });
  });

  const handleAskSubmit = useEvent((text: string) => {
    setAskOpen(false);
    vscode.postMessage({ type: 'askAgent', text });
  });

  const handleDismissExternalChange = useEvent(() => {
    setExternalChange(null);
    setReloadRequested(false);
  });

  const getChangedFileLabel = (filePath: string) => {
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || filePath;
  };

  const handleArtifactUpdate = useEvent((id: string, updates: Partial<Artifact>) => {
    // Find the artifact to get its type
    const artifact = artifacts.find(a => a.id === id);
    const artifactType = artifact?.type || 'epic';

    console.log('Sending update for', artifactType, id, updates);
    vscode.postMessage({
      type: 'updateArtifact',
      artifactType,
      id,
      updates
    });

    // Optimistically update local state for immediate feedback
    setArtifacts(prev => prev.map(a =>
      a.id === id ? { ...a, ...updates } : a
    ));
  });

  const handleArtifactDelete = useEvent((artifact: Artifact) => {
    console.log('Sending delete for', artifact.type, artifact.id);
    vscode.postMessage({
      type: 'deleteArtifact',
      artifactType: artifact.type,
      id: artifact.id
    });

    setDetailPanelOpen(false);
    setSelectedId(null);

    setArtifacts(prev => {
      if (artifact.type === 'epic') {
        return prev.filter(a => a.id !== artifact.id && a.parentId !== artifact.id);
      }
      return prev.filter(a => a.id !== artifact.id);
    });
  });

  const handleArtifactSelect = useEvent((id: string | null) => {
    console.log('[App] handleArtifactSelect called', { id, currentDetailPanelOpen: detailPanelOpen });
    // Guard: if detail panel has unsaved changes and we're switching to a different artifact, confirm first
    if (detailPanelOpen && detailPanelDirty && id !== selectedId) {
      setPendingNavigation({ type: 'select', id: id || '' });
      return;
    }
    setSelectedId(id);
    setForceEditMode(false); // Clear edit mode when manually selecting
    // Don't open panel on single-click selection
    console.log('[App] handleArtifactSelect - NOT opening panel, just selecting');
    vscode.postMessage({ type: 'selectArtifact', id });
  });

  // Open the detail panel for an artifact (double-click or info button).
  // VisualPlan artifacts open the in-canvas modal instead of the
  // narrow right-side DetailPanel — plans are wide and the DetailPanel
  // slot (320-600 px wide) renders them cramped.
  const handleOpenDetailPanel = useEvent((id: string) => {
    console.log('[App] handleOpenDetailPanel called', { id, previousDetailPanelOpen: detailPanelOpen });
    const target = artifacts.find(a => a.id === id);
    if (target?.type === 'visual-plan') {
      // Close any open detail panel first so the modal sits as the
      // sole right-hand surface and the layout doesn't visually fight.
      setDetailPanelOpen(false);
      setVisualPlanModalId(id);
      vscode.postMessage({ type: 'selectArtifact', id });
      return;
    }
    // Guard: if detail panel has unsaved changes and we're switching to a different artifact, confirm first
    if (detailPanelOpen && detailPanelDirty && id !== selectedId) {
      setPendingNavigation({ type: 'open', id });
      return;
    }
    console.log('[App] OPENING PANEL via handleOpenDetailPanel');
    setSelectedId(id);
    setDetailPanelOpen(true);
    setForceEditMode(false);
    vscode.postMessage({ type: 'selectArtifact', id });
  });

  const handleCloseDetailPanel = useEvent(() => {
    console.log('[App] handleCloseDetailPanel called - CLOSING PANEL');
    setDetailPanelOpen(false);
    setForceEditMode(false);
    // Keep selectedId so card stays highlighted
  });

  // --- Unsaved changes navigation guard handlers ---
  const handleDiscardAndNavigate = useEvent(() => {
    if (!pendingNavigation) return;
    const nav = pendingNavigation;
    setPendingNavigation(null);
    setDetailPanelDirty(false);
    // Execute the pending action
    if (nav.type === 'select') {
      setSelectedId(nav.id || null);
      setForceEditMode(false);
      vscode.postMessage({ type: 'selectArtifact', id: nav.id });
    } else if (nav.type === 'open') {
      setSelectedId(nav.id);
      setDetailPanelOpen(true);
      setForceEditMode(false);
      vscode.postMessage({ type: 'selectArtifact', id: nav.id });
    } else if (nav.type === 'selectAndEdit') {
      setSelectedId(nav.id);
      setDetailPanelOpen(true);
      setForceEditMode(true);
    }
  });

  const handleCancelNavigation = useEvent(() => {
    setPendingNavigation(null);
  });

  const handleToggleExpand = useEvent((id: string) => {
    console.log('handleToggleExpand called for:', id);
    setExpandedIds(prev => {
      const next = new Set(prev);
      const wasExpanded = next.has(id);
      if (wasExpanded) {
        next.delete(id);
      } else {
        next.add(id);
      }
      console.log('Toggled', id, 'from', wasExpanded, 'to', !wasExpanded, 'expandedIds now:', Array.from(next));
      return next;
    });
  });

  // Per-category toggle: expand/collapse a single badge label within a parent
  const handleToggleCategoryExpand = useEvent((parentId: string, label: string) => {
    console.log('handleToggleCategoryExpand called for:', parentId, 'label:', label);
    setExpandedCategories(prev => {
      const next = new Map(prev);
      const labels = new Set(next.get(parentId) || []);
      if (labels.has(label)) {
        labels.delete(label);
      } else {
        labels.add(label);
      }
      next.set(parentId, labels);

      // Keep expandedIds in sync: parent is expanded if ANY category is active
      setExpandedIds(prevIds => {
        const nextIds = new Set(prevIds);
        if (labels.size > 0) {
          nextIds.add(parentId);
        } else {
          nextIds.delete(parentId);
        }
        return nextIds;
      });

      return next;
    });
  });

  const handleExpandLane = useEvent((ids: string[]) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
    // Expand all categories for these parents
    setExpandedCategories(prev => {
      const next = new Map(prev);
      ids.forEach(id => {
        const a = artifacts.find(art => art.id === id);
        if (a?.childBreakdown && a.childBreakdown.length > 0) {
          next.set(id, new Set(a.childBreakdown.map(b => b.label)));
        }
      });
      return next;
    });
  });

  const handleCollapseLane = useEvent((ids: string[]) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    // Collapse all categories for these parents
    setExpandedCategories(prev => {
      const next = new Map(prev);
      ids.forEach(id => {
        next.set(id, new Set<string>());
      });
      return next;
    });
  });

  // Find the selected artifact
  const selectedArtifact = useMemo(() => {
    if (!selectedId) return null;
    return artifacts.find(a => a.id === selectedId) || null;
  }, [selectedId, artifacts]);

  const handleAddArtifact = useEvent((type: Artifact['type']) => {
    vscode.postMessage({ type: 'addArtifact', artifactType: type });
  });

  // Handle AI refinement request - sends artifact context to Copilot chat
  const handleRefineWithAI = useEvent((artifact: Artifact) => {
    console.log('Refine with AI requested for:', artifact.type, artifact.id);
    vscode.postMessage({
      type: 'refineWithAI',
      artifact: {
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        description: artifact.description,
        status: artifact.status,
        metadata: artifact.metadata
      }
    });
  });

  // Handle Break Down request - breaks epic/requirement into stories
  const handleBreakDown = useEvent((artifact: Artifact) => {
    console.log('Break Down requested for:', artifact.type, artifact.id);
    vscode.postMessage({
      type: 'breakDown',
      artifact: {
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        description: artifact.description,
        status: artifact.status,
        metadata: artifact.metadata
      }
    });
  });

  // Handle Enhance request - enhances selected artifact with AI
  const handleEnhance = useEvent((artifact: Artifact) => {
    console.log('Enhance with AI requested for:', artifact.type, artifact.id);
    vscode.postMessage({
      type: 'enhanceWithAI',
      artifact: {
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        description: artifact.description,
        status: artifact.status,
        metadata: artifact.metadata
      }
    });
  });

  // Handle Elicit request - opens in-webview method picker
  const handleElicit = useEvent((artifact: Artifact) => {
    console.log('Elicit requested for:', artifact.type, artifact.id);
    setElicitTarget(artifact);
    setElicitPickerOpen(true);
  });

  // Called when user picks a method in the ElicitationPicker
  const handleElicitConfirm = useEvent((artifact: Artifact, method: ElicitationMethod) => {
    setElicitPickerOpen(false);
    setElicitTarget(null);
    console.log('Elicit confirmed with method:', method.method_name);
    vscode.postMessage({
      type: 'elicitWithMethod',
      artifact: {
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        description: artifact.description,
        status: artifact.status,
        metadata: artifact.metadata
      },
      method
    });
  });

  // Open the workflow launcher FAB
  const handleOpenWorkflowLauncher = useEvent(() => {
    setWorkflowLauncherOpen(true);
  });

  // Open the Jira modal
  const handleOpenJira = useEvent(() => {
    setJiraModalOpen(true);
  });

  // Open the graphify modal
  const handleOpenGraphify = useEvent(() => {
    setGraphifyModalOpen(true);
  });

  // Open the skill catalogue modal
  const handleOpenCatalogue = useEvent(() => {
    setCatalogueOpen(true);
  });

  // Search box: open from Canvas `/` key
  const handleOpenSearch = useEvent(() => {
    setSearchOpen(true);
  });

  // Search box: result selected — center canvas on it and select
  const handleSearchSelect = useEvent((id: string) => {
    setSearchOpen(false);
    setSelectedId(id);
    setCenterOnId(id);
    vscode.postMessage({ type: 'selectArtifact', id });
  });

  // Called when user picks a workflow in the WorkflowLauncher
  const handleWorkflowSelect = useEvent((workflow: BmmWorkflow) => {
    setWorkflowLauncherOpen(false);
    console.log('Workflow selected:', workflow.name, 'trigger:', workflow.triggerPhrase);
    vscode.postMessage({
      type: 'launchWorkflow',
      workflow: {
        id: workflow.id,
        name: workflow.name,
        triggerPhrase: workflow.triggerPhrase,
        workflowFilePath: workflow.workflowFilePath,
      }
    });
  });

  const handlePopOut = useEvent((artifactId: string) => {
    vscode.postMessage({ type: 'openDetailTab', artifactId });
  });

  const handleGenerateVisualPlan = useEvent(() => {
    // Blank goal — the extension prompts for one natively (showInputBox),
    // then generates. The new ◆ Plan card appears on the canvas once the
    // plan is saved (extension subscribes to visualPlanStore changes).
    vscode.postMessage({ type: 'visualPlan:generate', goal: '' });
  });

  const handleFixSchemas = useEvent(() => {
    if (schemaFixing) return; // debounce: prevent double-click race (reads live state via useEvent)
    setSchemaFixing(true);
    vscode.postMessage({ type: 'fixSchemas' });
  });

  const handleValidateSchemas = useEvent(() => {
    setSchemaValidating(true);
    setSchemaValidateSuccess(null);
    vscode.postMessage({ type: 'validateSchemas' });
  });

  const handleSendSchemaFixToChat = useEvent((issues: { file: string; type: string; errors: string[] }[]) => {
    vscode.postMessage({ type: 'sendSchemaFixToChat', issues });
  });

  // ── JSX inline handler useEvents (stable identity, latest closure)
  // Hoisted from multi-line inline arrows in the JSX below. The 1-liner
  // modal-close setters and `() => vscode.postMessage(...)` calls are left
  // inline — they don't benefit from the indirection.

  // ElicitationPicker close — clears both the open flag and the target.
  const handleCloseElicitPicker = useEvent(() => {
    setElicitPickerOpen(false);
    setElicitTarget(null);
  });

  // DetailPanel's onEditModeChange: only react to *exiting* edit mode.
  const handleEditModeChange = useEvent((editing: boolean) => {
    if (!editing) setForceEditMode(false);
  });

  // Validation toast "Send to Chat": convert the single-artifact validation
  // error into the issues array shape, then dismiss the toast. The button
  // is only rendered when `validationErrors` is truthy (see JSX), so the
  // non-null assertion is safe.
  const handleSendValidationToChat = useEvent(() => {
    const errs = validationErrors!;
    handleSendSchemaFixToChat([{
      file: errs.artifactId,
      type: errs.artifactType,
      errors: errs.errors,
    }]);
    setValidationErrors(null);
  });

  // Schema-issues toast "Send to Chat" (dismiss + send).
  const handleSendSchemaIssuesToChat = useEvent(() => {
    handleSendSchemaFixToChat(schemaIssues);
    setSchemaIssues([]);
  });

  // Schema-fix-message toast "Send to Chat" (dismiss both + send).
  const handleSendRemainingSchemaIssuesToChat = useEvent(() => {
    handleSendSchemaFixToChat(schemaIssues);
    setSchemaFixMessage(null);
    setSchemaIssues([]);
  });

  // ── Visual Plan Modal ──────────────────────────────────────────────────────
  // VisualPlan cards open this modal on double-click instead of the
  // narrow right-side DetailPanel. The right-side DetailPanel's max
  // width (~600 px) is too narrow for plan tables (apiSpec, schemaMap),
  // inline SVG diagrams, and code blocks — they're unreadable at that
  // width. This modal scales up to ~90vw × ~90vh and reuses the same
  // VisualPlanSections renderer as the pop-out tab and the kanban
  // inline panel, so behaviour is identical across all three surfaces.
  const [visualPlanModalId, setVisualPlanModalId] = useState<string | null>(null);

  // The artifact backing the modal — populated from `artifacts` whenever
  // the modal id changes. Reads `metadata.plan` for the renderer payload.
  const visualPlanModalArtifact = useMemo(
    () => (visualPlanModalId ? artifacts.find(a => a.id === visualPlanModalId) ?? null : null),
    [visualPlanModalId, artifacts]
  );

  // ── Visual plan: tree-nesting + parent-card shortcut ──
  // Map every parent artifact id → its latest visual-plan artifact id.
  // A plan is "owned by" the artifact whose id matches plan.sourceArtifactId.
  // Used by Canvas to (a) reposition plan cards as tree-nested sub-cards below
  // their parent and (b) drive the new "Show Plan" button on the parent header.
  // Multiple plans per parent: keep the highest-id plan (deterministic across
  // renders — same plan wins on every Artifacts[] change with the same content).
  const childPlanMap = useMemo(() => {
    const map = new Map<string, string>();
    const plans = artifacts.filter(a => a.type === 'visual-plan');
    for (const plan of plans) {
      const meta = plan.metadata as { plan?: { sourceArtifactId?: string } } | undefined;
      const parentId = meta?.plan?.sourceArtifactId;
      if (!parentId) continue;
      const existing = map.get(parentId);
      if (!existing || plan.id.localeCompare(existing) > 0) {
        map.set(parentId, plan.id);
      }
    }
    return map;
  }, [artifacts]);

  // Open a visual plan in the modal — called when the parent card's "Show Plan"
  // shortcut button is clicked. We deliberately reuse the visualPlanModalId
  // path so the modal flow, Escape behaviour and per-plan cycling all stay
  // identical to the plan-card double-click path.
  const handleShowPlan = useEvent((planId: string) => {
    const plan = artifacts.find(a => a.id === planId);
    if (!plan || plan.type !== 'visual-plan') return;
    setDetailPanelOpen(false);
    setVisualPlanModalId(planId);
    vscode.postMessage({ type: 'selectArtifact', id: planId });
  });

  // Persist last-opened visual-plan id across re-renders. When the canvas
  // remounts (e.g. tab/panel switch within the same webview), the restoration
  // useEffect below re-opens the modal so the user lands back on the plan
  // they were reviewing. Clear the value on close so the next open rewrites it.
  useEffect(() => {
    try {
      const current = (vscode.getState() as Record<string, unknown>) ?? {};
      if (visualPlanModalId) {
        vscode.setState({ ...current, lastOpenedPlanId: visualPlanModalId });
      } else if (current.lastOpenedPlanId !== undefined) {
        vscode.setState({ ...current, lastOpenedPlanId: undefined });
      }
    } catch (_) { /* ignore */ }
  }, [visualPlanModalId]);

  // Restore the previously-opened visual-plan modal on remount. Only fires
  // when the plan still exists in the current artifact set — otherwise we'd
  // silently open a modal pointing at a stale/deleted plan.
  useEffect(() => {
    if (visualPlanModalId) return; // already open, nothing to restore
    try {
      const saved = (vscode.getState() as Record<string, unknown>)?.lastOpenedPlanId;
      if (typeof saved !== 'string') return;
      // Verify the plan is still in the artifact set and is a visual-plan.
      const stillExists = artifacts.some(
        a => a.id === saved && a.type === 'visual-plan'
      );
      if (stillExists) setVisualPlanModalId(saved);
    } catch (_) { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifacts]);
  const visualPlanModalPlan = useMemo<VisualPlanData | null>(() => {
    if (!visualPlanModalArtifact || visualPlanModalArtifact.type !== 'visual-plan') return null;
    const meta = visualPlanModalArtifact.metadata as { plan?: VisualPlanData } | undefined;
    return meta?.plan ?? null;
  }, [visualPlanModalArtifact]);

  const handleCloseVisualPlanModal = useEvent(() => {
    setVisualPlanModalId(null);
  });

  // All visual-plan artifacts in the current canvas view. Sorted by id
  // for stable, predictable cycle order. We pass this to the modal so
  // ArrowLeft / ArrowRight (and prev/next buttons) can cycle through
  // multiple plans without closing the modal.
  const visualPlanModalAllPlans = useMemo(
    () =>
      artifacts
        .filter(a => a.type === 'visual-plan')
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id)),
    [artifacts]
  );

  // Cycle direction: -1 wraps to the previous plan, +1 wraps to the
  // next. Wraps at both ends so the user can stay in the modal and
  // keep stepping through every plan with one key.
  //
  // Note: we deliberately do NOT post `selectArtifact` on each cycle.
  // The opening IPC already selects the originally-opened plan on the
  // canvas; cycling inside the modal is a *preview* gesture, and
  // firing selectArtifact on every press would scroll-thrash the
  // canvas behind the modal. Closing the modal preserves the original
  // selection. If we ever want the canvas to follow the modal, gate
  // the IPC on (a) being on the last cycle before close, or (b) a
  // "follow canvas" toggle in the toolbar.
  const handleNavigatePlan = useEvent((delta: -1 | 1) => {
    if (visualPlanModalAllPlans.length < 2) return;
    const idx = visualPlanModalAllPlans.findIndex(a => a.id === visualPlanModalId);
    if (idx === -1) return;
    // Wrap with modulo so Prev from the first wraps to the last, and
    // Next from the last wraps to the first.
    const nextIdx = (idx + delta + visualPlanModalAllPlans.length) % visualPlanModalAllPlans.length;
    const nextPlan = visualPlanModalAllPlans[nextIdx];
    if (nextPlan && nextPlan.id !== visualPlanModalId) {
      setVisualPlanModalId(nextPlan.id);
    }
  });

  // Note: the "Open in Editor" button inside VisualPlanModal posts the
  // `{ type: 'openVisualPlan', artifactId }` IPC directly via VisualPlanModal's
  // own handler — it doesn't need to bubble up here. So this layer has no
  // extra wiring; the modal owns that flow.

  if (error) {
    return (
      <div className="app error-state">
        <h2>Error Loading Canvas</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={`app ${detailPanelOpen && selectedArtifact ? 'with-detail-panel' : ''}`}>
      <div className="app-topbar">
        <Toolbar
          onAddArtifact={handleAddArtifact}
          selectedArtifact={selectedArtifact}
          onBreakDown={handleBreakDown}
          onEnhance={handleEnhance}
          onElicit={handleElicit}
          themeOverride={themeOverride}
          onToggleTheme={handleToggleTheme}
          onSwitchProject={handleSwitchProject}
          activeFolderName={activeFolderName}
          onExport={handleExport}
          onImport={handleImport}
          onHelp={handleOpenHelp}
          onAsk={handleOpenAsk}
          onSprintView={handleOpenSprintView}
          onJira={handleOpenJira}
          onGraphify={handleOpenGraphify}
          graphifyReady={graphifyReady}
          schemaIssueCount={schemaIssues.length}
          onFixSchemas={handleFixSchemas}
          onValidateSchemas={handleValidateSchemas}
          schemaValidating={schemaValidating}
          schemaFixing={schemaFixing}
  onCatalogue={handleOpenCatalogue}
  onGeneratePlan={handleGenerateVisualPlan}
  onToggleIdeas={() => setIdeasOpen(o => !o)}
  ideasOpen={ideasOpen}
  ideasCount={ideas.length}
/>
      </div>

      <div className="main-content">
        {showKanban ? (
          <ErrorBoundary label="Agentic Kanban">
            <AgenticKanbanApp initialArtifacts={artifacts} />
          </ErrorBoundary>
        ) : (
          <>
            <Canvas
              artifacts={artifacts}
              selectedId={selectedId}
              onSelect={handleArtifactSelect}
              onOpenDetail={handleOpenDetailPanel}
              onUpdate={handleArtifactUpdate}
              onToggleExpand={handleToggleExpand}
              expandedIds={expandedIds}
              expandedCategories={expandedCategories}
              onToggleCategoryExpand={handleToggleCategoryExpand}
              onRefineWithAI={handleRefineWithAI}
              onElicit={handleElicit}
              onExpandLane={handleExpandLane}
              onCollapseLane={handleCollapseLane}
              centerOnId={centerOnId}
              onCentered={() => setCenterOnId(null)}
              onOpenSearch={handleOpenSearch}
              searchMatchIds={searchMatchIds}
              screenshotTrigger={screenshotTrigger}
              screenshotFormat={screenshotFormat}
              onScreenshotReady={handleScreenshotReady}
              onScreenshotError={handleScreenshotError}
              initialCanvasView={canvasViewByMode[layoutMode]}
              onCanvasViewChange={handleCanvasViewChange}
              childPlanMap={childPlanMap}
              onShowPlan={handleShowPlan}
              initialLayoutMode={layoutMode}
              onLayoutModeChange={handleLayoutModeChange}
            />
            
            {detailPanelOpen && selectedArtifact && (
              <ErrorBoundary label="Detail Panel" key={selectedArtifact.id}>
                <DetailPanel
                  artifact={selectedArtifact}
                  onClose={handleCloseDetailPanel}
                  onUpdate={handleArtifactUpdate}
                  onDelete={handleArtifactDelete}
                  onRefineWithAI={handleRefineWithAI}
                  onElicit={handleElicit}
                  forceEditMode={forceEditMode}
                  onEditModeChange={handleEditModeChange}
                  allArtifacts={artifacts}
                  onPopOut={handlePopOut}
                  onDirtyStateChange={setDetailPanelDirty}
                />
              </ErrorBoundary>
            )}
            {/* Visual Plan Modal — preferred open surface for visual-plan
                cards so the deeply-nested tables/diagrams in VisualPlanSections
                have room to breathe. Sits above main-content in z-order; the
                Escape key and the backdrop click both close it. With 2+
                plans loaded, the modal exposes prev/next buttons + ArrowLeft /
                ArrowRight to cycle between plans without closing. */}
            {visualPlanModalArtifact && (
              <ErrorBoundary label="Visual Plan Modal" key={visualPlanModalArtifact.id}>
                <VisualPlanModal
                  artifactId={visualPlanModalArtifact.id}
                  plan={visualPlanModalPlan}
                  allPlans={visualPlanModalAllPlans}
                  onNavigate={handleNavigatePlan}
                  onClose={handleCloseVisualPlanModal}
                />
              </ErrorBoundary>
            )}
          </>
        )}
      </div>
      
      {aiCursor && <AICursor cursor={aiCursor} />}
      {elicitPickerOpen && elicitTarget && (
        <ElicitationPicker
          artifact={elicitTarget}
          methods={elicitationMethods}
          onSelect={(method) => handleElicitConfirm(elicitTarget, method)}
          onClose={handleCloseElicitPicker}
        />
      )}
      {workflowLauncherOpen && (
        <WorkflowLauncher
          workflows={bmmWorkflows}
          onSelect={handleWorkflowSelect}
          onClose={() => setWorkflowLauncherOpen(false)}
        />
      )}
      {jiraModalOpen && (
        <JiraModal onClose={() => setJiraModalOpen(false)} />
      )}
      {graphifyModalOpen && (
        <GraphifyModal
          onClose={() => setGraphifyModalOpen(false)}
          onSendMessage={msg => vscode.postMessage(msg as Parameters<typeof vscode.postMessage>[0])}
        />
      )}
      {helpOpen && (
        <HelpModal onClose={handleCloseHelp} />
      )}
      {catalogueOpen && (
        <CatalogueModal onClose={() => setCatalogueOpen(false)} />
      )}
      {askOpen && (
        <AskModal onSubmit={handleAskSubmit} onClose={handleCloseAsk} />
      )}
      <IdeasDrawer
        open={ideasOpen}
        ideas={ideas}
        archived={ideasArchived}
        initialFocus={ideasFocus}
        projectReady={ideasProjectReady}
        error={ideasError}
        onDismissError={() => setIdeasError(null)}
        onOpenProject={() => vscode.postMessage({ type: 'switchProject' })}
        onClose={() => { setIdeasOpen(false); setIdeasFocus(undefined); }}
      />
      {showSprintView && (
        <SprintPlanningView
          data={sprintData}
          onClose={handleCloseSprintView}
          onRunSprintPlanning={handleRunSprintPlanning}
        />
      )}
      {/* Search box — positioned to the left of the Workflow FAB */}
      <SearchBox
        artifacts={artifacts}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectResult={handleSearchSelect}
        onMatchesChange={setSearchMatchIds}
      />
      {/* Workflow Launcher FAB */}
      <button
        className="workflow-fab"
        title="Launch Workflow"
        onClick={handleOpenWorkflowLauncher}
        aria-label="Launch Workflow"
      >
        <span className="workflow-fab-icon"><Icon name="workflow" size={18} /></span>
        <span className="workflow-fab-label">Workflows</span>
      </button>

      {/* Kanban toggle FAB — sits to the left of the Provider Selector */}
      <button
        className="kanban-toggle-fab"
        onClick={handleToggleKanban}
        title={showKanban ? 'Switch to Canvas view' : 'Switch to Agentic Kanban view'}
        aria-label={showKanban ? 'Switch to Canvas' : 'Switch to Kanban'}
      >
        <Icon name={showKanban ? 'workflow' : 'sprint'} size={16} />
        <span className="kanban-toggle-label">{showKanban ? 'Canvas' : 'Kanban'}</span>
      </button>
      {/* Provider Selector FAB — sits to the left of the Workflows FAB */}
      <ProviderSelector />
      {artifacts.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="empty-canvas" size={48} /></div>
          <h2 className="empty-state-title">No artifacts loaded</h2>
          <p className="empty-state-body">
            Use <strong>Agile Agent Canvas: Load Existing Project</strong> to load a project,
            or click <strong>Add</strong> in the toolbar to create your first artifact.
          </p>
          <p className="empty-state-body" style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
            Use the <strong>folder button</strong> in the toolbar to browse for a different folder or create a new one.
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="empty-state-sample-btn"
              onClick={handleSwitchProject}
              title="Browse for an existing folder or create a new project folder"
            >
              <Icon name="folder" size={16} />
              Browse / New Folder
            </button>
            <button
              className="empty-state-sample-btn"
              onClick={() => vscode.postMessage({ type: 'loadSampleProject' })}
              title="Create a sample project with all artifact types and dependencies"
            >
              <Icon name="workflow" size={16} />
              Create Sample Project
            </button>
          </div>
        </div>
      )}
      {externalChange && (
        <div className="toast-container">
          <div className="toast">
            <div className="toast-content">
              <div className="toast-title">External file change detected</div>
              <div className="toast-body">
                {externalChange.count > 1
                  ? `Multiple files changed. Latest: ${getChangedFileLabel(externalChange.filePath)}`
                  : `Changed file: ${getChangedFileLabel(externalChange.filePath)}`}
              </div>
              <div className="toast-body">Reload to refresh the canvas.</div>
            </div>
            <div className="toast-actions">
              <button className="btn btn-secondary" onClick={handleDismissExternalChange}>Dismiss</button>
              <button className="btn btn-primary" onClick={handleReloadArtifacts} disabled={reloadRequested}>
                {reloadRequested ? 'Reloading...' : 'Reload'}
              </button>
            </div>
          </div>
        </div>
      )}
      {validationErrors && (
        <div className="toast-container toast-container-validation">
          <div className="toast toast-error">
            <div className="toast-content">
              <div className="toast-title">Schema validation issues</div>
              <div className="toast-body">
                Saved with warnings for <strong>{validationErrors.artifactType}</strong> ({validationErrors.artifactId}):
              </div>
              <ul className="toast-error-list">
                {validationErrors.errors.slice(0, 5).map((err, i) => (
                  <li key={i} className="toast-body">{err}</li>
                ))}
                {validationErrors.errors.length > 5 && (
                  <li className="toast-body">...and {validationErrors.errors.length - 5} more</li>
                )}
              </ul>
            </div>
            <div className="toast-actions">
              <button className="btn btn-secondary" onClick={() => setValidationErrors(null)}>Dismiss</button>
              <button className="btn btn-primary" onClick={handleSendValidationToChat}>Send to Chat</button>
            </div>
          </div>
        </div>
      )}
      {Array.isArray(schemaIssues) && schemaIssues.length > 0 && !schemaFixing && !schemaFixMessage && (
        <div className="toast-container toast-container-schema-fix">
          <div className="toast toast-warning">
            <div className="toast-content">
              <div className="toast-title">Schema issues detected</div>
              <div className="toast-body">
                {schemaIssues.length} file(s) don't match expected BMAD schemas.
                Re-saving through the pipeline can fix structural issues.
              </div>
              <ul className="toast-error-list">
                {schemaIssues.slice(0, 3).map((issue, i) => (
                  <li key={i} className="toast-body">{issue?.file ?? 'unknown'} ({issue?.type ?? '?'})</li>
                ))}
                {schemaIssues.length > 3 && (
                  <li className="toast-body">...and {schemaIssues.length - 3} more</li>
                )}
              </ul>
            </div>
            <div className="toast-actions">
              <button className="btn btn-secondary" onClick={() => setSchemaIssues([])}>Dismiss</button>
              <button className="btn btn-primary" onClick={handleFixSchemas}>Fix Schemas</button>
              <button className="btn btn-primary" onClick={handleSendSchemaIssuesToChat}>Send to Chat</button>
            </div>
          </div>
        </div>
      )}
      {/* Sprint status mismatch toast removed — statuses come from JSON files directly */}

      {schemaFixing && (
        <div className="toast-container toast-container-schema-fix">
          <div className="toast toast-info">
            <div className="toast-content">
              <div className="toast-title">Fixing schemas...</div>
              <div className="toast-body">Re-writing artifacts to match expected schemas. Please wait.</div>
            </div>
          </div>
        </div>
      )}
      {schemaFixMessage && !schemaFixing && (
        <div className="toast-container toast-container-schema-fix">
          <div className={`toast ${schemaIssues.length > 0 ? 'toast-warning' : 'toast-success'}`}>
            <div className="toast-content">
              <div className="toast-title">{schemaFixMessage}</div>
            </div>
            <div className="toast-actions">
              <button className="btn btn-secondary" onClick={() => setSchemaFixMessage(null)}>Dismiss</button>
              {schemaIssues.length > 0 && (
                <button className="btn btn-primary" onClick={handleSendRemainingSchemaIssuesToChat}>Send to Chat</button>
              )}
            </div>
          </div>
        </div>
      )}
      {schemaValidateSuccess === true && (
        <div className="toast-container toast-container-schema-fix">
          <div className="toast toast-success">
            <div className="toast-content">
              <div className="toast-title">All artifacts valid</div>
              <div className="toast-body">All artifacts match their expected BMAD schemas.</div>
            </div>
          </div>
        </div>
      )}
      {needsReload && !externalChange && (
        <button
          className="reload-badge"
          onClick={handleReloadArtifacts}
          disabled={reloadRequested}
          title="External files changed — click to reload canvas"
          aria-label="Reload canvas"
        >
          <Icon name="refresh" size={16} />
          <span className="reload-badge-label">{reloadRequested ? 'Reloading...' : 'Reload'}</span>
        </button>
      )}
      {/* Unsaved changes guard dialog */}
      {pendingNavigation && (
        <div className="discard-overlay" style={{ zIndex: 10000 }}>
          <div className="discard-dialog">
            <p className="discard-message">You have unsaved changes. Discard them?</p>
            <div className="discard-actions">
              <button className="btn btn-secondary" onClick={handleCancelNavigation}>Keep Editing</button>
              <button className="btn btn-danger" onClick={handleDiscardAndNavigate}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default App;

// ==========================================================================
// DETAIL-ONLY MODE (pop-out tab)
// ==========================================================================

function DetailOnlyApp() {
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [allArtifacts, setAllArtifacts] = useState<Artifact[]>([]);
  const [validationErrors, setValidationErrors] = useState<{ artifactType: string; artifactId: string; errors: string[] } | null>(null);

  // Auto-dismiss validation error toast after 12 seconds
  useEffect(() => {
    if (!validationErrors) return;
    const t = setTimeout(() => setValidationErrors(null), 12000);
    return () => clearTimeout(t);
  }, [validationErrors]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'loadArtifact') {
        if (message.artifact) setArtifact(message.artifact);
        if (message.allArtifacts) setAllArtifacts(message.allArtifacts);
      } else if (message.type === 'updateArtifacts') {
        // Keep allArtifacts in sync; refresh the displayed artifact if it's in the list
        if (message.artifacts) {
          setAllArtifacts(message.artifacts);
          if (AC_DETAIL_ID) {
            const updated = message.artifacts.find((a: Artifact) => a.id === AC_DETAIL_ID);
            if (updated) setArtifact(updated);
          }
        }
      } else if (message.type === 'validationError') {
        setValidationErrors({
          artifactType: message.artifactType || '',
          artifactId: message.artifactId || '',
          errors: message.errors || [],
        });
      }
    };
    window.addEventListener('message', handleMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handleMessage);
  });

  const handleArtifactUpdate = useEvent((id: string, updates: Partial<Artifact>) => {
    const art = allArtifacts.find(a => a.id === id) || artifact;
    vscode.postMessage({
      type: 'updateArtifact',
      artifactType: art?.type || 'epic',
      id,
      updates
    });
    // Optimistic local update
    if (artifact && artifact.id === id) {
      setArtifact(prev => prev ? { ...prev, ...updates } : prev);
    }
  });

  const handleArtifactDelete = useEvent((art: Artifact) => {
    vscode.postMessage({ type: 'deleteArtifact', artifactType: art.type, id: art.id });
    vscode.postMessage({ type: 'closeDetailTab', artifactId: art.id });
  });

  const handleRefineWithAI = useEvent((art: Artifact) => {
    vscode.postMessage({ type: 'refineWithAI', artifact: { id: art.id, type: art.type, title: art.title, description: art.description, status: art.status, metadata: art.metadata } });
  });

  const handleElicit = useEvent((art: Artifact) => {
    vscode.postMessage({ type: 'elicitWithMethod', artifact: { id: art.id, type: art.type, title: art.title, description: art.description, status: art.status, metadata: art.metadata } });
  });

  if (!artifact) {
    return (
      <div className="detail-tab-loading">
        <p>Loading artifact...</p>
      </div>
    );
  }

  return (
    <div className="app detail-tab-app">
      <ErrorBoundary label="Detail Panel" key={artifact.id}>
        <DetailPanel
          artifact={artifact}
          onClose={() => vscode.postMessage({ type: 'closeDetailTab', artifactId: artifact.id })}
          onUpdate={handleArtifactUpdate}
          onDelete={handleArtifactDelete}
          onRefineWithAI={handleRefineWithAI}
          onElicit={handleElicit}
          allArtifacts={allArtifacts}
          standalone={true}
        />
      </ErrorBoundary>
      {validationErrors && (
        <div className="toast-container toast-container-validation">
          <div className="toast toast-error">
            <div className="toast-content">
              <div className="toast-title">Schema validation issues</div>
              <div className="toast-body">
                Saved with warnings for <strong>{validationErrors.artifactType}</strong> ({validationErrors.artifactId}):
              </div>
              <ul className="toast-error-list">
                {validationErrors.errors.slice(0, 5).map((err, i) => (
                  <li key={i} className="toast-body">{err}</li>
                ))}
                {validationErrors.errors.length > 5 && (
                  <li className="toast-body">...and {validationErrors.errors.length - 5} more</li>
                )}
              </ul>
            </div>
            <div className="toast-actions">
              <button className="btn btn-secondary" onClick={() => setValidationErrors(null)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Root entry-point: choose canvas or detail-only mode
export function RootApp() {
  if (AC_MODE === 'detail') {
    return <DetailOnlyApp />;
  }
  if (AC_MODE === 'agentic-kanban') {
    return <AgenticKanbanApp />;
  }
  if (AC_MODE === 'visual-plan') {
    return (
      <ErrorBoundary label="Visual Plan">
        <VisualPlanApp />
      </ErrorBoundary>
    );
  }
  if (AC_MODE === 'agent-sessions') {
    // Full-window webview surface for the new Agent Sessions sidebar.
    // The sidebar host uses a tall+thin column, but we render the same
    // component at full size so pop-out flows work too.
    return (
      <ErrorBoundary label="Agent Sessions">
        <AgentSessionsPanel />
      </ErrorBoundary>
    );
  }
  return <App />;
}
