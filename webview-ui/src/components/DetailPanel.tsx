import { useState, useEffect, useCallback, useRef } from 'react';
import type { Artifact, ArtifactStatus } from '../types';
import { ARTIFACT_STATUS_OPTIONS } from '../types';
import { Icon, ARTIFACT_TYPE_ICON } from './Icon';
import { vscode } from '../vscodeApi';
import type { RendererProps } from './renderers/shared';

// --- Core renderers ---
import {
  renderStoryDetails,
  renderEpicDetails,
  renderRequirementDetails,
  renderVisionDetails,
  renderUseCaseDetails,
  renderPRDDetails,
  renderArchitectureDetails,
  renderProductBriefDetails,
  renderTestCaseDetails,
  renderTestStrategyDetails,
  renderArchitectureDecisionDetails,
  renderSystemComponentDetails,
  renderTaskDetails,
  renderRiskDetails,
  renderNFRDetails,
  renderAdditionalReqDetails,
  renderGenericDetails,
} from './renderers/core-renderers';

// --- Test renderers ---
import {
  renderTestDesignDetails,
  renderTestReviewDetails,
  renderTestFrameworkDetails,
  renderTestSummaryDetails,
  renderTestCoverageDetails,
} from './renderers/test-renderers';

// --- BMM renderers ---
import {
  renderDefinitionOfDoneDetails,
  renderFitCriteriaDetails,
  renderSuccessMetricsDetails,
  renderRetrospectiveDetails,
  renderSprintStatusDetails,
  renderCodeReviewDetails,
  renderChangeProposalDetails,
  renderRisksDetails,
  renderReadinessReportDetails,
  renderResearchDetails,
  renderUxDesignDetails,
  renderTechSpecDetails,
  renderProjectOverviewDetails,
  renderProjectContextDetails,
  renderSourceTreeDetails,
} from './renderers/bmm-renderers';

// --- TEA renderers ---
import {
  renderTraceabilityMatrixDetails,
  renderCiPipelineDetails,
  renderAutomationSummaryDetails,
  renderAtddChecklistDetails,
  renderNfrAssessmentDetails,
} from './renderers/tea-renderers';

// --- CIS renderers ---
import {
  renderStorytellingDetails,
  renderProblemSolvingDetails,
  renderInnovationStrategyDetails,
  renderDesignThinkingDetails,
} from './renderers/cis-renderers';

// ==========================================================================
// SHORTCUT LEGEND (collapsible keyboard shortcut reference)
// ==========================================================================

function getShortcutLegendCollapsed(): boolean {
  try {
    const state = vscode.getState() as Record<string, unknown> | null;
    if (state && 'shortcutLegendCollapsed' in state) {
      return state.shortcutLegendCollapsed === true;
    }
  } catch { /* ignore */ }
  return true; // collapsed by default
}

function persistShortcutLegendCollapsed(collapsed: boolean) {
  try {
    const state = (vscode.getState() as Record<string, unknown>) || {};
    vscode.setState({ ...state, shortcutLegendCollapsed: collapsed });
  } catch { /* ignore */ }
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? '\u2318' : 'Ctrl';

function ShortcutLegend({ mode, onSave, onExitEdit, onCancel, onEdit, onClose }: {
  mode: 'edit' | 'view';
  onSave?: () => void;
  onExitEdit?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
  onClose?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(getShortcutLegendCollapsed);

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      persistShortcutLegendCollapsed(next);
      return next;
    });
  }, []);

  return (
    <div className={`shortcut-legend${collapsed ? ' collapsed' : ''}`}>
      <button
        className="shortcut-legend-toggle"
        onClick={toggle}
        title={collapsed ? 'Show keyboard shortcuts' : 'Hide keyboard shortcuts'}
        aria-expanded={!collapsed}
        aria-label="Keyboard shortcuts"
      >
        <span className="shortcut-legend-icon">&#9000;</span>
        {collapsed && <span className="shortcut-legend-label">Keys</span>}
      </button>
      {!collapsed && (
        <div className="shortcut-legend-items">
          {mode === 'edit' ? (
            <>
              <button className="shortcut-legend-item" onClick={onSave} disabled={!onSave} title="Save changes"><kbd>{modKey}+S</kbd> Save</button>
              <button className="shortcut-legend-item" onClick={onExitEdit} title="Exit edit mode"><kbd>{modKey}+E</kbd> Exit edit</button>
              <button className="shortcut-legend-item" onClick={onCancel} title="Cancel editing"><kbd>Esc</kbd> Cancel</button>
            </>
          ) : (
            <>
              <button className="shortcut-legend-item" onClick={onEdit} title="Enter edit mode"><kbd>{modKey}+E</kbd> Edit</button>
              <button className="shortcut-legend-item" onClick={onClose} title="Close panel"><kbd>Esc</kbd> Close</button>
            </>
          )}
          <button className="shortcut-legend-item shortcut-legend-close" onClick={toggle} title="Hide shortcuts">&times;</button>
        </div>
      )}
    </div>
  );
}

