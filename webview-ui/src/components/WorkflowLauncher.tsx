import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { BmmWorkflow } from '../types';
import { Icon } from './Icon';
import type { IconName } from './Icon';

interface WorkflowLauncherProps {
  workflows: BmmWorkflow[];
  onSelect: (workflow: BmmWorkflow) => void;
  onClose: () => void;
}

const PHASE_ICONS: Record<string, IconName> = {
  'Analysis':       'vision',
  'Planning':       'requirement',
  'Solutioning':    'architecture',
  'Implementation': 'settings',
  'Quick Flow':     'epic',
  'Documentation':  'docs',
  'Project Setup':  'folder',
  'Supporting':     'wrench',
};

export function WorkflowLauncher({ workflows, onSelect, onClose }: WorkflowLauncherProps) {
  const [search, setSearch] = useState('');
  const [activePhase, setActivePhase] = useState<string>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search on open
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on Escape (capture phase to intercept before DetailPanel)
  // If search has text, first Escape clears it; second Escape closes the modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (search) {
          setSearch('');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, search]);

  // Build ordered phase list from workflows
  const phases = useMemo(() => {
    const seen = new Map<string, number>();
    workflows.forEach(w => {
      if (!seen.has(w.phase)) seen.set(w.phase, w.phaseOrder);
    });
    return Array.from(seen.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([phase]) => phase);
  }, [workflows]);

  // Per-phase counts for tab badges
  const phaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    workflows.forEach(w => {
      counts[w.phase] = (counts[w.phase] || 0) + 1;
    });
    return counts;
  }, [workflows]);

  // Filtered workflows
  const filteredWorkflows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return workflows.filter(w => {
      const matchesPhase = activePhase === 'all' || w.phase === activePhase;
      if (!matchesPhase) return false;
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q) ||
        w.triggerPhrase.toLowerCase().includes(q)
      );
    });
  }, [workflows, activePhase, search]);

  // Group filtered workflows by phase (preserving phase order)
  const groupedWorkflows = useMemo(() => {
    const groups = new Map<string, BmmWorkflow[]>();
    filteredWorkflows.forEach(w => {
      const group = groups.get(w.phase) ?? [];
      group.push(w);
      groups.set(w.phase, group);
    });
    // Re-sort groups by phaseOrder
    return Array.from(groups.entries()).sort((a, b) => {
      const orderA = workflows.find(w => w.phase === a[0])?.phaseOrder ?? 99;
      const orderB = workflows.find(w => w.phase === b[0])?.phaseOrder ?? 99;
      return orderA - orderB;
    });
  }, [filteredWorkflows, workflows]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleWorkflowClick = useCallback((workflow: BmmWorkflow) => {
    onSelect(workflow);
  }, [onSelect]);

  /** Extract the first quoted phrase from the triggerPhrase for display */
  const formatTrigger = (phrase: string): string => {
    // Show up to the first 80 chars for compactness
    return phrase.length > 80 ? phrase.slice(0, 77) + '…' : phrase;
  };

  return (
    <div className="wfl-overlay" onClick={handleOverlayClick}>
      <div className="wfl-modal" role="dialog" aria-modal="true" aria-label="Launch Workflow">
        {/* Header */}
        <div className="wfl-modal-header">
          <div className="wfl-modal-title">
            <span className="wfl-modal-icon"><Icon name="rocket" size={24} /></span>
            <div>
              <h2>Launch Workflow</h2>
              <p className="wfl-subtitle">Select a BMAD workflow to open in AI chat</p>
            </div>
          </div>
          <button className="wfl-close-btn" onClick={onClose} title="Close (Esc)"><Icon name="close" size={16} /></button>
        </div>

        {/* Search */}
        <div className="wfl-modal-search">
          <span className="wfl-search-icon"><Icon name="search" size={14} /></span>
          <input
            ref={searchRef}
            type="text"
            className="wfl-search-input"
            placeholder="Search workflows…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="wfl-search-clear" onClick={() => setSearch('')} title="Clear search"><Icon name="close" size={14} /></button>
          )}
        </div>

        {/* Phase tabs */}
        <div className="wfl-modal-tabs" role="tablist">
          <button
            className={`wfl-tab ${activePhase === 'all' ? 'active' : ''}`}
            role="tab"
            aria-selected={activePhase === 'all'}
            onClick={() => setActivePhase('all')}
          >
            All
            <span className="wfl-tab-count">{workflows.length}</span>
          </button>
          {phases.map(phase => (
            <button
              key={phase}
              className={`wfl-tab ${activePhase === phase ? 'active' : ''}`}
              role="tab"
              aria-selected={activePhase === phase}
              onClick={() => setActivePhase(phase)}
            >
              {PHASE_ICONS[phase] && <Icon name={PHASE_ICONS[phase]} size={14} />} {phase}
              <span className="wfl-tab-count">{phaseCounts[phase]}</span>
            </button>
          ))}
        </div>

        {/* Workflow list */}
        <div className="wfl-modal-list" role="tabpanel">
          {filteredWorkflows.length === 0 ? (
            <div className="wfl-no-results">
              No workflows match "{search}"
            </div>
          ) : (
            groupedWorkflows.map(([phase, wfs]) => (
              <div key={phase} className="wfl-phase-group">
                {activePhase === 'all' && (
                  <div className="wfl-phase-label">
                    {PHASE_ICONS[phase] && <Icon name={PHASE_ICONS[phase]} size={14} />} {phase}
                  </div>
                )}
                {wfs.map(workflow => (
                  <button
                    key={workflow.id}
                    className="wfl-card"
                    onClick={() => handleWorkflowClick(workflow)}
                    title={workflow.description}
                  >
                    <div className="wfl-card-top">
                      <span className="wfl-card-name">{workflow.name}</span>
                      <span className="wfl-card-phase-badge">{phase}</span>
                    </div>
                    <div className="wfl-card-desc">
                      {workflow.description.split(/\.\s+Use when/i)[0]}
                    </div>
                    <div className="wfl-card-trigger">
                      <span className="wfl-trigger-arrow">→</span>
                      {formatTrigger(workflow.triggerPhrase)}
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="wfl-modal-footer">
          <span className="wfl-footer-hint">
            {filteredWorkflows.length} workflow{filteredWorkflows.length !== 1 ? 's' : ''}
            {search ? ` matching "${search}"` : activePhase !== 'all' ? ` in ${activePhase}` : ''}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
