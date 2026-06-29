// ─── Visual Plan Sections ────────────────────────────────────────────────────
// The ONE shared renderer for VisualPlan display. Rendered by:
//   - The canvas DetailPanel (case 'visual-plan')
//   - The Agentic Kanban inline panel (like DiffPanel)
//   - The pop-out full-window app (AC_MODE='visual-plan')
//
// Mirrors the DiffPanel structured-panel pattern (DiffPanel.tsx:115-242).

import { useState, useCallback, useMemo } from 'react';
import type { VisualPlan, PlanSection, FileMapEntry } from './types';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
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
  /** Called when the user answers an open question. */
  onAnswerQuestion?: (questionId: string, answer: string) => void;
  /** If true, shows the approve bar footer. */
  showApproveBar?: boolean;
  /** If true, hides the close button. */
  hideClose?: boolean;
  /** Called when the user clicks close. */
  onClose?: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, IconName> = {
  overview: 'requirement',
  fileMap: 'folder',
  diagram: 'mindmap',
  wireframe: 'empty-canvas',
  apiSpec: 'docs',
  schemaMap: 'system-component',
  annotatedCode: 'code',
  openQuestions: 'help',
  tasks: 'task',
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

// ── Lightweight Markdown → JSX ──────────────────────────────────────────────

/**
 * Converts basic markdown to React nodes. Handles:
 *   ## / ### headings, **bold**, `code`, - lists, [links](url), blank-line breaks.
 * Designed for the LLM-generated overview section — covers ~90% of what the AI emits.
 */
function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let i = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(<ul key={`ul-${i}`} className="vp-md-list">{listItems}</ul>);
      listItems = [];
    }
  };

  const parseInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    // Match **bold**, `code`, [text](url) in order
    const re = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) {
        parts.push(text.slice(last, match.index));
      }
      if (match[1]) {
        parts.push(<strong key={`b-${idx++}`}>{match[2]}</strong>);
      } else if (match[3]) {
        parts.push(<code key={`c-${idx++}`} className="vp-md-code">{match[4]}</code>);
      } else if (match[5]) {
        parts.push(
          <a key={`a-${idx++}`} href={match[7]} target="_blank" rel="noopener noreferrer" className="vp-md-link">
            {match[6]}
          </a>
        );
      }
      last = match.index + match[0].length;
    }
    if (last < text.length) {
      parts.push(text.slice(last));
    }
    return parts.length > 0 ? parts : [text];
  };

  for (i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Empty line → flush list, paragraph break
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      flushList();
      nodes.push(<h4 key={`h-${i}`} className="vp-md-h4">{parseInline(line.slice(4))}</h4>);
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      nodes.push(<h3 key={`h-${i}`} className="vp-md-h3">{parseInline(line.slice(3))}</h3>);
      continue;
    }
    if (line.startsWith('# ')) {
      flushList();
      nodes.push(<h2 key={`h-${i}`} className="vp-md-h2">{parseInline(line.slice(2))}</h2>);
      continue;
    }

    // Unordered list items
    if (/^[-*]\s/.test(line)) {
      listItems.push(<li key={`li-${i}`} className="vp-md-li">{parseInline(line.replace(/^[-*]\s/, ''))}</li>);
      continue;
    }

    // Regular paragraph (flush any pending list first)
    flushList();
    nodes.push(<p key={`p-${i}`} className="vp-md-p">{parseInline(line)}</p>);
  }

  flushList();
  return nodes;
}

// ── Syntax highlighter (lightweight token-based) ─────────────────────────────

const TS_KEYWORDS = new Set([
  'import','export','default','from','const','let','var','function','async','await',
  'return','if','else','for','while','do','switch','case','break','continue',
  'throw','try','catch','finally','new','class','extends','implements','interface',
  'type','enum','namespace','typeof','instanceof','in','of','private','public',
  'protected','readonly','static','abstract','as','is','keyof','infer','never',
  'void','any','boolean','number','string','symbol','null','undefined','true','false',
]);

