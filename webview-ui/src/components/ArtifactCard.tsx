import { useState, useRef, useCallback } from 'react';
import type { Artifact, StoryMetadata, EpicMetadata, TestCoverageMetadata } from '../types';
import { Icon, ARTIFACT_TYPE_ICON } from './Icon';
import { vscode } from '../vscodeApi';

interface ArtifactCardProps {
  artifact: Artifact;
  isSelected: boolean;
  isExpanded: boolean;
  isFlashing?: boolean;
  isDimmed?: boolean;
  isSearchMatch?: boolean;
  compact?: boolean;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Artifact>) => void;
  onToggleExpand: (id: string) => void;
  onRefineWithAI?: (artifact: Artifact) => void;
  onElicit?: (artifact: Artifact) => void;
}

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
  // TEA module
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
  // BMM module
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
  // CIS module
  'storytelling': 'Storytelling',
  'problem-solving': 'Problem Solving',
  'innovation-strategy': 'Innovation Strategy',
  'design-thinking': 'Design Thinking',
};

const STATUS_BADGES: Record<Artifact['status'], { label: string; className: string }> = {
  'draft': { label: 'Draft', className: 'status-draft' },
  'ready': { label: 'Ready', className: 'status-ready' },
  'ready-for-dev': { label: 'Ready for Dev', className: 'status-ready' },
  'in-progress': { label: 'In Progress', className: 'status-in-progress' },
  'implementing': { label: 'Implementing', className: 'status-in-progress' },
  'in-review': { label: 'In Review', className: 'status-review' },
  'review': { label: 'Review', className: 'status-review' },
  'ready-for-review': { label: 'Ready for Review', className: 'status-review' },
  'blocked': { label: 'Blocked', className: 'status-blocked' },
  'complete': { label: 'Complete', className: 'status-complete' },
  'completed': { label: 'Completed', className: 'status-complete' },
  'done': { label: 'Done', className: 'status-complete' },
  'approved': { label: 'Approved', className: 'status-approved' },
  'archived': { label: 'Archived', className: 'status-archived' },
  'not-started': { label: 'Not Started', className: 'status-draft' },
  'backlog': { label: 'Backlog', className: 'status-draft' },
  'proposed': { label: 'Proposed', className: 'status-draft' },
  'accepted': { label: 'Accepted', className: 'status-approved' },
  'deprecated': { label: 'Deprecated', className: 'status-archived' },
  'superseded': { label: 'Superseded', className: 'status-archived' },
  'rejected': { label: 'Rejected', className: 'status-blocked' },
};

