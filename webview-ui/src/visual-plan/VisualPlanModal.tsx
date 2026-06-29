// ─── Visual Plan Modal ───────────────────────────────────────────────────────
// In-canvas popup modal for visual-plan review.
//
// Why a modal instead of the right-side DetailPanel?
//   The DetailPanel renders in a fixed-width 320-600 px slot. Visual plans
//   have wide tables (apiSpec, schemaMap), inline SVG diagrams, and
//   annotated code blocks — at 380 px they're unreadable. This modal
//   takes up to ~90vw × ~90vh, fills dynamically with the available space,
//   and matches the existing modal pattern (Overlay + role="dialog").
//
// Behaviour
//   - Backdrop click closes (matches GraphifyModal/WorkflowLauncher pattern).
//   - Esc key closes.
//   - The "Open in Editor" button fires `vscode.postMessage({ type: 'openVisualPlan' })`,
//     which the extension routes to `agileagentcanvas.openVisualPlan` and opens
//     a dedicated `AC_MODE='visual-plan'` webview tab.
//   - The plan data lives in `artifact.metadata.plan` (set by the transformer).
//     While the plan is `generating` we show the same spinner the renderer
//     uses for that state; if `null`, showing the renderer empty state is fine.
//   - Reuses `VisualPlanSections` unchanged so the canvas DetailPanel, the
//     kanban inline panel, and this modal all share one renderer.
//   - When 2+ visual-plan artifacts exist, the toolbar exposes prev/next
//     buttons + a "N of M" counter, and ArrowLeft / ArrowRight cycle between
//     plans without closing the modal. Cycling wraps at both ends so the
//     user can keep stepping forward forever. Arrow keys are skipped when
//     an input/textarea/select has focus so comment-entry and any future
//     text fields don't get hijacked.

import { useCallback, useEffect, useMemo } from 'react';
import { VisualPlanSections } from './VisualPlanSections';
import type { VisualPlan } from './types';
import type { Artifact } from '../types';
import { vscode } from '../vscodeApi';
import { Icon } from '../components/Icon';

export interface VisualPlanModalProps {
  /** The visual-plan artifact backed by the extension (id used to map
   *  onto the correct plan in the visualPlanStore). */
  artifactId: string;
  /** Plan payload — null while the plan is `generating` or hasn't been emitted yet. */
  plan: VisualPlan | null;
  /** All visual-plan artifacts on the canvas (sorted by App.tsx). Optional —
   *  when absent or length < 2 the modal hides cycle controls entirely. */
  allPlans?: Artifact[];
  /** Cycle to previous (-1) or next (+1) plan. No-op when <2 plans
   *  or when current plan isn't in the list. */
  onNavigate?: (delta: -1 | 1) => void;
  onClose: () => void;
}

/**
 * Returns true when the keyboard event originated from an editable text
 * field. Used to skip cycle shortcuts so they don't interfere with
 * comment-entry, future edit forms, or any contenteditable region.
 */
function isEditableFocused(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // contenteditable ancestors
  return el.isContentEditable === true;
}