function highlightCode(code: string, language?: string): React.ReactNode[] {
  if (!language || !['typescript','javascript','ts','js','tsx','jsx'].includes(language.toLowerCase())) {
    return [<span key="raw">{code}</span>];
  }

  const tokens: React.ReactNode[] = [];
  // Tokenize: strings, comments, keywords, numbers
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|(\b[a-zA-Z_$][\w$]*\b)/gm;
  let last = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = re.exec(code)) !== null) {
    if (match.index > last) {
      tokens.push(<span key={`t-${idx++}`}>{code.slice(last, match.index)}</span>);
    }
    if (match[1]) {
      // line comment
      tokens.push(<span key={`t-${idx++}`} className="vp-hl-comment">{match[1]}</span>);
    } else if (match[2] || match[3] || match[4]) {
      tokens.push(<span key={`t-${idx++}`} className="vp-hl-string">{match[0]}</span>);
    } else if (match[5]) {
      tokens.push(<span key={`t-${idx++}`} className="vp-hl-number">{match[0]}</span>);
    } else if (match[6] && TS_KEYWORDS.has(match[6])) {
      tokens.push(<span key={`t-${idx++}`} className="vp-hl-keyword">{match[0]}</span>);
    } else {
      tokens.push(<span key={`t-${idx++}`}>{match[0]}</span>);
    }
    last = match.index + match[0].length;
  }
  if (last < code.length) {
    tokens.push(<span key={`t-${idx++}`}>{code.slice(last)}</span>);
  }

  return tokens;
}

// ── Approval workflow stages ─────────────────────────────────────────────────

const WORKFLOW_STAGES: { stage: string; label: string; past: boolean; current: boolean }[] = [
  { stage: 'generating', label: 'Generate', past: false, current: false },
  { stage: 'pending',    label: 'Review',  past: false, current: false },
  { stage: 'changes-requested', label: 'Revise', past: false, current: false },
  { stage: 'approved',   label: 'Approved', past: false, current: false },
  { stage: 'dispatched', label: 'Dispatched', past: false, current: false },
];

function getWorkflowStages(status: string) {
  const statusIndex = WORKFLOW_STAGES.findIndex(s => s.stage === status);
  return WORKFLOW_STAGES.map((s, i) => {
    if (s.stage === 'generating') return { ...s }; // never mark generating as past
    if (i < statusIndex) return { ...s, past: true };
    if (i === statusIndex) return { ...s, current: true };
    return { ...s };
  });
}

// ── Section renderers ───────────────────────────────────────────────────────

