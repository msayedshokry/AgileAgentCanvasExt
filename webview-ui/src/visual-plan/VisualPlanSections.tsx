// ─── Visual Plan Sections ────────────────────────────────────────────────────
// The ONE shared renderer for VisualPlan display. Rendered by:
//   - The canvas DetailPanel (case 'visual-plan')
//   - The Agentic Kanban inline panel (like DiffPanel)
//   - The pop-out full-window app (AC_MODE='visual-plan')
//
// Mirrors the DiffPanel structured-panel pattern (DiffPanel.tsx:115-242).

import { useState, useCallback } from 'react';
import type { VisualPlan, PlanSection } from './types';
import './VisualPlan.css';

// ── Props ───────────────────────────────────────────────────────────────────

export interface VisualPlanSectionsProps {
  plan: VisualPlan | null;
  /** Called when the user clicks Approve & Dispatch. */
  onApprove?: (taskIds: string[]) => void;
  /** Called when the user clicks Request Changes. */
  onRequestChanges?: (comments: { sectionId: string; body: string }[]) => void;
  /** Called when the user adds a comment. */
  onComment?: (comment: { sectionId: string; body: string }) => void;
  /** If true, shows the approve bar footer. */
  showApproveBar?: boolean;
  /** If true, hides the close button. */
  hideClose?: boolean;
  /** Called when the user clicks close. */
  onClose?: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, string> = {
  overview: '📋',
  fileMap: '📁',
  diagram: '📊',
  wireframe: '🖼️',
  apiSpec: '🔌',
  schemaMap: '🗄️',
  annotatedCode: '💻',
  openQuestions: '❓',
  tasks: '✅',
};

const SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  fileMap: 'File Map',
  diagram: 'Diagram',
  wireframe: 'Wireframe',
  apiSpec: 'API Spec',
  schemaMap: 'Schema Map',
  annotatedCode: 'Annotated Code',
  openQuestions: 'Open Questions',
  tasks: 'Tasks',
};

