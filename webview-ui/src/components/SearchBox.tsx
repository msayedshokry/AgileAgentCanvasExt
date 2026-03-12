import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { Artifact } from '../types';
import { Icon, ARTIFACT_TYPE_ICON } from './Icon';

/** Human-readable type labels (mirrors ArtifactCard.TYPE_LABELS) */
const TYPE_LABELS: Record<Artifact['type'], string> = {
  'vision': 'Vision',
  'requirement': 'Requirement',
  'nfr': 'Non-Functional',
  'additional-req': 'Additional Req',
  'epic': 'Epic',
  'story': 'Story',
  'use-case': 'Use Case',
  'prd': 'PRD',
  'architecture': 'Architecture',
  'architecture-decision': 'Decision',
  'system-component': 'Component',
  'product-brief': 'Product Brief',
  'test-case': 'Test Case',
  'test-coverage': 'Test Coverage',
  'test-strategy': 'Test Strategy',
  'test-design': 'Test Design',
  'task': 'Task',
  'risk': 'Risk',
  'traceability-matrix': 'Traceability Matrix',
  'test-review': 'Test Review',
  'nfr-assessment': 'NFR Assessment',
  'test-framework': 'Test Framework',
  'ci-pipeline': 'CI Pipeline',
  'automation-summary': 'Automation Summary',
  'atdd-checklist': 'ATDD Checklist',
  'test-design-qa': 'Test Design (QA)',
  'test-design-architecture': 'Test Design (Arch)',
  'test-cases': 'Test Cases',
  'research': 'Research',
  'ux-design': 'UX Design',
  'readiness-report': 'Readiness Report',
  'sprint-status': 'Sprint Status',
  'retrospective': 'Retrospective',
  'change-proposal': 'Change Proposal',
  'code-review': 'Code Review',
  'risks': 'Risks',
  'definition-of-done': 'Definition of Done',
  'fit-criteria': 'Fit Criteria',
  'success-metrics': 'Success Metrics',
  'project-overview': 'Project Overview',
  'project-context': 'Project Context',
  'tech-spec': 'Tech Spec',
  'test-summary': 'Test Summary',
  'source-tree': 'Source Tree',
  'storytelling': 'Storytelling',
  'problem-solving': 'Problem Solving',
  'innovation-strategy': 'Innovation Strategy',
  'design-thinking': 'Design Thinking',
};

const STATUS_LABELS: Record<string, string> = {
  'draft': 'Draft',
  'ready': 'Ready',
  'ready-for-dev': 'Ready for Dev',
  'in-progress': 'In Progress',
  'implementing': 'Implementing',
  'in-review': 'In Review',
  'review': 'Review',
  'ready-for-review': 'Ready for Review',
  'blocked': 'Blocked',
  'complete': 'Complete',
  'completed': 'Completed',
  'done': 'Done',
  'approved': 'Approved',
  'archived': 'Archived',
  'not-started': 'Not Started',
  'backlog': 'Backlog',
  'proposed': 'Proposed',
  'accepted': 'Accepted',
  'deprecated': 'Deprecated',
  'superseded': 'Superseded',
  'rejected': 'Rejected',
};

interface SearchBoxProps {
  artifacts: Artifact[];
  open: boolean;
  onClose: () => void;
  /** Called when user selects a result — parent should center canvas + select */
  onSelectResult: (id: string) => void;
  /** Called whenever the set of matching IDs changes, so parent can highlight cards on canvas */
  onMatchesChange?: (matchIds: Set<string>) => void;
}

export function SearchBox({ artifacts, open, onClose, onSelectResult, onMatchesChange }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened; clear matches when closed
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlightIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      // Clear match highlights when search is closed
      onMatchesChange?.(new Set());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute matching artifacts
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return artifacts.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q) ||
      (TYPE_LABELS[a.type] ?? '').toLowerCase().includes(q)
    );
  }, [query, artifacts]);

  // Clamp highlight index when matches change
  useEffect(() => {
    if (highlightIndex >= matches.length) {
      setHighlightIndex(0);
    }
  }, [matches.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Report match IDs to parent for card highlighting on canvas
  useEffect(() => {
    if (onMatchesChange) {
      const ids = new Set(matches.map(a => a.id));
      onMatchesChange(ids);
    }
  }, [matches, onMatchesChange]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const highlighted = listRef.current.querySelector('.sb-result-item.highlighted');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const handleSelect = useCallback((id: string) => {
    onSelectResult(id);
    onClose();
  }, [onSelectResult, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query) {
        // First Escape clears the query
        setQuery('');
        setHighlightIndex(0);
      } else {
        // Second Escape closes the search
        onClose();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (matches.length > 0) {
        setHighlightIndex(i => (i + 1) % matches.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length > 0) {
        setHighlightIndex(i => (i - 1 + matches.length) % matches.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0 && matches[highlightIndex]) {
        handleSelect(matches[highlightIndex].id);
      }
      return;
    }
  }, [query, matches, highlightIndex, handleSelect, onClose]);

  if (!open) return null;

  return (
    <div className="sb-overlay" onKeyDown={handleKeyDown}>
      <div className="sb-container">
        {/* Input row */}
        <div className="sb-input-row">
          <Icon name="search" size={14} />
          <input
            ref={inputRef}
            className="sb-input"
            type="text"
            placeholder="Search artifacts..."
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlightIndex(0); }}
          />
          {query && (
            <span className="sb-match-count">
              {matches.length} {matches.length === 1 ? 'match' : 'matches'}
            </span>
          )}
          <button
            className="sb-close-btn"
            title="Close search (Esc)"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {/* Results dropdown */}
        {query.trim() && (
          <div className="sb-results" ref={listRef}>
            {matches.length === 0 ? (
              <div className="sb-no-results">No matching artifacts</div>
            ) : (
              matches.map((art, idx) => {
                const iconName = ARTIFACT_TYPE_ICON[art.type] ?? 'info';
                const typeLabel = TYPE_LABELS[art.type] ?? art.type;
                const statusLabel = STATUS_LABELS[art.status] ?? art.status;
                return (
                  <button
                    key={art.id}
                    className={`sb-result-item ${idx === highlightIndex ? 'highlighted' : ''}`}
                    onClick={() => handleSelect(art.id)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                  >
                    <span className="sb-result-icon">
                      <Icon name={iconName} size={14} />
                    </span>
                    <span className="sb-result-type">{typeLabel}</span>
                    <span className="sb-result-title">{art.title}</span>
                    <span className={`sb-result-status sb-status-${art.status}`}>{statusLabel}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