function OverviewSection({ section }: { section: PlanSection & { kind: 'overview' } }) {
  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        <div className="vp-overview-markdown">
          {section.markdown ? renderMarkdown(section.markdown) : (
            <p className="vp-md-p">No overview provided.</p>
          )}
        </div>
        {section.risk && (
          <span className={`vp-risk-badge vp-risk-badge--${section.risk}`}>
            Risk: {section.risk}
          </span>
        )}
        {section.groundedFiles && section.groundedFiles.length > 0 && (
          <div className="vp-grounded-files">
            <div className="vp-grounded-files-label">Grounded in workspace files:</div>
            <div className="vp-grounded-files-list">
              {section.groundedFiles.map((file, i) => (
                <span key={i} className="vp-grounded-file-chip" title={file}>
                  {file.split('/').slice(-2).join('/')}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FileMapSection({ section }: { section: PlanSection & { kind: 'fileMap' } }) {
  if (!section.entries.length) {
    return <div className="vp-section"><div className="vp-section-body">No files listed.</div></div>;
  }

  const addCount = section.entries.filter(e => e.change === 'add').length;
  const modCount = section.entries.filter(e => e.change === 'modify').length;
  const delCount = section.entries.filter(e => e.change === 'delete').length;
  const renCount = section.entries.filter(e => e.change === 'rename').length;

  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        <div className="vp-filemap-stats">
          {addCount > 0 && <span className="vp-filemap-stat vp-filemap-stat--add">{addCount} new</span>}
          {modCount > 0 && <span className="vp-filemap-stat vp-filemap-stat--modify">{modCount} modified</span>}
          {delCount > 0 && <span className="vp-filemap-stat vp-filemap-stat--delete">{delCount} deleted</span>}
          {renCount > 0 && <span className="vp-filemap-stat vp-filemap-stat--rename">{renCount} renamed</span>}
        </div>
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
  const [copied, setCopied] = useState(false);

  const handleCopyMermaid = useCallback(async () => {
    if (!diagram.mermaid) return;
    try {
      await navigator.clipboard.writeText(diagram.mermaid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may not be available */ }
  }, [diagram.mermaid]);

  const hasNodes = diagram.nodes && diagram.nodes.length > 0;
  const hasMermaid = !!diagram.mermaid;

  if (!hasNodes && !hasMermaid) return null;

  return (
    <div className="vp-section" id={`section-${section.id}`}>
      {diagram.title && <div className="vp-section-title">{diagram.title}</div>}
      <div className="vp-section-body">
        {/* Render mermaid source when available (primary format per the workflow prompt) */}
        {hasMermaid && (
          <div className="vp-mermaid-block">
            <div className="vp-mermaid-header">
              <span className="vp-mermaid-label">Mermaid Diagram</span>
              <button
                type="button"
                className="vp-copy-btn"
                onClick={handleCopyMermaid}
                title="Copy mermaid source"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <pre className="vp-mermaid-source">{diagram.mermaid}</pre>
            <div className="vp-mermaid-hint">
              Paste into{' '}
              <a href="https://mermaid.live" target="_blank" rel="noopener noreferrer">mermaid.live</a>
              {' '}to render.
            </div>
          </div>
        )}

        {/* Render nodes/edges as fallback SVG */}
        {hasNodes && (() => {
          const NODE_HEIGHT = 32;
          const MIN_WIDTH = 80;
          const MAX_WIDTH = 200;
          const Y_SPACING = 80;
          const X_SPACING = 28;

          // 1. Calculate node widths from label length
          const nodeWidths = new Map<string, number>();
          diagram.nodes!.forEach((n) => {
            const label = n.label || n.id;
            const computedWidth = label.length * 7 + 24;
            nodeWidths.set(n.id, Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, computedWidth)));
          });

          // 2. Topological layering (iterative relaxation, bounded by node count)
          const layerMap = new Map<string, number>();
          diagram.nodes!.forEach(n => layerMap.set(n.id, 0));

          let changed = true;
          let iterations = 0;
          while (changed && iterations < diagram.nodes!.length) {
            changed = false;
            diagram.edges?.forEach(e => {
              if (!layerMap.has(e.from) || !layerMap.has(e.to)) return;
              const fromL = layerMap.get(e.from)!;
              const toL = layerMap.get(e.to)!;
              if (fromL >= toL) {
                layerMap.set(e.to, fromL + 1);
                changed = true;
              }
            });
            iterations++;
          }

          // 3. Group nodes by layer
          const rawLayers: string[][] = [];
          diagram.nodes!.forEach(n => {
            const l = layerMap.get(n.id)!;
            while (rawLayers.length <= l) rawLayers.push([]);
            rawLayers[l].push(n.id);
          });
          const activeLayers = rawLayers.filter(l => l.length > 0);

          // 4. Position nodes layer-by-layer
          const nodePositions = new Map<string, { x: number; y: number; w: number }>();
          let maxRowWidth = 0;

          activeLayers.forEach((layerNodes, row) => {
            let currentX = 0;
            const centerRowY = 40 + row * Y_SPACING;
            layerNodes.forEach(id => {
              const w = nodeWidths.get(id)!;
              nodePositions.set(id, { x: currentX + w / 2, y: centerRowY, w });
              currentX += w + X_SPACING;
            });
            maxRowWidth = Math.max(maxRowWidth, currentX - X_SPACING);
          });

          // Center-align each row relative to the widest row
          activeLayers.forEach(layerNodes => {
            if (!layerNodes.length) return;
            const firstPos = nodePositions.get(layerNodes[0])!;
            const lastPos = nodePositions.get(layerNodes[layerNodes.length - 1])!;
            const rowWidth = (lastPos.x + lastPos.w / 2) - (firstPos.x - firstPos.w / 2);
            const offsetX = (maxRowWidth - rowWidth) / 2;
            layerNodes.forEach(id => {
              nodePositions.get(id)!.x += offsetX;
            });
          });

          const svgWidth = Math.max(300, maxRowWidth + 80);
          const svgHeight = activeLayers.length * Y_SPACING + 40;

          return (
            <svg className="vp-diagram-svg" viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height={svgHeight}>
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="var(--vscode-focusBorder, #007acc)" />
                </marker>
              </defs>

              {/* Curved edges */}
              {diagram.edges?.map((edge, i) => {
                const from = nodePositions.get(edge.from);
                const to = nodePositions.get(edge.to);
                if (!from || !to) return null;

                const x1 = from.x;
                const y1 = from.y + NODE_HEIGHT / 2;
                const x2 = to.x;
                const y2 = to.y - NODE_HEIGHT / 2;
                const midY = (y1 + y2) / 2;

                const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

                return (
                  <g key={`edge-${i}`}>
                    <path d={pathD} fill="none"
                      stroke="var(--vscode-focusBorder, #007acc)" strokeWidth="1.5"
                      markerEnd="url(#arrowhead)" />
                    {edge.label && (
                      <text x={(x1 + x2) / 2} y={midY - 4} textAnchor="middle"
                        fill="var(--vscode-descriptionForeground)" fontSize="10">
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Dynamic-width nodes */}
              {diagram.nodes!.map((node) => {
                const pos = nodePositions.get(node.id)!;
                const label = node.label || node.id;
                const displayLabel = label.length > 25 ? label.slice(0, 23) + '...' : label;

                return (
                  <g key={node.id}>
                    <title>{label}</title>
                    <rect x={pos.x - pos.w / 2} y={pos.y - NODE_HEIGHT / 2}
                      width={pos.w} height={NODE_HEIGHT} rx="4"
                      fill="var(--vscode-editor-background)"
                      stroke="var(--vscode-focusBorder, #007acc)" strokeWidth="1.5" />
                    <text x={pos.x} y={pos.y + 4} textAnchor="middle"
                      fill="var(--vscode-editor-foreground)" fontSize="11" fontFamily="monospace">
                      {displayLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          );
        })()}
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
          <div key={ws.id} className="vp-wireframe-region">
            <div className="vp-wireframe-region-label">{ws.label}</div>
            {ws.elements?.map((el, ei) => (
              <div key={ei} className="vp-wireframe-element">
                <span className="vp-wireframe-element-type">[{el.type}]</span> {el.label}
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
          <CodeBlock key={i} block={block} />
        ))}
      </div>
    </div>
  );
}

function CodeBlock({ block }: { block: { file: string; language?: string; code: string; annotations?: { line: number; comment: string }[] } }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(block.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may not be available */ }
  }, [block.code]);

  return (
    <div className="vp-code-block">
      <div className="vp-code-header">
        <span className="vp-code-file">{block.file}</span>
        {block.language && <span className="vp-code-lang">{block.language}</span>}
        <button
          type="button"
          className="vp-copy-btn"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="vp-code-body">
        <code>{highlightCode(block.code, block.language)}</code>
      </pre>
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
  );
}

function OpenQuestionsSection({
  section,
  onAnswer,
}: {
  section: PlanSection & { kind: 'openQuestions' };
  onAnswer?: (questionId: string, answer: string) => void;
}) {
  if (!section.questions.length) return null;

  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        {section.questions.map((q) => (
          <QuestionItem key={q.id} question={q} onAnswer={onAnswer} />
        ))}
      </div>
    </div>
  );
}

function QuestionItem({
  question,
  onAnswer,
}: {
  question: { id: string; question: string; status?: 'open' | 'answered' | 'blocked'; answer?: string };
  onAnswer?: (questionId: string, answer: string) => void;
}) {
  const [answerText, setAnswerText] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!answerText.trim()) return;
    onAnswer?.(question.id, answerText.trim());
    setAnswerText('');
    setShowInput(false);
  }, [answerText, question.id, onAnswer]);

  return (
    <div className="vp-question-item">
      <span className="vp-question-text">{question.question}</span>
      {question.status && (
        <span className={`vp-question-status vp-question-status--${question.status}`}>{question.status}</span>
      )}
      {question.answer && <div className="vp-question-answer">{question.answer}</div>}
      {question.status === 'open' && onAnswer && !showInput && (
        <button
          type="button"
          className="vp-question-answer-btn"
          onClick={() => setShowInput(true)}
        >
          Answer
        </button>
      )}
      {showInput && (
        <div className="vp-question-answer-input">
          <input
            type="text"
            placeholder="Type your answer..."
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <button onClick={handleSubmit}>Submit</button>
          <button className="vp-question-answer-cancel" onClick={() => { setShowInput(false); setAnswerText(''); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function TasksSection({
  section,
  selectedTasks,
  onToggleTask,
  onSelectAll,
  onDeselectAll,
  fileMapEntries,
  isReadOnly,
}: {
  section: PlanSection & { kind: 'tasks' };
  selectedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  fileMapEntries?: FileMapEntry[];
  isReadOnly?: boolean;
}) {
  if (!section.tasks.length) return null;

  // Group tasks by priority
  const priorityOrder = ['P0', 'P1', 'P2'];
  const grouped = useMemo(() => {
    const groups: Record<string, typeof section.tasks> = { P0: [], P1: [], P2: [], '': [] };
    for (const task of section.tasks) {
      const key = task.priority && priorityOrder.includes(task.priority) ? task.priority : '';
      groups[key].push(task);
    }
    return groups;
  }, [section.tasks]);

  const priorityLabels: Record<string, React.ReactNode> = {
    P0: <><span className="vp-priority-dot vp-priority-dot--P0" />Critical (P0) — Minimum viable implementation</>,
    P1: <><span className="vp-priority-dot vp-priority-dot--P1" />Important (P1) — Should complete</>,
    P2: <><span className="vp-priority-dot vp-priority-dot--P2" />Nice-to-have (P2) — If time permits</>,
    '': 'Uncategorized',
  };

  const fileMapLookup = useMemo(() => {
    if (!fileMapEntries) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const e of fileMapEntries) {
      map.set(e.path, e.change);
    }
    return map;
  }, [fileMapEntries]);

  const renderTask = (task: typeof section.tasks[0]) => (
    <li key={task.id} className="vp-task-item">
      {!isReadOnly && (
        <input
          type="checkbox"
          className="vp-task-checkbox"
          checked={selectedTasks.has(task.id)}
          onChange={() => onToggleTask(task.id)}
        />
      )}
      <div style={{ flex: 1 }}>
        <div className="vp-task-title">
          {task.priority && <span className={`vp-task-priority vp-task-priority--${task.priority}`}>[{task.priority}]</span>}
          {task.title}
        </div>
        {task.description && <div className="vp-task-desc">{task.description}</div>}
        {task.scope && task.scope.length > 0 && (
          <div className="vp-task-scope">
            {task.scope.map((file, fi) => {
              const changeType = fileMapLookup.get(file);
              return (
                <span key={fi} className="vp-task-file-tag" title={changeType ? `Change: ${changeType}` : undefined}>
                  {changeType && (
                    <span className={`vp-task-file-change vp-task-file-change--${changeType}`}>
                      {changeType === 'add' ? '+' : changeType === 'delete' ? '−' : changeType === 'rename' ? '↻' : '~'}
                    </span>
                  )}
                  {file}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );

  const allIds = section.tasks.map(t => t.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selectedTasks.has(id));
  const noneSelected = allIds.every(id => !selectedTasks.has(id));

  return (
    <div className="vp-section" id={`section-${section.id}`}>
      <div className="vp-section-body">
        {!isReadOnly && (
          <div className="vp-task-select-all">
            {allSelected ? (
              <button type="button" className="vp-task-select-all-btn" onClick={onDeselectAll}>
                Deselect All
              </button>
            ) : (
              <button type="button" className="vp-task-select-all-btn" onClick={onSelectAll}>
                Select All ({allIds.length})
              </button>
            )}
            {!allSelected && !noneSelected && (
              <span className="vp-task-select-count">
                {selectedTasks.size} of {allIds.length} selected
              </span>
            )}
          </div>
        )}
        {priorityOrder.map((priority) => {
          const tasks = grouped[priority];
          if (!tasks.length) return null;
          return (
            <div key={priority} className="vp-task-group">
              <div className="vp-task-group-header">
                {priorityLabels[priority] || priorityLabels['']}
              </div>
              <ul className="vp-task-list">
                {tasks.map(renderTask)}
              </ul>
            </div>
          );
        })}
        {grouped[''].length > 0 && (
          <div className="vp-task-group">
            <div className="vp-task-group-header">{priorityLabels['']}</div>
            <ul className="vp-task-list">
              {grouped[''].map(renderTask)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Comment thread ──────────────────────────────────────────────────────────

function CommentThread({
  comments,
  activeSectionId,
  activeSectionLabel,
  onComment,
}: {
  comments: VisualPlan['comments'];
  activeSectionId: string;
  activeSectionLabel?: string;
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
      {activeSectionLabel && sectionComments.length > 0 && (
        <div className="vp-comments-section-badge">
          Comments on: <strong>{activeSectionLabel}</strong>
        </div>
      )}
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
          placeholder={activeSectionLabel
            ? `Add a comment to ${activeSectionLabel}...`
            : 'Select a section to comment...'}
          value={body}
          disabled={!activeSectionId}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend} disabled={!activeSectionId}>Send</button>
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

// ── Workflow progress bar ───────────────────────────────────────────────────

function WorkflowProgress({ status }: { status: string }) {
  const stages = getWorkflowStages(status);
  if (status === 'generating') return null;

  return (
    <div className="vp-workflow-progress" aria-label="Plan workflow stage">
      {stages.filter(s => s.stage !== 'generating').map((s) => (
        <div
          key={s.stage}
          className={`vp-workflow-stage ${s.past ? 'vp-workflow-stage--past' : ''} ${s.current ? 'vp-workflow-stage--current' : ''}`}
        >
          <div className="vp-workflow-stage-dot" />
          <span className="vp-workflow-stage-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Dispatched success banner ────────────────────────────────────────────────

function DispatchedBanner(_props: { plan: VisualPlan }) {
  return (
    <div className="vp-dispatched-banner">
      <span className="vp-dispatched-icon">✓</span>
      <div>
        <div className="vp-dispatched-title">Plan Dispatched</div>
        <div className="vp-dispatched-subtitle">
          Tasks have been sent to the board. This plan is now read-only.
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function VisualPlanSections({
  plan,
  onApprove,
  onRequestChanges,
  onComment,
  onAnswerQuestion,
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
        <div className="vp-empty-icon"><Icon name="empty-canvas" size={40} /></div>
        <div className="vp-empty-title">No Visual Plan Yet</div>
        <div className="vp-empty-desc">
          A Visual Plan is an AI-generated, structured plan document that you review
          BEFORE any code is written. It maps out affected files, API specs, data models,
          diagrams, and dispatchable tasks — all in one reviewable surface.
        </div>
        <div className="vp-empty-desc">
          Generate one from the canvas card, kanban board, or chat command{' '}
          <code>/visual-plan</code>.
        </div>
      </div>
    );
  }

  // Generating state
  if (plan.status === 'generating') {
    return (
      <div className="vp-panel">
        <div className="vp-generating">
          <div className="vp-spinner" />
          <div className="vp-generating-title">Generating Visual Plan…</div>
          <div className="vp-generating-goal">"{plan.goal}"</div>
          <div className="vp-generating-hint">
            The AI is analyzing your codebase and building a structured plan with
            file maps, diagrams, API specs, and task breakdowns.
          </div>
        </div>
      </div>
    );
  }

  const isReadOnly = plan.status === 'dispatched';

  const handleToggleTask = useCallback((taskId: string) => {
    if (isReadOnly) return;
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, [isReadOnly]);

  const handleSelectAll = useCallback(() => {
    const tasksSection = plan.sections.find(
      (s): s is PlanSection & { kind: 'tasks' } => s.kind === 'tasks'
    );
    if (tasksSection && tasksSection.kind === 'tasks') {
      setSelectedTasks(new Set(tasksSection.tasks.map(t => t.id)));
    }
  }, [plan.sections]);

  const handleDeselectAll = useCallback(() => {
    setSelectedTasks(new Set());
  }, []);

  const handleApprove = useCallback(() => {
    onApprove?.(Array.from(selectedTasks));
  }, [selectedTasks, onApprove]);

  const handleRequestChanges = useCallback(() => {
    if (!plan) return;
    const comments = plan.comments.map(c => ({ sectionId: c.sectionId, body: c.body }));
    onRequestChanges?.(comments);
  }, [plan?.comments, onRequestChanges]);

  const tasksSection = plan.sections.find(
    (s): s is PlanSection & { kind: 'tasks' } => s.kind === 'tasks'
  );
  const totalTaskCount = tasksSection?.tasks.length ?? 0;

  const fileMapSection = plan.sections.find(
    (s): s is PlanSection & { kind: 'fileMap' } => s.kind === 'fileMap'
  );
  const fileMapEntries = fileMapSection?.kind === 'fileMap' ? fileMapSection.entries : undefined;

  const activeSection = activeSectionId
    ? plan.sections.find((s) => s.id === activeSectionId)
    : plan.sections[0];

  const activeSectionLabel = activeSection
    ? SECTION_LABELS[activeSection.kind] || activeSection.kind
    : undefined;

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

      {/* Workflow progress bar */}
      <WorkflowProgress status={plan.status} />

      {/* Dispatched banner (read-only mode) */}
      {isReadOnly && <DispatchedBanner plan={plan} />}

      {/* Body: outline rail + content */}
      <div className="vp-panel-body">
        <div className="vp-outline">
          {plan.sections.map((s) => (
            <div
              key={s.id}
              className={`vp-outline-item ${s.id === activeSectionId ? 'vp-outline-item--active' : ''}`}
              onClick={() => setActiveSectionId(s.id)}
            >
              <span className="vp-outline-icon"><Icon name={SECTION_ICONS[s.kind] || 'docs'} size={14} /></span>
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
              <SectionRenderer
                section={activeSection}
                selectedTasks={selectedTasks}
                onToggleTask={handleToggleTask}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onAnswer={onAnswerQuestion}
                fileMapEntries={fileMapEntries}
                isReadOnly={isReadOnly}
              />
            </>
          ) : (
            <div className="vp-content-empty">
              Select a section from the outline.
            </div>
          )}
        </div>
      </div>

      {/* Comment thread */}
      <CommentThread
        comments={plan.comments}
        activeSectionId={activeSectionId}
        activeSectionLabel={activeSectionLabel}
        onComment={isReadOnly ? undefined : onComment}
      />

      {/* Approve bar (hidden for dispatched plans) */}
      {showApproveBar && !isReadOnly && (
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
  onSelectAll,
  onDeselectAll,
  onAnswer,
  fileMapEntries,
  isReadOnly,
}: {
  section: PlanSection;
  selectedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAnswer?: (questionId: string, answer: string) => void;
  fileMapEntries?: FileMapEntry[];
  isReadOnly?: boolean;
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
      return <OpenQuestionsSection section={section} onAnswer={onAnswer} />;
    case 'tasks':
      return (
        <TasksSection
          section={section}
          selectedTasks={selectedTasks}
          onToggleTask={onToggleTask}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          fileMapEntries={fileMapEntries}
          isReadOnly={isReadOnly}
        />
      );
    default:
      return null;
  }
}