export function VisualPlanModal({
  artifactId,
  plan,
  allPlans,
  onNavigate,
  onClose,
}: VisualPlanModalProps) {
  // Stable cycle metadata: position of the current plan in the sorted
  // list, total count, and whether cycle UI should render (<2 plans
  // means no arrows — only one plan exists to look at).
  const cycle = useMemo(() => {
    if (!allPlans || allPlans.length < 2) return null;
    const idx = allPlans.findIndex(a => a.id === artifactId);
    if (idx === -1) return null;
    return { idx, total: allPlans.length };
  }, [allPlans, artifactId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip all shortcuts when the user is typing in an editable
      // field — comment input is INPUT[type=text], future rename fields
      // will be too. This keeps the global keydown listener safe to
      // register at the document level.
      if (isEditableFocused(e.target)) return;

      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (cycle && onNavigate) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          onNavigate(-1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          onNavigate(1);
          return;
        }
      }
    },
    [onClose, cycle, onNavigate]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  const handleOpenInEditor = useCallback(() => {
    // Mirrors `agileagentcanvas.openVisualPlan` (extension.ts:434). The
    // extension's `case 'openVisualPlan':` handler in canvas-view-provider.ts
    // routes this to `openVisualPlanPanel` which spins up a
    // `createWebviewPanel` with `AC_MODE='visual-plan'`.
    vscode.postMessage({ type: 'openVisualPlan', artifactId });
  }, [artifactId]);

  const handleAnswerQuestion = useCallback(
    (questionId: string, answer: string) => {
      vscode.postMessage({
        type: 'visualPlan:answerQuestion',
        planId: artifactId,
        questionId,
        answer,
      });
    },
    [artifactId]
  );

  return (
    <div
      className="vp-modal-overlay"
      onClick={onClose}
      role="presentation"
      data-testid="visual-plan-modal-overlay"
    >
      <div
        className="vp-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Visual plan review"
        data-testid="visual-plan-modal"
      >
        <div className="vp-modal-toolbar">
          <span className="vp-modal-toolbar-title">{plan?.title || '◆ Visual Plan'}</span>
          {/* Cycle controls render only when 2+ plans exist. Wraps
              both ends via the App-level handler, so prev from the
              first plan jumps to the last and vice versa. */}
          {cycle && onNavigate && (
            <div
              className="vp-modal-cycle-group"
              role="group"
              aria-label="Cycle between visual plans"
            >
              <button
                type="button"
                className="vp-modal-cycle-btn"
                onClick={() => onNavigate(-1)}
                title="Previous plan (←)"
                aria-label="Previous visual plan"
                data-testid="vp-modal-prev-btn"
              >
                <Icon name="chevron-left" size={14} />
              </button>
              <span
                className="vp-modal-cycle-counter"
                aria-label={`Plan ${cycle.idx + 1} of ${cycle.total}`}
                data-testid="vp-modal-cycle-counter"
              >
                {cycle.idx + 1} / {cycle.total}
              </span>
              <button
                type="button"
                className="vp-modal-cycle-btn"
                onClick={() => onNavigate(1)}
                title="Next plan (→)"
                aria-label="Next visual plan"
                data-testid="vp-modal-next-btn"
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
          )}
          <div className="vp-modal-kbd-hints">
            <span><kbd className="vp-modal-kbd">Esc</kbd> close</span>
            {cycle && <span><kbd className="vp-modal-kbd">←</kbd><kbd className="vp-modal-kbd">→</kbd> cycle</span>}
          </div>
          <div className="vp-modal-toolbar-actions">
            <button
              type="button"
              className="vp-modal-open-in-editor-btn"
              onClick={handleOpenInEditor}
              title="Open in a new editor window"
              aria-label="Open in new editor window"
            >
              <Icon name="pop-out" size={14} />
              <span>Open in Editor</span>
            </button>
            <button
              type="button"
              className="vp-modal-close-btn"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close plan modal"
            >
              ×
            </button>
          </div>
        </div>
        {/* VisualPlanSections is the shared renderer used by the canvas
            DetailPanel, the kanban inline panel, and the pop-out tab — so
            behaviour here is identical to those surfaces. We just give it
            a wider stage.
            Graceful fallback when the plan payload is missing or empty:
            we'd rather show a "plan still generating" spinner than throw
            into the App-level ErrorBoundary and unmount the modal entirely.
            Without this guard, the tree-nesting test would have to mock a
            full VisualPlan payload just to assert the modal mount contract. */}
        <div className="vp-modal-content">
          {plan && (plan.sections?.length ?? 0) > 0 ? (
            <VisualPlanSections
              plan={plan}
              onApprove={(taskIds) =>
                vscode.postMessage({ type: 'visualPlan:approve', planId: artifactId, taskIds })
              }
              onRequestChanges={(comments) =>
                vscode.postMessage({
                  type: 'visualPlan:requestChanges',
                  planId: artifactId,
                  comments,
                })
              }
              onComment={(comment) =>
                vscode.postMessage({
                  type: 'visualPlan:comment',
                  planId: artifactId,
                  comment,
                })
              }
              onAnswerQuestion={handleAnswerQuestion}
            />
          ) : (
            <div className="vp-modal-generating" data-testid="visual-plan-modal-generating">
              <span className="vp-spinner" aria-hidden="true" />
              <span className="vp-modal-generating-label">
                {plan ? 'Plan is still finalising…' : 'Plan is still generating…'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
