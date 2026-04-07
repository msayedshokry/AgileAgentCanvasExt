import React, { useState, useRef, useCallback } from 'react';
import type { Artifact, ArtifactStatus, StoryMetadata, EpicMetadata, TestCoverageMetadata, AcceptanceCriterion } from '../types';
import { Icon, ARTIFACT_TYPE_ICON } from './Icon';
import { vscode } from '../vscodeApi';

interface ArtifactCardProps {
  artifact: Artifact;
  isSelected: boolean;
  isExpanded: boolean;
  /** Set of expanded badge labels for this artifact (undefined if no categories) */
  expandedCategories?: Set<string>;
  isFlashing?: boolean;
  isDimmed?: boolean;
  isSearchMatch?: boolean;
  compact?: boolean;
  /** Whether the story card's inline task/test rows are expanded */
  isStoryExpanded?: boolean;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Artifact>) => void;
  onToggleExpand: (id: string) => void;
  /** Toggle a single badge category within this parent */
  onToggleCategoryExpand: (parentId: string, label: string) => void;
  /** Toggle story inline task/test expansion */
  onToggleStoryExpand?: (id: string) => void;
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

export const ArtifactCard = React.memo(
  function ArtifactCard({
    artifact,
    isSelected,
    isExpanded,
    expandedCategories,
    isFlashing,
    isDimmed,
    isSearchMatch,
    compact,
    isStoryExpanded,
    onSelect,
    onOpenDetail,
    onUpdate,
    onToggleExpand: _onToggleExpand,
    onToggleCategoryExpand,
    onToggleStoryExpand,
    onRefineWithAI,
    onElicit
  }: ArtifactCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(artifact.title);
  const [activeStoryTab, setActiveStoryTab] = useState<'tasks' | 'tests' | 'acs'>('tasks');
  const storyExpanded = isStoryExpanded ?? false;
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
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <div className="artifact-header">
          <span className="artifact-icon"><Icon name={ARTIFACT_TYPE_ICON[artifact.type] || 'story'} size={12} /></span>
          <span className="artifact-id" title={artifact.id}>{artifact.id}</span>
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
      className={`artifact-card ${artifact.type} status-tint-${artifact.status} ${isSelected ? 'selected' : ''} ${hasChildren ? 'has-children' : ''} ${isExpanded ? 'expanded' : 'collapsed'} ${isFlashing ? 'flashing' : ''} ${isDimmed ? 'dimmed' : ''} ${isSearchMatch ? 'search-match' : ''}${storyExpanded && artifact.type === 'story' ? ' story-expanded' : ''}`}
      style={{
        left: artifact.position.x,
        top: artifact.position.y,
        width: artifact.size.width,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className="artifact-header">
        <span className="artifact-icon"><Icon name={ARTIFACT_TYPE_ICON[artifact.type] || 'story'} size={14} /></span>
        <span className="artifact-id" title={artifact.id}>{artifact.id}</span>
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

      {/* Labels */}
      {Array.isArray((artifact.metadata as any)?.labels) && (artifact.metadata as any).labels.length > 0 && (
        <div className="artifact-labels">
          {((artifact.metadata as any).labels as string[]).map((label: string, i: number) => (
            <span key={i} className="artifact-label-tag">{label}</span>
          ))}
        </div>
      )}

      {/* Categorized child breakdown badges — each badge independently toggles its category */}
      {artifact.type !== 'story' && hasChildren && artifact.childBreakdown && artifact.childBreakdown.length > 0 && (
        <div className="artifact-child-breakdown">
          {artifact.childBreakdown.map(b => {
            // Story cards: toggle local inline expansion instead of parent-child visibility
            const isStory = artifact.type === 'story';
            const isCatExpanded = isStory ? storyExpanded : (expandedCategories ? expandedCategories.has(b.label) : isExpanded);
            return (
              <span
                key={b.label}
                className={`child-breakdown-badge ${isCatExpanded ? 'badge-expanded' : 'badge-collapsed'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (isStory) {
                    onToggleStoryExpand?.(artifact.id);
                  } else {
                    onToggleCategoryExpand(artifact.id, b.label);
                  }
                }}
                title={`${isCatExpanded ? 'Hide' : 'Show'} ${b.label}`}
              >
                {b.count} {b.label}
                <Icon name={isCatExpanded ? 'chevron-down' : 'chevron-right'} size={8} />
              </span>
            );
          })}
        </div>
      )}

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
              <span className={`story-summary-chip tasks${epicMeta.doneStoryCount === epicMeta.totalStoryCount ? ' all-done' : ''}`} title={`${epicMeta.doneStoryCount ?? 0} out of ${epicMeta.totalStoryCount} stories completed`}>
                <span className="chip-icon">📚</span>
                <span className="chip-label">{epicMeta.doneStoryCount ?? 0}/{epicMeta.totalStoryCount}</span>
                <span className="chip-bar">
                  <span className="chip-fill" style={{ width: `${((epicMeta.doneStoryCount ?? 0) / epicMeta.totalStoryCount) * 100}%` }} />
                </span>
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

      {/* Inline story task/test summary — compact progress row + expandable mini-rows */}
      {artifact.type === 'story' && (() => {
        const sm = artifact.metadata as StoryMetadata;
        const tasks = sm?.tasks || [];
        const testCases = sm?.testCases || [];
        const acs: AcceptanceCriterion[] = sm?.acceptanceCriteria || [];
        if (tasks.length === 0 && testCases.length === 0 && acs.length === 0) return null;
        const doneTasks = tasks.filter(t => t.status === 'done' || t.status === 'verified').length;
        const passTests = testCases.filter(tc => tc.status === 'complete' || tc.status === 'completed' || tc.status === 'done').length;
        const failTests = testCases.filter(tc => tc.status === 'blocked' || tc.status === 'rejected').length;
        const verifiedACs = acs.filter(ac => ac.status === 'verified').length;
        const failedACs = acs.filter(ac => ac.status === 'failed').length;
        const getStatusIcon = (status: ArtifactStatus | undefined) => {
          if (status === 'complete' || status === 'completed' || status === 'done') return '✅';
          if (status === 'blocked' || status === 'rejected') return '❌';
          if (status === 'in-progress' || status === 'implementing') return '🔄';
          return '⬜';
        };
        const availableTabs = [
          ...(tasks.length > 0 ? ['tasks'] : []),
          ...(testCases.length > 0 ? ['tests'] : []),
          ...(acs.length > 0 ? ['acs'] : [])
        ];
        const currentTab = availableTabs.includes(activeStoryTab) ? activeStoryTab : (availableTabs[0] || 'tasks');

        const summaryParts = [];
        if (tasks.length > 0) summaryParts.push(`${tasks.length} Task${tasks.length === 1 ? '' : 's'}`);
        if (testCases.length > 0) summaryParts.push(`${testCases.length} Test${testCases.length === 1 ? '' : 's'}`);
        if (acs.length > 0) summaryParts.push(`${acs.length} AC${acs.length === 1 ? '' : 's'}`);
        const summaryText = summaryParts.join(' • ');

        return (
          <>
            {summaryText && (
              <div 
                className="story-inline-summary-title"
                onClick={(e) => { e.stopPropagation(); onToggleStoryExpand?.(artifact.id); }}
                title={storyExpanded ? 'Click to collapse' : 'Click to expand tasks, tests & ACs'}
              >
                {summaryText}
                <span style={{ marginLeft: '4px', opacity: 0.6 }}>
                  <Icon name={storyExpanded ? 'chevron-down' : 'chevron-right'} size={10} />
                </span>
              </div>
            )}
            <div
              className="story-inline-summary"
            >
              {tasks.length > 0 && (
                <span className={`story-summary-chip tasks${doneTasks === tasks.length ? ' all-done' : ''}`}
                      onClick={(e) => { e.stopPropagation(); if (!storyExpanded) onToggleStoryExpand?.(artifact.id); setActiveStoryTab('tasks'); }}
                      title="Click to view tasks">
                  <span className="chip-icon">✓</span>
                  <span className="chip-label">{doneTasks}/{tasks.length}</span>
                  <span className="chip-bar">
                    <span className="chip-fill" style={{ width: `${(doneTasks / tasks.length) * 100}%` }} />
                  </span>
                </span>
              )}
              {testCases.length > 0 && (
                <span className={`story-summary-chip tests${failTests > 0 ? ' has-fails' : passTests === testCases.length ? ' all-pass' : ''}`}
                      onClick={(e) => { e.stopPropagation(); if (!storyExpanded) onToggleStoryExpand?.(artifact.id); setActiveStoryTab('tests'); }}
                      title="Click to view tests">
                  <span className="chip-icon">🧪</span>
                  <span className="chip-label">{passTests}/{testCases.length}</span>
                  <span className="chip-bar">
                    <span className="chip-fill" style={{ width: `${(passTests / testCases.length) * 100}%` }} />
                  </span>
                </span>
              )}
              {acs.length > 0 && (
                <span className={`story-summary-chip acs${failedACs > 0 ? ' has-fails' : verifiedACs === acs.length ? ' all-pass' : ''}`}
                      onClick={(e) => { e.stopPropagation(); if (!storyExpanded) onToggleStoryExpand?.(artifact.id); setActiveStoryTab('acs'); }}
                      title="Click to view ACs">
                  <span className="chip-icon">📋</span>
                  <span className="chip-label">{verifiedACs}/{acs.length}</span>
                  <span className="chip-bar">
                    <span className="chip-fill" style={{ width: `${(verifiedACs / acs.length) * 100}%` }} />
                  </span>
                </span>
              )}
            </div>
            {storyExpanded && (
              <div className="story-expanded-rows">
                <div className="story-tabs-header">
                  {tasks.length > 0 && (
                    <button className={`story-tab ${currentTab === 'tasks' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setActiveStoryTab('tasks'); }}>
                      ✓ Tasks ({tasks.length})
                    </button>
                  )}
                  {testCases.length > 0 && (
                    <button className={`story-tab ${currentTab === 'tests' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setActiveStoryTab('tests'); }}>
                      🧪 Tests ({testCases.length})
                    </button>
                  )}
                  {acs.length > 0 && (
                    <button className={`story-tab ${currentTab === 'acs' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setActiveStoryTab('acs'); }}>
                      📋 ACs ({acs.length})
                    </button>
                  )}
                </div>
                
                <div className="story-tab-content">
                  {currentTab === 'tasks' && tasks.length > 0 && (
                    <div className="story-section">
                      {tasks.map((t, i) => (
                        <div key={i} className={`story-task-row${t.status === 'done' || t.status === 'verified' ? ' task-done' : ''}`}>
                          <span className="task-check">{t.status === 'done' || t.status === 'verified' ? '✅' : '☐'}</span>
                          <span className="task-title">{t.description || `Task ${i + 1}`}</span>
                          {t.estimatedHours != null && <span className="task-effort">{t.estimatedHours}h</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {currentTab === 'tests' && testCases.length > 0 && (
                    <div className="story-section">
                      {testCases.map((tc, i) => (
                        <div key={i} className={`story-test-row ${tc.status || 'draft'}`}>
                          <span className="test-icon">{getStatusIcon(tc.status)}</span>
                          <span className="test-title">{tc.title || `Test ${i + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {currentTab === 'acs' && acs.length > 0 && (
                    <div className="story-section">
                      {acs.map((ac, i) => (
                        <div key={ac.id || i} className={`story-ac-row ${ac.status || 'draft'}`}>
                          <span className="ac-icon">{ac.status === 'verified' ? '✅' : ac.status === 'failed' ? '❌' : '⬜'}</span>
                          <span className="ac-title">{ac.criterion || (ac.given ? `Given ${ac.given}` : `AC ${i + 1}`)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
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
}, (prevProps, nextProps) => {
  if (prevProps.artifact !== nextProps.artifact) return false;
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.isExpanded !== nextProps.isExpanded) return false;
  if (prevProps.isFlashing !== nextProps.isFlashing) return false;
  if (prevProps.isDimmed !== nextProps.isDimmed) return false;
  if (prevProps.isSearchMatch !== nextProps.isSearchMatch) return false;
  if (prevProps.compact !== nextProps.compact) return false;
  if (prevProps.isStoryExpanded !== nextProps.isStoryExpanded) return false;

  const prevCat = prevProps.expandedCategories;
  const nextCat = nextProps.expandedCategories;
  if (prevCat !== nextCat) {
    if (!prevCat || !nextCat) return false;
    if (prevCat.size !== nextCat.size) return false;
    for (const cat of prevCat) {
      if (!nextCat.has(cat)) return false;
    }
  }

  return true;
});
