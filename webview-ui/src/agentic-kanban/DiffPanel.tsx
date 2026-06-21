import { useState, useMemo } from 'react';
import './DiffPanel.css';

// ── Types (wire-format mirror of autonomous-git.ts CommitDiff + DiffFile) ────

export interface DiffFileInfo {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

export interface GitDiffMessage {
  type: 'gitDiff';
  storyId: string;
  sha: string;
  message: string;
  files: DiffFileInfo[];
  diff: string;        // raw unified diff text
  timestamp: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<DiffFileInfo['status'], string> = {
  added: 'var(--vscode-terminal-ansiGreen)',
  modified: 'var(--vscode-terminal-ansiYellow)',
  deleted: 'var(--vscode-terminal-ansiRed)',
  renamed: 'var(--vscode-terminal-ansiMagenta)',
};

const STATUS_LABEL: Record<DiffFileInfo['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
};

/** Parse a unified diff string into per-file hunks. */
interface DiffHunk {
  header: string;          // "diff --git a/… b/…" + index + ---/+++ lines
  path: string;            // extracted file path (from +++ b/…)
  lines: Array<{ type: 'context' | 'addition' | 'deletion' | 'hunk'; text: string }>;
}

function parseUnifiedDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;

  for (const rawLine of diffText.split('\n')) {
    const line = rawLine;

    // New file: "diff --git a/{old} b/{new}"
    if (line.startsWith('diff --git ')) {
      if (current) hunks.push(current);
      const pathMatch = line.match(/diff --git a\/(.*?) b\/(.*)/);
      current = {
        header: line,
        path: pathMatch ? pathMatch[2] : '',
        lines: [],
      };
      continue;
    }

    if (!current) continue;

    // Accumulate header lines until we see the first hunk or diff content
    if (
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('old mode ') ||
      line.startsWith('new mode ') ||
      line.startsWith('deleted file ') ||
      line.startsWith('new file ') ||
      line.startsWith('rename ') ||
      line.startsWith('similarity ')
    ) {
      current.header += '\n' + line;
      // Extract path from +++ b/…
      const pathMatch = line.match(/^\+\+\+ b\/(.*)/);
      if (pathMatch) current.path = pathMatch[1];
      continue;
    }

    // Hunk header
    if (line.startsWith('@@')) {
      current.lines.push({ type: 'hunk', text: line });
      continue;
    }

    // Diff content
    if (line.startsWith('+')) {
      current.lines.push({ type: 'addition', text: line });
    } else if (line.startsWith('-')) {
      current.lines.push({ type: 'deletion', text: line });
    } else {
      current.lines.push({ type: 'context', text: line });
    }
  }

  if (current) hunks.push(current);
  return hunks;
}

// ── Component ────────────────────────────────────────────────────────────────

interface DiffPanelProps {
  /** Latest commit diff pushed by the extension (null = no diff yet). */
  diff: GitDiffMessage | null;
  /** Dismiss the diff panel. */
  onClose: () => void;
}

export function DiffPanel({ diff, onClose }: DiffPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const hunksByPath = useMemo(() => {
    if (!diff?.diff) return new Map<string, DiffHunk>();
    const all = parseUnifiedDiff(diff.diff);
    const map = new Map<string, DiffHunk>();
    for (const h of all) {
      map.set(h.path || '(root)', h);
    }
    return map;
  }, [diff?.diff]);

  if (!diff) {
    return (
      <div className="diff-panel diff-panel--empty" aria-label="No commit diff available">
        <span className="diff-panel-meta">No diffs yet — an agent commit will appear here.</span>
      </div>
    );
  }

  const activeFile = selectedFile ?? diff.files[0]?.path ?? null;
  const activeHunk = activeFile ? hunksByPath.get(activeFile) : null;

  const totalAdditions = diff.files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = diff.files.reduce((s, f) => s + f.deletions, 0);

  return (
    <div className="diff-panel" aria-label="Commit diff review">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="diff-panel-header">
        <div className="diff-panel-header-info">
          <span className="diff-panel-sha" title={diff.sha}>
            {diff.sha.slice(0, 7)}
          </span>
          <span className="diff-panel-message" title={diff.message}>
            {diff.message}
          </span>
          {diff.storyId && (
            <span className="diff-panel-story" title={`Story: ${diff.storyId}`}>
              {diff.storyId}
            </span>
          )}
        </div>
        <div className="diff-panel-header-stats">
          <span className="diff-panel-stat diff-panel-stat--add" title={`${totalAdditions} additions`}>
            +{totalAdditions}
          </span>
          <span className="diff-panel-stat diff-panel-stat--del" title={`${totalDeletions} deletions`}>
            −{totalDeletions}
          </span>
          <span className="diff-panel-stat diff-panel-stat--files" title={`${diff.files.length} files changed`}>
            {diff.files.length} file{diff.files.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          className="diff-panel-close-btn"
          onClick={onClose}
          title="Close diff review"
          aria-label="Close diff review"
        >
          ✕
        </button>
      </div>

      {/* ── Body: file list + diff view ─────────────────────────────────── */}
      <div className="diff-panel-body">
        {/* File list */}
        <div className="diff-panel-file-list" role="listbox" aria-label="Changed files">
          {diff.files.map(f => (
            <button
              key={f.path}
              className={`diff-panel-file-item${f.path === activeFile ? ' diff-panel-file-item--active' : ''}`}
              onClick={() => setSelectedFile(f.path)}
              role="option"
              aria-selected={f.path === activeFile}
            >
              <span
                className="diff-panel-file-status"
                style={{ color: STATUS_COLOR[f.status] }}
                title={f.status}
              >
                {STATUS_LABEL[f.status]}
              </span>
              <span className="diff-panel-file-path">{f.path}</span>
              <span className="diff-panel-file-stats">
                {f.additions > 0 && (
                  <span className="diff-panel-file-adds">+{f.additions}</span>
                )}
                {f.deletions > 0 && (
                  <span className="diff-panel-file-dels">−{f.deletions}</span>
                )}
              </span>
            </button>
          ))}
        </div>

        {/* Diff view */}
        <div className="diff-panel-diff-view" aria-label={`Diff for ${activeFile ?? 'selected file'}`}>
          {activeHunk ? (
            <pre className="diff-panel-diff-content">
              <code>
                <span className="diff-panel-diff-header">{activeHunk.header}</span>
                {'\n'}
                {activeHunk.lines.map((l, i) => {
                  let cls = 'diff-panel-diff-context';
                  if (l.type === 'addition') cls = 'diff-panel-diff-add';
                  else if (l.type === 'deletion') cls = 'diff-panel-diff-del';
                  else if (l.type === 'hunk') cls = 'diff-panel-diff-hunk';
                  return (
                    <span key={i} className={cls}>
                      {l.text}{'\n'}
                    </span>
                  );
                })}
              </code>
            </pre>
          ) : (
            <div className="diff-panel-diff-empty" aria-label="No file selected">
              {diff.files.length > 0
                ? 'Select a file from the list to view its diff.'
                : 'No files changed in this commit.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