interface DetailPanelProps {
  artifact: Artifact;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Artifact>) => void;
  onDelete: (artifact: Artifact) => void;
  onRefineWithAI?: (artifact: Artifact) => void;
  onElicit?: (artifact: Artifact) => void;
  forceEditMode?: boolean;
  onEditModeChange?: (editing: boolean) => void;
  allArtifacts?: Artifact[];
  onPopOut?: (artifactId: string) => void;
  standalone?: boolean;
  onDirtyStateChange?: (dirty: boolean) => void;
}

export function DetailPanel({ artifact, onClose, onUpdate, onDelete, onRefineWithAI, onElicit, forceEditMode, onEditModeChange, allArtifacts = [], onPopOut, standalone = false, onDirtyStateChange }: DetailPanelProps) {
  const [editMode, setEditModeInternal] = useState(forceEditMode ?? false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  
  const setEditMode = useCallback((editing: boolean) => {
    setEditModeInternal(editing);
    onEditModeChange?.(editing);
  }, [onEditModeChange]);
  
  const [editedData, setEditedData] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Push dirty state up to parent so it can guard artifact switches
  useEffect(() => {
    onDirtyStateChange?.(editMode && hasChanges);
  }, [editMode, hasChanges, onDirtyStateChange]);

  // --- Save feedback state ---
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Resizable panel state ---
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(380);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(380);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      // Panel is on the right, so dragging left increases width
      const delta = startXRef.current - ev.clientX;
      const next = Math.max(320, Math.min(600, startWidthRef.current + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  useEffect(() => {
    if (forceEditMode !== undefined) {
      setEditModeInternal(forceEditMode);
    }
  }, [forceEditMode]);

  useEffect(() => {
    setEditedData({
      title: artifact.title,
      description: artifact.description,
      status: artifact.status,
      ...artifact.metadata
    });
    setHasChanges(false);
    setShowDeleteConfirm(false);
  }, [artifact]);

  const handleSave = useCallback(() => {
    setSaveState('saving');
    onUpdate(artifact.id, {
      title: editedData.title,
      description: editedData.description,
      status: editedData.status,
      metadata: {
        ...artifact.metadata,
        ...editedData
      }
    });
    // Exit edit mode immediately, then show saved feedback briefly
    setEditMode(false);
    setHasChanges(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveState('saved');
      // Reset back to idle after showing success
      saveTimerRef.current = setTimeout(() => {
        setSaveState('idle');
      }, 1500);
    }, 100);
  }, [artifact.id, artifact.metadata, editedData, onUpdate, setEditMode]);

  const handleCancel = useCallback(() => {
    setEditedData({
      title: artifact.title,
      description: artifact.description,
      status: artifact.status,
      ...artifact.metadata
    });
    setEditMode(false);
    setHasChanges(false);
  }, [artifact, setEditMode]);

  const handleDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    onDelete(artifact);
  }, [artifact, onDelete]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  // Close with unsaved-changes guard
  const handleClose = useCallback(() => {
    if (editMode && hasChanges) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [editMode, hasChanges, onClose]);

  const handleDiscardConfirm = useCallback(() => {
    setShowDiscardConfirm(false);
    setEditMode(false);
    setHasChanges(false);
    onClose();
  }, [onClose, setEditMode]);

  const handleDiscardCancel = useCallback(() => {
    setShowDiscardConfirm(false);
  }, []);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement)?.tagName;
      const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Ctrl/Cmd+S: Save (when in edit mode with changes)
      if (mod && e.key === 's') {
        if (editMode && hasChanges) {
          e.preventDefault();
          e.stopPropagation();
          handleSave();
        }
        // Don't preventDefault when not saving — let VS Code handle native Ctrl+S
        return;
      }

      // Ctrl/Cmd+E: Toggle edit mode (skip when typing in input fields)
      if (mod && e.key === 'e') {
        if (isInputFocused && editMode) return; // let browser handle Ctrl+E in inputs
        e.preventDefault();
        e.stopPropagation();
        if (editMode) {
          if (hasChanges) {
            setShowDiscardConfirm(true);
          } else {
            handleCancel();
          }
        } else {
          setEditMode(true);
        }
        return;
      }

      // Escape: Cancel edit / dismiss dialogs / close panel
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else if (editMode) {
          if (hasChanges) {
            setShowDiscardConfirm(true);
          } else {
            handleCancel();
          }
        } else {
          handleClose();
        }
        return;
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [editMode, hasChanges, handleSave, handleCancel, handleClose, showDiscardConfirm, showDeleteConfirm, setEditMode]);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleFieldChange = useCallback((field: string, value: any) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }, []);

  const addToArray = useCallback((field: string, defaultItem: any) => {
    setEditedData(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), defaultItem]
    }));
    setHasChanges(true);
  }, []);

  const removeFromArray = useCallback((field: string, index: number) => {
    setEditedData(prev => ({
      ...prev,
      [field]: (prev[field] || []).filter((_: any, i: number) => i !== index)
    }));
    setHasChanges(true);
  }, []);

  const updateArrayItem = useCallback((field: string, index: number, value: any) => {
    setEditedData(prev => {
      const arr = [...(prev[field] || [])];
      arr[index] = value;
      return { ...prev, [field]: arr };
    });
    setHasChanges(true);
  }, []);

  // ==========================================================================
  // RENDERER PROPS (passed to all extracted renderer functions)
  // ==========================================================================

  const rendererProps: RendererProps = {
    editedData,
    editMode,
    handleFieldChange,
    updateArrayItem,
    removeFromArray,
    addToArray,
    artifact,
    allArtifacts,
  };

  // ==========================================================================
  // CONTENT ROUTER
  // ==========================================================================

  const renderContent = () => {
    switch (artifact.type) {
      // --- Core types ---
      case 'story':
        return renderStoryDetails(rendererProps);
      case 'epic':
        return renderEpicDetails(rendererProps);
      case 'requirement':
        return renderRequirementDetails(rendererProps);
      case 'vision':
        return renderVisionDetails(rendererProps);
      case 'use-case':
        return renderUseCaseDetails(rendererProps);
      case 'prd':
        return renderPRDDetails(rendererProps);
      case 'architecture':
        return renderArchitectureDetails(rendererProps);
      case 'product-brief':
        return renderProductBriefDetails(rendererProps);
      case 'test-case':
      case 'test-cases':
        return renderTestCaseDetails(rendererProps);
      case 'test-strategy':
        return renderTestStrategyDetails(rendererProps);
      case 'architecture-decision':
        return renderArchitectureDecisionDetails(rendererProps);
      case 'system-component':
        return renderSystemComponentDetails(rendererProps);
      case 'task':
        return renderTaskDetails(rendererProps);
      case 'risk':
        return renderRiskDetails(rendererProps);
      case 'nfr':
        return renderNFRDetails(rendererProps);
      case 'additional-req':
        return renderAdditionalReqDetails(rendererProps);

      // --- Test types ---
      case 'test-design':
      case 'test-design-qa':
      case 'test-design-architecture':
        return renderTestDesignDetails(rendererProps);
      case 'test-review':
        return renderTestReviewDetails(rendererProps);
      case 'test-framework':
        return renderTestFrameworkDetails(rendererProps);
      case 'test-summary':
        return renderTestSummaryDetails(rendererProps);
      case 'test-coverage':
        return renderTestCoverageDetails(rendererProps);

      // --- BMM types ---
      case 'definition-of-done':
        return renderDefinitionOfDoneDetails(rendererProps);
      case 'fit-criteria':
        return renderFitCriteriaDetails(rendererProps);
      case 'success-metrics':
        return renderSuccessMetricsDetails(rendererProps);
      case 'risks':
        return renderRisksDetails(rendererProps);
      case 'retrospective':
        return renderRetrospectiveDetails(rendererProps);
      case 'sprint-status':
        return renderSprintStatusDetails(rendererProps);
      case 'code-review':
        return renderCodeReviewDetails(rendererProps);
      case 'change-proposal':
        return renderChangeProposalDetails(rendererProps);
      case 'readiness-report':
        return renderReadinessReportDetails(rendererProps);
      case 'research':
        return renderResearchDetails(rendererProps);
      case 'ux-design':
        return renderUxDesignDetails(rendererProps);
      case 'tech-spec':
        return renderTechSpecDetails(rendererProps);
      case 'project-overview':
        return renderProjectOverviewDetails(rendererProps);
      case 'project-context':
        return renderProjectContextDetails(rendererProps);
      case 'source-tree':
        return renderSourceTreeDetails(rendererProps);

      // --- TEA types ---
      case 'traceability-matrix':
        return renderTraceabilityMatrixDetails(rendererProps);
      case 'ci-pipeline':
        return renderCiPipelineDetails(rendererProps);
      case 'automation-summary':
        return renderAutomationSummaryDetails(rendererProps);
      case 'atdd-checklist':
        return renderAtddChecklistDetails(rendererProps);
      case 'nfr-assessment':
        return renderNfrAssessmentDetails(rendererProps);

      // --- CIS types ---
      case 'storytelling':
        return renderStorytellingDetails(rendererProps);
      case 'problem-solving':
        return renderProblemSolvingDetails(rendererProps);
      case 'innovation-strategy':
        return renderInnovationStrategyDetails(rendererProps);
      case 'design-thinking':
        return renderDesignThinkingDetails(rendererProps);

      default:
        return renderGenericDetails(rendererProps);
    }
  };

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================

  return (
    <div ref={panelRef} className={`detail-panel type-${artifact.type}${standalone ? ' detail-panel-standalone' : ''}${editMode ? ' edit-mode' : ''}`} style={{ width: panelWidth }}>
      {/* Resize handle on left edge */}
      {!standalone && (
        <div className="detail-panel-resize-handle" onMouseDown={handleResizeStart} title="Drag to resize" />
      )}
      <div className="detail-panel-header">
        <div className="detail-panel-title">
          <span className="detail-type-icon"><Icon name={ARTIFACT_TYPE_ICON[artifact.type] || 'prd'} size={16} /></span>
          <span className="detail-type">{artifact.type}</span>
          {onPopOut && (
            <button className="popout-btn" onClick={() => onPopOut(artifact.id)} title="Open in tab">
              <Icon name="pop-out" size={14} />
            </button>
          )}
          {!standalone && (
            <button className="close-btn" onClick={handleClose} title="Close">×</button>
          )}
        </div>
        
        <div className="detail-panel-name">
          {editMode ? (
            <input
              type="text"
              value={editedData.title || ''}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              className="title-input"
              placeholder="Enter title..."
            />
          ) : (
            <h3>{artifact.title || <span className="empty-value">Untitled</span>}</h3>
          )}
        </div>

        <div className="detail-panel-status">
          <span className="status-label">Status:</span>
          {editMode ? (
            <select
              value={editedData.status || artifact.status}
              onChange={(e) => handleFieldChange('status', e.target.value as ArtifactStatus)}
              className="status-select"
            >
              {ARTIFACT_STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <span className={`status-badge status-${artifact.status}`}>
              {artifact.status}
            </span>
          )}
        </div>
        
        {hasChanges && (
          <div className="unsaved-indicator">Unsaved changes</div>
        )}
      </div>

      <div className="detail-panel-content">
        {renderContent()}
      </div>

      <div className="detail-panel-actions">
        {saveState === 'saved' && (
          <span className="save-success-badge" aria-live="polite">
            <span className="save-check">&#10003;</span> Saved
          </span>
        )}
        {editMode ? (
          <>
            <button
              className={`btn btn-primary${saveState === 'saving' ? ' btn-saving' : ''}`}
              onClick={handleSave}
              disabled={saveState === 'saving'}
              title="Save changes (Ctrl+S)"
            >
              {saveState === 'saving' ? (
                <><span className="save-spinner" /> Saving...</>
              ) : (
                <>Save{hasChanges ? ' *' : ''}</>
              )}
            </button>
            <button className="btn btn-secondary" onClick={handleCancel} title="Cancel editing (Escape)">Cancel</button>
            <ShortcutLegend mode="edit" onSave={hasChanges ? handleSave : undefined} onExitEdit={() => { if (hasChanges) { setShowDiscardConfirm(true); } else { handleCancel(); } }} onCancel={handleCancel} />
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={() => setEditMode(true)} title="Edit this artifact (Ctrl+E)">Edit</button>
            <button 
              className="btn btn-ai" 
              onClick={() => onRefineWithAI?.(artifact)}
              title="Refine this artifact with AI assistance"
            >
              <span className="ai-icon"><Icon name="sparkle" size={14} /></span> Refine with AI
            </button>
            <button
              className="btn btn-elicit"
              onClick={() => onElicit?.(artifact)}
              title="Elicit deeper insights using advanced methods"
            >
              <span className="elicit-icon"><Icon name="crystal-ball" size={14} /></span> Elicit
            </button>
            {['epic', 'story', 'test-case'].includes(artifact.type) && (
              <button
                className="btn btn-dev"
                onClick={() => {
                   vscode.postMessage({
                    type: 'startDevelopment',
                    artifact: {
                      id: artifact.id,
                      type: artifact.type,
                      title: artifact.title,
                      description: artifact.description,
                      status: artifact.status,
                      metadata: artifact.metadata
                    }
                  });
                }}
                title="Start development using BMAD workflows"
              >
                <span className="dev-icon"><Icon name="rocket" size={14} /></span> Start Dev
              </button>
            )}
            {!showDeleteConfirm ? (
              <button className="btn btn-danger" onClick={handleDelete} title="Delete this artifact">
                Delete
              </button>
            ) : (
              <div className="delete-confirm">
                <span className="delete-confirm-text">Delete this {artifact.type}?</span>
                <button className="btn btn-secondary" onClick={handleDeleteCancel}>Cancel</button>
                <button className="btn btn-danger" onClick={handleDeleteConfirm}>Confirm</button>
              </div>
            )}
            <ShortcutLegend mode="view" onEdit={() => setEditMode(true)} onClose={handleClose} />
          </>
        )}
      </div>

      {/* Unsaved changes confirmation overlay */}
      {showDiscardConfirm && (
        <div className="discard-overlay">
          <div className="discard-dialog">
            <p className="discard-message">You have unsaved changes. Discard them?</p>
            <div className="discard-actions">
              <button className="btn btn-secondary" onClick={handleDiscardCancel}>Keep Editing</button>
              <button className="btn btn-danger" onClick={handleDiscardConfirm}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