function statusLabel(s: string): string {
  return s.replace(/-/g, ' ');
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

// ── Section renderers ───────────────────────────────────────────────────────

function OverviewSection({ section }: { section: PlanSection & { kind: 'overview' } }) {
  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        <div className="vp-overview-markdown">
          {section.markdown.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        {section.risk && (
          <span className={`vp-risk-badge vp-risk-badge--${section.risk}`}>
            Risk: {section.risk}
          </span>
        )}
      </div>
    </div>
  );
}

function FileMapSection({ section }: { section: PlanSection & { kind: 'fileMap' } }) {
  if (!section.entries.length) {
    return <div className="vp-section"><div className="vp-section-body">No files listed.</div></div>;
  }
  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        <ul className="vp-file-list">
          {section.entries.map((entry, i) => (
            <li key={i} className="vp-file-entry">
              <span className={`vp-file-change vp-file-change--${entry.change}`}>
                {entry.change === 'add' ? 'NEW' : entry.change === 'delete' ? 'DEL' : entry.change === 'rename' ? 'REN' : 'MOD'}
              </span>
              <span className="vp-file-path">{entry.path}</span>
              {entry.note && <span className="vp-file-note">{entry.note}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DiagramSection({ section }: { section: PlanSection & { kind: 'diagram' } }) {
  const { diagram } = section;
  if (!diagram.nodes?.length) return null;

  const nodePositions = new Map<string, { x: number; y: number }>();
  const cols = Math.ceil(Math.sqrt(diagram.nodes.length));
  diagram.nodes.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    nodePositions.set(n.id, { x: 60 + col * 160, y: 40 + row * 80 });
  });

  const svgWidth = cols * 160 + 40;
  const svgHeight = Math.ceil(diagram.nodes.length / cols) * 80 + 40;

  return (
    <div className="vp-section" id={`section-${section.id}`}>
      {diagram.title && <div className="vp-section-title">{diagram.title}</div>}
      <div className="vp-section-body">
        <svg className="vp-diagram-svg" viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height={svgHeight}>
          {/* Edges */}
          {diagram.edges?.map((edge, i) => {
            const from = nodePositions.get(edge.from);
            const to = nodePositions.get(edge.to);
            if (!from || !to) return null;
            return (
              <g key={`edge-${i}`}>
                <line x1={from.x} y1={from.y + 12} x2={to.x} y2={to.y + 12}
                  stroke="var(--vscode-focusBorder, #007acc)" strokeWidth="1.5"
                  markerEnd="url(#arrowhead)" />
                {edge.label && (
                  <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2} textAnchor="middle"
                    fill="var(--vscode-descriptionForeground)" fontSize="10">
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {/* Arrow marker */}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="var(--vscode-focusBorder, #007acc)" />
            </marker>
          </defs>
          {/* Nodes */}
          {diagram.nodes.map((node) => {
            const pos = nodePositions.get(node.id)!;
            return (
              <g key={node.id}>
                <rect x={pos.x - 50} y={pos.y - 2} width="100" height="28" rx="4"
                  fill="var(--vscode-editor-background)" stroke="var(--vscode-focusBorder, #007acc)" strokeWidth="1.5" />
                <text x={pos.x} y={pos.y + 16} textAnchor="middle"
                  fill="var(--vscode-editor-foreground)" fontSize="11" fontFamily="monospace">
                  {node.label || node.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function WireframeSection({ section }: { section: PlanSection & { kind: 'wireframe' } }) {
  const { wireframe } = section;
  if (!wireframe.sections?.length) return null;

  return (
    <div className="vp-section" id={`section-${section.id}`}>
      {wireframe.title && <div className="vp-section-title">{wireframe.title}</div>}
      {wireframe.description && <div className="vp-section-body" style={{ marginBottom: 8, color: 'var(--vscode-descriptionForeground)' }}>{wireframe.description}</div>}
      <div className="vp-section-body">
        {wireframe.sections.map((ws) => (
          <div key={ws.id} style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: 4, padding: '8px 12px', marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{ws.label}</div>
            {ws.elements?.map((el, ei) => (
              <div key={ei} style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', paddingLeft: 12 }}>
                [{el.type}] {el.label}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiSpecSection({ section }: { section: PlanSection & { kind: 'apiSpec' } }) {
  if (!section.entries.length) return null;
  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        <table className="vp-api-table">
          <thead>
            <tr><th>Method</th><th>Path</th><th>Summary</th><th>Responses</th></tr>
          </thead>
          <tbody>
            {section.entries.map((entry, i) => (
              <tr key={i}>
                <td><span className={`vp-api-method vp-api-method--${entry.method}`}>{entry.method}</span></td>
                <td style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>{entry.path}</td>
                <td>{entry.summary || '—'}</td>
                <td>
                  {entry.responses?.map((r, ri) => (
                    <div key={ri} className="vp-api-response">
                      <span className="vp-api-response-code">{r.code}</span> {r.description}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SchemaMapSection({ section }: { section: PlanSection & { kind: 'schemaMap' } }) {
  if (!section.entities.length) return null;
  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        {section.entities.map((entity, i) => (
          <div key={i} className="vp-schema-entity">
            <div className="vp-schema-entity-name">{entity.name}</div>
            <div className="vp-schema-fields">
              {entity.fields?.map((f, fi) => (
                <div key={fi} className="vp-schema-field">
                  {f.name}: <span style={{ color: 'var(--vscode-charts-blue, #0ea5e9)' }}>{f.type}</span>
                  {f.required && <span style={{ color: 'var(--vscode-errorForeground, #ef4444)' }}> *</span>}
                </div>
              ))}
            </div>
            {entity.relationships?.map((r, ri) => (
              <div key={ri} className="vp-schema-rel">
                → {r.target} ({r.type}{r.cardinality ? `, ${r.cardinality}` : ''})
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnotatedCodeSection({ section }: { section: PlanSection & { kind: 'annotatedCode' } }) {
  if (!section.blocks.length) return null;
  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        {section.blocks.map((block, i) => (
          <div key={i} className="vp-code-block">
            <div className="vp-code-header">{block.file}</div>
            <div className="vp-code-body">{block.code}</div>
            {block.annotations && block.annotations.length > 0 && (
              <div className="vp-code-annotations">
                {block.annotations.map((a, ai) => (
                  <div key={ai} className="vp-code-annotation">
                    <span className="vp-code-annotation-line">L{a.line}</span>
                    <span className="vp-code-annotation-comment">{a.comment}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OpenQuestionsSection({ section }: { section: PlanSection & { kind: 'openQuestions' } }) {
  if (!section.questions.length) return null;
  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        {section.questions.map((q) => (
          <div key={q.id} className="vp-question-item">
            <span className="vp-question-text">{q.question}</span>
            {q.status && (
              <span className={`vp-question-status vp-question-status--${q.status}`}>{q.status}</span>
            )}
            {q.answer && <div className="vp-question-answer">{q.answer}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksSection({
  section,
  selectedTasks,
  onToggleTask,
}: {
  section: PlanSection & { kind: 'tasks' };
  selectedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
}) {
  if (!section.tasks.length) return null;
  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        <ul className="vp-task-list">
          {section.tasks.map((task) => (
            <li key={task.id} className="vp-task-item">
              <input
                type="checkbox"
                className="vp-task-checkbox"
                checked={selectedTasks.has(task.id)}
                onChange={() => onToggleTask(task.id)}
              />
              <div>
                <div className="vp-task-title">
                  {task.priority && <span style={{ marginRight: 6, color: 'var(--vscode-charts-orange, #f59e0b)', fontWeight: 600 }}>[{task.priority}]</span>}
                  {task.title}
                </div>
                {task.description && <div className="vp-task-desc">{task.description}</div>}
                {task.scope && task.scope.length > 0 && (
                  <div className="vp-task-scope">
                    {task.scope.map((file, fi) => (
                      <span key={fi} className="vp-task-file-tag">{file}</span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Comment thread ──────────────────────────────────────────────────────────

function CommentThread({
  comments,
  activeSectionId,
  onComment,
}: {
  comments: VisualPlan['comments'];
  activeSectionId: string;
  onComment?: (comment: { sectionId: string; body: string }) => void;
}) {
  const [body, setBody] = useState('');
  const sectionComments = comments.filter((c) => c.sectionId === activeSectionId);

  const handleSend = useCallback(() => {
    if (!body.trim() || !activeSectionId) return;
    onComment?.({ sectionId: activeSectionId, body: body.trim() });
    setBody('');
  }, [body, activeSectionId, onComment]);

  return (
    <div className="vp-comments">
      {sectionComments.map((c) => (
        <div key={c.id} className="vp-comment-item">
          <div className="vp-comment-meta">
            {c.author || 'Anonymous'} · {formatTime(c.createdAt)}
          </div>
          <div>{c.body}</div>
        </div>
      ))}
      <div className="vp-comment-input">
        <input
          type="text"
          placeholder="Add a comment..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}

// ── Approve bar ─────────────────────────────────────────────────────────────

function ApproveBar({
  selectedCount,
  totalCount,
  onApprove,
  onRequestChanges,
}: {
  selectedCount: number;
  totalCount: number;
  onApprove?: () => void;
  onRequestChanges?: () => void;
}) {
  return (
    <div className="vp-approve-bar">
      <span className="vp-approve-hint">
        {selectedCount === 0
          ? 'Select tasks to approve'
          : `${selectedCount} of ${totalCount} tasks selected`}
      </span>
      <button className="vp-approve-btn vp-approve-btn--changes" onClick={onRequestChanges}>
        Request Changes
      </button>
      <button
        className="vp-approve-btn vp-approve-btn--approve"
        disabled={selectedCount === 0}
        onClick={onApprove}
      >
        Approve & Dispatch
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function VisualPlanSections({
  plan,
  onApprove,
  onRequestChanges,
  onComment,
  showApproveBar = true,
  hideClose = false,
  onClose,
}: VisualPlanSectionsProps) {
  const [activeSectionId, setActiveSectionId] = useState<string>('');
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

  // Empty state
  if (!plan) {
    return (
      <div className="vp-panel vp-panel--empty">
        <div>No plan yet — generate one to review.</div>
      </div>
    );
  }

  // Generating state
  if (plan.status === 'generating') {
    return (
      <div className="vp-panel">
        <div className="vp-generating">
          <div className="vp-spinner" />
          <div>Generating plan...</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>"{plan.goal}"</div>
        </div>
      </div>
    );
  }

  const handleToggleTask = useCallback((taskId: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const handleApprove = useCallback(() => {
    onApprove?.(Array.from(selectedTasks));
  }, [selectedTasks, onApprove]);

  const handleRequestChanges = useCallback(() => {
    onRequestChanges?.([]);
  }, [onRequestChanges]);

  const tasksSection = plan.sections.find(
    (s): s is PlanSection & { kind: 'tasks' } => s.kind === 'tasks'
  );
  const totalTaskCount = tasksSection?.tasks.length ?? 0;

  const activeSection = activeSectionId
    ? plan.sections.find((s) => s.id === activeSectionId)
    : plan.sections[0];

  return (
    <div className="vp-panel" aria-label="Visual plan review">
      {/* Header */}
      <div className="vp-panel-header">
        <span className="vp-panel-title">{plan.title}</span>
        <span className={`vp-status-pill vp-status-pill--${plan.status}`}>
          {statusLabel(plan.status)}
        </span>
        <div className="vp-header-stats">
          <span className="vp-header-stat">{plan.sections.length} sections</span>
          <span className="vp-header-stat">{totalTaskCount} tasks</span>
          <span className="vp-header-stat">{plan.comments.length} comments</span>
        </div>
        {!hideClose && (
          <button className="vp-close-btn" onClick={onClose} aria-label="Close plan">
            ✕
          </button>
        )}
      </div>

      {/* Body: outline rail + content */}
      <div className="vp-panel-body">
        <div className="vp-outline">
          {plan.sections.map((s) => (
            <div
              key={s.id}
              className={`vp-outline-item ${s.id === activeSectionId ? 'vp-outline-item--active' : ''}`}
              onClick={() => setActiveSectionId(s.id)}
            >
              <span className="vp-outline-icon">{SECTION_ICONS[s.kind] || '📄'}</span>
              {SECTION_LABELS[s.kind] || s.kind}
            </div>
          ))}
        </div>

        <div className="vp-content">
          {activeSection ? (
            <>
              <div className="vp-section-title">
                {SECTION_LABELS[activeSection.kind] || activeSection.kind}
              </div>
              <SectionRenderer section={activeSection} selectedTasks={selectedTasks} onToggleTask={handleToggleTask} />
            </>
          ) : (
            <div style={{ color: 'var(--vscode-descriptionForeground)', padding: 20 }}>
              Select a section from the outline.
            </div>
          )}
        </div>
      </div>

      {/* Comment thread */}
      <CommentThread
        comments={plan.comments}
        activeSectionId={activeSectionId}
        onComment={onComment}
      />

      {/* Approve bar */}
      {showApproveBar && (
        <ApproveBar
          selectedCount={selectedTasks.size}
          totalCount={totalTaskCount}
          onApprove={handleApprove}
          onRequestChanges={handleRequestChanges}
        />
      )}
    </div>
  );
}

// ── Section dispatcher ──────────────────────────────────────────────────────

function SectionRenderer({
  section,
  selectedTasks,
  onToggleTask,
}: {
  section: PlanSection;
  selectedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
}) {
  switch (section.kind) {
    case 'overview':
      return <OverviewSection section={section} />;
    case 'fileMap':
      return <FileMapSection section={section} />;
    case 'diagram':
      return <DiagramSection section={section} />;
    case 'wireframe':
      return <WireframeSection section={section} />;
    case 'apiSpec':
      return <ApiSpecSection section={section} />;
    case 'schemaMap':
      return <SchemaMapSection section={section} />;
    case 'annotatedCode':
      return <AnnotatedCodeSection section={section} />;
    case 'openQuestions':
      return <OpenQuestionsSection section={section} />;
    case 'tasks':
      return <TasksSection section={section} selectedTasks={selectedTasks} onToggleTask={onToggleTask} />;
    default:
      return null;
  }
}
