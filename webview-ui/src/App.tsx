import { Component, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Canvas } from './components/Canvas';
import { AICursor } from './components/AICursor';
import { Toolbar } from './components/Toolbar';
import { DetailPanel } from './components/DetailPanel';
import { ElicitationPicker } from './components/ElicitationPicker';
import { WorkflowLauncher } from './components/WorkflowLauncher';
import { HelpModal } from './components/HelpModal';
import { AskModal } from './components/AskModal';
import { SearchBox } from './components/SearchBox';
import { Icon } from './components/Icon';
import { vscode } from './vscodeApi';
import type { Artifact, AICursorState, ElicitationMethod, BmmWorkflow } from './types';

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
  
  // Canvas search state (SearchBox rendered in App, to the left of workflow FAB)
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string>>(new Set());
  
  // Detected project count (for switch button visibility)
  const [detectedProjectCount, setDetectedProjectCount] = useState<number>(0);
  
  // Output format setting (synced with VS Code workspace config)
  const [outputFormat, setOutputFormat] = useState<'json' | 'markdown' | 'dual'>('dual');
  
  // Force edit mode when a new artifact is created
  const [forceEditMode, setForceEditMode] = useState<boolean>(false);

  // Canvas screenshot capture state (triggered by extension message)
  const [screenshotTrigger, setScreenshotTrigger] = useState<number>(0);
  const [screenshotFormat, setScreenshotFormat] = useState<'png' | 'pdf'>('png');

  // Schema validation errors surfaced from extension on save
  const [validationErrors, setValidationErrors] = useState<{ artifactType: string; artifactId: string; errors: string[] } | null>(null);

  // Schema issues detected on project load (files that don't match expected schemas)
  const [schemaIssues, setSchemaIssues] = useState<{ file: string; type: string; errors: string[] }[]>([]);
  const [schemaFixing, setSchemaFixing] = useState<boolean>(false);
  const [schemaFixMessage, setSchemaFixMessage] = useState<string | null>(null);
  const [schemaValidating, setSchemaValidating] = useState<boolean>(false);
  const [schemaValidateSuccess, setSchemaValidateSuccess] = useState<boolean | null>(null);

  // Ref so the message handler (which has stale closures) can read current schemaFixing state
  const schemaFixingRef = useRef(false);
  useEffect(() => { schemaFixingRef.current = schemaFixing; }, [schemaFixing]);

  // Ref for schema-related toast timeouts so they can be cleaned up on unmount
  const schemaToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unsaved changes protection: track whether the detail panel has dirty edits
  const [detailPanelDirty, setDetailPanelDirty] = useState<boolean>(false);
  // When user tries to navigate away from a dirty panel, store the pending action
  const [pendingNavigation, setPendingNavigation] = useState<{ type: 'select' | 'open' | 'selectAndEdit'; id: string } | null>(null);
  // Ref so the message handler (which has stale closures) can read current dirty state
  const detailPanelDirtyRef = useRef(false);
  const detailPanelOpenRef = useRef(false);
  useEffect(() => { detailPanelDirtyRef.current = detailPanelDirty; }, [detailPanelDirty]);
  useEffect(() => { detailPanelOpenRef.current = detailPanelOpen; }, [detailPanelOpen]);

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

  const handleToggleTheme = useCallback(() => {
    setThemeOverride(prev => {
      // Cycle: null → detect current VS Code theme to decide which to force
      if (prev === null) {
        // If body currently has vscode-light, force dark; otherwise force light
        return document.body.classList.contains('vscode-light') ? 'dark' : 'light';
      }
      if (prev === 'light') return 'dark';
      return null; // dark → back to auto
    });
  }, []);

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

  useEffect(() => {
    // Listen for messages from extension
    const handleMessage = (event: MessageEvent) => {
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
          if (detailPanelOpenRef.current && detailPanelDirtyRef.current) {
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
          if (detailPanelOpenRef.current && detailPanelDirtyRef.current) {
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
        case 'outputFormat':
          if (message.format === 'json' || message.format === 'markdown' || message.format === 'dual') {
            setOutputFormat(message.format);
          }
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
          if (!schemaFixingRef.current) {
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
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Request initial data from extension
    console.log('Canvas sending ready message');
    vscode.postMessage({ type: 'ready' });

    return () => {
      window.removeEventListener('message', handleMessage);
      if (schemaToastTimerRef.current) clearTimeout(schemaToastTimerRef.current);
    };
  }, []);

  const handleReloadArtifacts = useCallback(() => {
    if (reloadRequested) return;
    setReloadRequested(true);
    vscode.postMessage({ type: 'reloadArtifacts' });
  }, [reloadRequested]);

  const handleSwitchProject = useCallback(() => {
    vscode.postMessage({ type: 'switchProject' });
  }, []);

  const handleExport = useCallback(() => {
    vscode.postMessage({ type: 'exportArtifacts' });
  }, []);

  const handleScreenshotReady = useCallback((dataUrl: string, format: 'png' | 'pdf') => {
    // Send the captured screenshot data back to the extension for saving
    vscode.postMessage({ type: 'canvasScreenshot', dataUrl, format });
  }, []);

  const handleScreenshotError = useCallback((message: string) => {
    // Send the error to the extension so it can show a VS Code notification
    vscode.postMessage({ type: 'canvasScreenshotError', message });
  }, []);

  const handleImport = useCallback(() => {
    vscode.postMessage({ type: 'importArtifacts' });
  }, []);

  const handleOpenHelp = useCallback(() => {
    setHelpOpen(true);
  }, []);

  const handleOutputFormatChange = useCallback((format: 'json' | 'markdown' | 'dual') => {
    setOutputFormat(format);
    vscode.postMessage({ type: 'setOutputFormat', format });
  }, []);

  const handleCloseHelp = useCallback(() => {
    setHelpOpen(false);
  }, []);

  const handleOpenAsk = useCallback(() => {
    setAskOpen(true);
  }, []);

  const handleCloseAsk = useCallback(() => {
    setAskOpen(false);
  }, []);

  const handleAskSubmit = useCallback((text: string) => {
    setAskOpen(false);
    vscode.postMessage({ type: 'askAgent', text });
  }, []);

  const handleDismissExternalChange = useCallback(() => {
    setExternalChange(null);
    setReloadRequested(false);
  }, []);

  const getChangedFileLabel = (filePath: string) => {
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] || filePath;
  };

  const handleArtifactUpdate = useCallback((id: string, updates: Partial<Artifact>) => {
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
  }, [artifacts]);

  const handleArtifactDelete = useCallback((artifact: Artifact) => {
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
  }, []);

  const handleArtifactSelect = (id: string | null) => {
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
  };

  // Open the detail panel for an artifact (double-click or info button)
  const handleOpenDetailPanel = useCallback((id: string) => {
    console.log('[App] handleOpenDetailPanel called', { id, previousDetailPanelOpen: detailPanelOpen });
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
  }, [detailPanelOpen, detailPanelDirty, selectedId]);

  const handleCloseDetailPanel = () => {
    console.log('[App] handleCloseDetailPanel called - CLOSING PANEL');
    setDetailPanelOpen(false);
    setForceEditMode(false);
    // Keep selectedId so card stays highlighted
  };

  // --- Unsaved changes navigation guard handlers ---
  const handleDiscardAndNavigate = useCallback(() => {
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
  }, [pendingNavigation]);

  const handleCancelNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
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
  }, []);

  // Per-category toggle: expand/collapse a single badge label within a parent
  const handleToggleCategoryExpand = useCallback((parentId: string, label: string) => {
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
  }, []);

  const handleExpandLane = useCallback((ids: string[]) => {
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
  }, [artifacts]);

  const handleCollapseLane = useCallback((ids: string[]) => {
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
  }, []);

  // Find the selected artifact
  const selectedArtifact = useMemo(() => {
    if (!selectedId) return null;
    return artifacts.find(a => a.id === selectedId) || null;
  }, [selectedId, artifacts]);

  const handleAddArtifact = (type: Artifact['type']) => {
    vscode.postMessage({ type: 'addArtifact', artifactType: type });
  };

  // Handle AI refinement request - sends artifact context to Copilot chat
  const handleRefineWithAI = useCallback((artifact: Artifact) => {
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
  }, []);

  // Handle Break Down request - breaks epic/requirement into stories
  const handleBreakDown = useCallback((artifact: Artifact) => {
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
  }, []);

  // Handle Enhance request - enhances selected artifact with AI
  const handleEnhance = useCallback((artifact: Artifact) => {
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
  }, []);

  // Handle Elicit request - opens in-webview method picker
  const handleElicit = useCallback((artifact: Artifact) => {
    console.log('Elicit requested for:', artifact.type, artifact.id);
    setElicitTarget(artifact);
    setElicitPickerOpen(true);
  }, []);

  // Called when user picks a method in the ElicitationPicker
  const handleElicitConfirm = useCallback((artifact: Artifact, method: ElicitationMethod) => {
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
  }, []);

  // Open the workflow launcher FAB
  const handleOpenWorkflowLauncher = useCallback(() => {
    setWorkflowLauncherOpen(true);
  }, []);

  // Search box: open from Canvas `/` key
  const handleOpenSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);

  // Search box: result selected — center canvas on it and select
  const handleSearchSelect = useCallback((id: string) => {
    setSearchOpen(false);
    setSelectedId(id);
    setCenterOnId(id);
    vscode.postMessage({ type: 'selectArtifact', id });
  }, []);

  // Called when user picks a workflow in the WorkflowLauncher
  const handleWorkflowSelect = useCallback((workflow: BmmWorkflow) => {
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
  }, []);

  const handlePopOut = useCallback((artifactId: string) => {
    vscode.postMessage({ type: 'openDetailTab', artifactId });
  }, []);

  const handleFixSchemas = useCallback(() => {
    if (schemaFixingRef.current) return; // debounce: prevent double-click race
    setSchemaFixing(true);
    vscode.postMessage({ type: 'fixSchemas' });
  }, []);

  const handleValidateSchemas = useCallback(() => {
    setSchemaValidating(true);
    setSchemaValidateSuccess(null);
    vscode.postMessage({ type: 'validateSchemas' });
  }, []);

  const handleSendSchemaFixToChat = useCallback((issues: { file: string; type: string; errors: string[] }[]) => {
    vscode.postMessage({ type: 'sendSchemaFixToChat', issues });
  }, []);

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
      <Toolbar 
        onAddArtifact={handleAddArtifact}
        selectedArtifact={selectedArtifact}
        onBreakDown={handleBreakDown}
        onEnhance={handleEnhance}
        onElicit={handleElicit}
        themeOverride={themeOverride}
        onToggleTheme={handleToggleTheme}
        detectedProjectCount={detectedProjectCount}
        onSwitchProject={handleSwitchProject}
        onExport={handleExport}
        onImport={handleImport}
        onHelp={handleOpenHelp}
        onAsk={handleOpenAsk}
        outputFormat={outputFormat}
        onOutputFormatChange={handleOutputFormatChange}
        schemaIssueCount={schemaIssues.length}
        onFixSchemas={handleFixSchemas}
        onValidateSchemas={handleValidateSchemas}
        schemaValidating={schemaValidating}
        schemaFixing={schemaFixing}
      />
      
      <div className="main-content">
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
              onEditModeChange={(editing) => {
                // When user manually exits edit mode, clear forceEditMode
                if (!editing) setForceEditMode(false);
              }}
              allArtifacts={artifacts}
              onPopOut={handlePopOut}
              onDirtyStateChange={setDetailPanelDirty}
            />
          </ErrorBoundary>
        )}
      </div>
      
      {aiCursor && <AICursor cursor={aiCursor} />}
      {elicitPickerOpen && elicitTarget && (
        <ElicitationPicker
          artifact={elicitTarget}
          methods={elicitationMethods}
          onSelect={(method) => handleElicitConfirm(elicitTarget, method)}
          onClose={() => { setElicitPickerOpen(false); setElicitTarget(null); }}
        />
      )}
      {workflowLauncherOpen && (
        <WorkflowLauncher
          workflows={bmmWorkflows}
          onSelect={handleWorkflowSelect}
          onClose={() => setWorkflowLauncherOpen(false)}
        />
      )}
      {helpOpen && (
        <HelpModal onClose={handleCloseHelp} />
      )}
      {askOpen && (
        <AskModal onSubmit={handleAskSubmit} onClose={handleCloseAsk} />
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
      {artifacts.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="empty-canvas" size={48} /></div>
          <h2 className="empty-state-title">No artifacts loaded</h2>
          <p className="empty-state-body">
            Use <strong>Agile Agent Canvas: Load Existing Project</strong> to load a project,
            or click <strong>Add</strong> in the toolbar to create your first artifact.
          </p>
          <button
            className="empty-state-sample-btn"
            onClick={() => vscode.postMessage({ type: 'loadSampleProject' })}
            title="Create a sample project with all artifact types and dependencies"
          >
            <Icon name="workflow" size={16} />
            Create Sample Project
          </button>
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
              <button className="btn btn-primary" onClick={() => {
                if (validationErrors) {
                  handleSendSchemaFixToChat([{
                    file: validationErrors.artifactId,
                    type: validationErrors.artifactType,
                    errors: validationErrors.errors
                  }]);
                  setValidationErrors(null);
                }
              }}>Send to Chat</button>
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
              <button className="btn btn-primary" onClick={() => { handleSendSchemaFixToChat(schemaIssues); setSchemaIssues([]); }}>Send to Chat</button>
            </div>
          </div>
        </div>
      )}
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
                <button className="btn btn-primary" onClick={() => { handleSendSchemaFixToChat(schemaIssues); setSchemaFixMessage(null); setSchemaIssues([]); }}>Send to Chat</button>
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
  }, []);

  const handleArtifactUpdate = useCallback((id: string, updates: Partial<Artifact>) => {
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
  }, [artifact, allArtifacts]);

  const handleArtifactDelete = useCallback((art: Artifact) => {
    vscode.postMessage({ type: 'deleteArtifact', artifactType: art.type, id: art.id });
    vscode.postMessage({ type: 'closeDetailTab', artifactId: art.id });
  }, []);

  const handleRefineWithAI = useCallback((art: Artifact) => {
    vscode.postMessage({ type: 'refineWithAI', artifact: { id: art.id, type: art.type, title: art.title, description: art.description, status: art.status, metadata: art.metadata } });
  }, []);

  const handleElicit = useCallback((art: Artifact) => {
    vscode.postMessage({ type: 'elicitWithMethod', artifact: { id: art.id, type: art.type, title: art.title, description: art.description, status: art.status, metadata: art.metadata } });
  }, []);

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
  return <App />;
}