export function ArtifactCard({ artifact, isSelected, isExpanded, isFlashing, isDimmed, isSearchMatch, compact, onSelect, onOpenDetail, onUpdate, onToggleExpand, onRefineWithAI, onElicit }: ArtifactCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(artifact.title);
  const cardRef = useRef<HTMLDivElement>(null);

  // Determine if this card has children that can be expanded/collapsed
  const hasChildren = (artifact.childCount ?? 0) > 0;

  // Single click to select
  const handleClick = useCallback((e: React.MouseEvent) => {
    // Don't select if clicking on buttons or editing
    if ((e.target as HTMLElement).closest('button') || isEditing) return;
    
    e.stopPropagation();
    onSelect(artifact.id);
  }, [artifact.id, isEditing, onSelect]);

  // Double click to open detail panel
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenDetail(artifact.id);
  }, [artifact.id, onOpenDetail]);

  // Handle inline title editing (triggered by clicking the title when selected)
  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelected) {
      setIsEditing(true);
      setEditTitle(artifact.title);
    }
  }, [isSelected, artifact.title]);

  const handleTitleSave = useCallback(() => {
    if (editTitle.trim() !== artifact.title) {
      onUpdate(artifact.id, { title: editTitle.trim() });
    }
    setIsEditing(false);
  }, [editTitle, artifact.id, artifact.title, onUpdate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setIsEditing(false);
      setEditTitle(artifact.title);
    }
  }, [handleTitleSave, artifact.title]);

  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onToggleExpand(artifact.id);
  }, [artifact.id, onToggleExpand]);

  // Handle AI refine button click
  const handleRefineClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onRefineWithAI?.(artifact);
  }, [artifact, onRefineWithAI]);

  // Handle Elicit button click
  const handleElicitClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onElicit?.(artifact);
  }, [artifact, onElicit]);

   // Handle Start Dev button click — always posts directly to extension host
  const handleLaunchDevClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
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
  }, [artifact]);

  // Handle info button click to open detail panel
  const handleInfoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onOpenDetail(artifact.id);
  }, [artifact.id, onOpenDetail]);

  // Handle docs button click — posts to extension host to open /write-doc
  const handleDocsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    vscode.postMessage({
      type: 'startDocumentation',
      artifact: {
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        description: artifact.description,
        status: artifact.status,
        metadata: artifact.metadata
      }
    });
  }, [artifact]);

  // Safely get status info with fallback
  const statusInfo = STATUS_BADGES[artifact.status] || { label: artifact.status || 'Unknown', className: 'status-draft' };

  // Virtual phase nodes (from mindmap layout) — render as a simple label, not interactive
  if (artifact.id.startsWith('__phase_')) {
    return (
      <div
        className="artifact-card phase-node"
        style={{
          left: artifact.position.x,
          top: artifact.position.y,
          width: artifact.size.width,
          minHeight: artifact.size.height,
        }}
      >
        <div className="phase-node-label">{artifact.title}</div>
      </div>
    );
  }

  // Compact mode — simplified card for mindmap view
  if (compact) {
    return (
      <div
        ref={cardRef}
        className={`artifact-card compact ${artifact.type} status-tint-${artifact.status} ${isSelected ? 'selected' : ''} ${isFlashing ? 'flashing' : ''} ${isDimmed ? 'dimmed' : ''} ${isSearchMatch ? 'search-match' : ''}`}
        style={{
          left: artifact.position.x,
          top: artifact.position.y,
          width: artifact.size.width,
          minHeight: artifact.size.height,
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <div className="artifact-header">
          <span className="artifact-icon"><Icon name={ARTIFACT_TYPE_ICON[artifact.type] || 'story'} size={12} /></span>
          <span className="artifact-type">{TYPE_LABELS[artifact.type] ?? artifact.type}</span>
          <span className={`artifact-status ${statusInfo.className}`}>{statusInfo.label}</span>
        </div>
        <div className="artifact-title">
          <h3>{artifact.title}</h3>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`artifact-card ${artifact.type} status-tint-${artifact.status} ${isSelected ? 'selected' : ''} ${hasChildren ? 'has-children' : ''} ${isExpanded ? 'expanded' : 'collapsed'} ${isFlashing ? 'flashing' : ''} ${isDimmed ? 'dimmed' : ''} ${isSearchMatch ? 'search-match' : ''}`}
      style={{
        left: artifact.position.x,
        top: artifact.position.y,
        width: artifact.size.width,
        minHeight: artifact.size.height,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className="artifact-header">
        <span className="artifact-icon"><Icon name={ARTIFACT_TYPE_ICON[artifact.type] || 'story'} size={14} /></span>
        <span className="artifact-type">{TYPE_LABELS[artifact.type] ?? artifact.type}</span>
        <span className={`artifact-status ${statusInfo.className}`}>{statusInfo.label}</span>
        <span className="artifact-header-actions">
          {/* Info button to open detail panel */}
          <button 
            className="card-info-btn" 
            onClick={handleInfoClick}
            title="View details"
          >
            <Icon name="info" size={14} />
          </button>

          {/* Documentation button */}
          <button
            className="card-docs-btn"
            onClick={handleDocsClick}
            title="Write documentation"
          >
            <Icon name="docs" size={14} />
          </button>
          
          {/* AI Refine button */}
          <button 
            className="card-ai-btn" 
            onClick={handleRefineClick}
            title="Refine with AI"
          >
            <Icon name="sparkle" size={14} />
          </button>

          {/* Elicit button */}
          <button
            className="card-elicit-btn"
            onClick={handleElicitClick}
            title="Elicit with method"
          >
            <Icon name="crystal-ball" size={14} />
          </button>

          {/* Start Dev button — only for epic/story/test-case */}
          {['epic', 'story', 'test-case'].includes(artifact.type) && (
            <button
              className="card-dev-btn"
              onClick={handleLaunchDevClick}
              title="Start development"
            >
              <Icon name="rocket" size={14} />
            </button>
          )}
          
          {/* Expand/Collapse button for cards with children */}
          {hasChildren && (
            <button 
              className="expand-btn" 
              onClick={handleExpandClick}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <span className="expand-icon"><Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={12} /></span>
              <span className="child-count">{artifact.childCount}</span>
            </button>
          )}
        </span>
      </div>
      
      <div className="artifact-title" onClick={handleTitleClick}>
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <h3 title={isSelected ? "Click to edit title" : undefined}>{artifact.title}</h3>
        )}
      </div>

      {/* Parent epic label — only on story cards */}
      {artifact.type === 'story' && (artifact.metadata as StoryMetadata)?.epicTitle && (
        <div className="artifact-parent-epic">
          <span className="parent-epic-label"><Icon name="epic" size={12} /> {(artifact.metadata as StoryMetadata).epicTitle}</span>
        </div>
      )}
      
      <div className="artifact-description">
        <p>{artifact.description}</p>
      </div>

      {/* Agile badges — priority, story points, roll-up counts */}
      {(artifact.type === 'story' || artifact.type === 'epic') && (() => {
        const meta = artifact.metadata as StoryMetadata | EpicMetadata;
        const priority = meta?.priority;
        const storyPts = artifact.type === 'story'
          ? (meta as StoryMetadata)?.storyPoints
          : undefined;
        const epicMeta = artifact.type === 'epic' ? (meta as EpicMetadata) : undefined;
        const hasBadges = priority || storyPts !== undefined || epicMeta?.totalStoryCount !== undefined;
        if (!hasBadges) return null;
        return (
          <div className="artifact-agile-badges">
            {priority && (
              <span className={`agile-badge priority priority-${priority.replace(/[^a-zA-Z0-9]/g, '-')}`}>
                {priority}
              </span>
            )}
            {storyPts !== undefined && (
              <span className="agile-badge story-points">{storyPts} pts</span>
            )}
            {epicMeta && epicMeta.totalStoryCount !== undefined && epicMeta.totalStoryCount > 0 && (
              <span className="agile-badge story-progress">
                {epicMeta.doneStoryCount ?? 0}/{epicMeta.totalStoryCount} done
              </span>
            )}
            {epicMeta?.totalStoryPoints !== undefined && epicMeta.totalStoryPoints > 0 && (
              <span className="agile-badge story-points">{epicMeta.totalStoryPoints} pts</span>
            )}
          </div>
        );
      })()}

      {/* Story dependency badges — only show genuine blocking relationships */}
      {artifact.type === 'story' && (() => {
        const sm = artifact.metadata as StoryMetadata;
        const blockedBy = sm?.dependencies?.blockedBy?.length ?? 0;
        const blocks = sm?.dependencies?.blocks?.length ?? 0;
        if (blockedBy === 0 && blocks === 0) return null;
        return (
          <div className="artifact-dependencies">
            {blockedBy > 0 && (
              <span className="dep-badge blocked-by" title={`Blocked by ${blockedBy} ${blockedBy === 1 ? 'story' : 'stories'}`}>
                <Icon name="risk" size={11} /> Blocked by: {blockedBy}
              </span>
            )}
            {blocks > 0 && (
              <span className="dep-badge blocks-others" title={`Blocks ${blocks} ${blocks === 1 ? 'story' : 'stories'}`}>
                <Icon name="split" size={11} /> Blocks: {blocks}
              </span>
            )}
          </div>
        );
      })()}

      {/* Test coverage summary bar — shown on test-coverage cards */}
      {artifact.type === 'test-coverage' && (() => {
        const tcm = artifact.metadata as TestCoverageMetadata;
        const total = tcm?.totalCount ?? 0;
        const pass = tcm?.passCount ?? 0;
        const fail = tcm?.failCount ?? 0;
        const draft = tcm?.draftCount ?? 0;
        if (total === 0) return null;
        const pct = Math.round((pass / total) * 100);
        return (
          <div className="tc-coverage-bar">
            <div className="tc-coverage-stats">
              <span className="tc-stat tc-pass">{pass} pass</span>
              <span className="tc-stat tc-fail">{fail} fail</span>
              <span className="tc-stat tc-draft">{draft} draft</span>
            </div>
            <div className="tc-coverage-track">
              {pass > 0 && <div className="tc-coverage-fill tc-fill-pass" style={{ width: `${(pass / total) * 100}%` }} />}
              {fail > 0 && <div className="tc-coverage-fill tc-fill-fail" style={{ width: `${(fail / total) * 100}%` }} />}
              {draft > 0 && <div className="tc-coverage-fill tc-fill-draft" style={{ width: `${(draft / total) * 100}%` }} />}
            </div>
            <div className="tc-coverage-pct">{pct}% passing</div>
          </div>
        );
      })()}
      
      {/* Verbose sections preview for epics */}
      {artifact.type === 'epic' && artifact.metadata && (
        <div className="artifact-verbose-preview">
          {'useCases' in artifact.metadata && (
            <span className="verbose-badge use-cases">UC</span>
          )}
          {'fitCriteria' in artifact.metadata && (
            <span className="verbose-badge fit-criteria">FC</span>
          )}
          {'successMetrics' in artifact.metadata && (
            <span className="verbose-badge metrics">SM</span>
          )}
          {'risks' in artifact.metadata && (
            <span className="verbose-badge risks">R</span>
          )}
          {'definitionOfDone' in artifact.metadata && (
            <span className="verbose-badge dod">DoD</span>
          )}
        </div>
      )}
    </div>
  );
}
