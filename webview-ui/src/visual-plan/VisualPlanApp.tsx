// ─── Visual Plan App ─────────────────────────────────────────────────────────
// Thin host for the pop-out AC_MODE='visual-plan' full-window view.
// Wraps the shared VisualPlanSections renderer so the pop-out, canvas
// DetailPanel, and kanban inline panel all use the same renderer.
//
// See .claude/PRPs/plans/visual-plan-integration.plan.md Task 7.

import { useState, useEffect } from 'react';
import { VisualPlanSections } from './VisualPlanSections';
import type { VisualPlan } from './types';
import { vscode } from '../vscodeApi';
import { useEvent } from '../agentic-kanban/useEvent';

export function VisualPlanApp() {
  const [plan, setPlan] = useState<VisualPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const onMessage = useEvent((message: any) => {
    switch (message.type) {
      case 'visualPlan:ready':
        setPlan(message.plan);
        setLoading(false);
        break;
      case 'visualPlan:list:result':
        // Extension sends existing plans on connection. Always clear loading —
        // even when the list is empty — so the empty-state renders instead of
        // an infinite "Loading plan…" spinner.
        setPlan(message.plans && message.plans.length > 0 ? message.plans[0] : null);
        setLoading(false);
        break;
      case 'visualPlan:error':
        setLoading(false);
        break;
    }
  });

  useEffect(() => {
    const handler = (e: MessageEvent) => onMessage(e.data);
    window.addEventListener('message', handler);
    // Request the plan list on mount; the extension will send the focused plan
    vscode.postMessage({ type: 'visualPlan:list' });
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);

  if (loading) {
    return (
      <div className="vp-panel vp-panel--empty" style={{ padding: 40, textAlign: 'center' }}>
        <div className="vp-spinner" style={{ margin: '0 auto 12px' }} />
        <div>Loading plan…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 0, height: '100vh', overflow: 'auto' }}>
      <VisualPlanSections
        plan={plan}
        hideClose
        onApprove={(taskIds) => {
          if (plan) vscode.postMessage({ type: 'visualPlan:approve', planId: plan.id, taskIds });
        }}
        onRequestChanges={(comments) => {
          if (plan) vscode.postMessage({ type: 'visualPlan:requestChanges', planId: plan.id, comments });
        }}
        onComment={(comment) => {
          if (plan) vscode.postMessage({ type: 'visualPlan:comment', planId: plan.id, comment });
        }}
        onAnswerQuestion={(questionId, answer) => {
          if (plan) vscode.postMessage({ type: 'visualPlan:answerQuestion', planId: plan.id, questionId, answer });
        }}
      />
    </div>
  );
}
