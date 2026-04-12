import { useState, useCallback } from 'react';
import { vscode } from '../vscodeApi';

// ─── Types (mirror of jira-importer.ts — kept in sync manually) ──────────────

type ConflictField = 'title' | 'description';
type FieldChoice = 'jira' | 'canvas';

interface FieldConflict {
  field: ConflictField;
  jiraValue: string;
  canvasValue: string;
}

interface StoryConflict {
  key: string;
  canvasId: string;
  isNew: boolean;
  conflicts: FieldConflict[];
  jiraStory: { key: string; summary: string };
}

export interface EpicConflict {
  key: string;
  canvasId: string;
  isNew: boolean;
  conflicts: FieldConflict[];
  storyConflicts: StoryConflict[];
  jiraEpic: { key: string; summary: string; stories: any[] };
}

interface ConflictResolution {
  choices: Record<string, Record<ConflictField, FieldChoice>>;
}

interface JiraConflictPickerProps {
  epicConflicts: EpicConflict[];
  onApplied: () => void;
  onCancel: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fieldLabel(field: ConflictField): string {
  return field === 'title' ? 'Title / Summary' : 'Description / Goal';
}

function truncate(s: string, max = 120): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function JiraConflictPicker({ epicConflicts, onApplied, onCancel }: JiraConflictPickerProps) {
  // Build initial choices: everything defaults to 'jira'
  const buildInitial = (): Record<string, Record<ConflictField, FieldChoice>> => {
    const init: Record<string, Record<ConflictField, FieldChoice>> = {};
    for (const ec of epicConflicts) {
      if (!ec.isNew && ec.conflicts.length > 0) {
        init[ec.canvasId] = {} as Record<ConflictField, FieldChoice>;
        for (const fc of ec.conflicts) {
          init[ec.canvasId][fc.field] = 'jira';
        }
      }
      for (const sc of ec.storyConflicts) {
        if (!sc.isNew && sc.conflicts.length > 0) {
          init[sc.canvasId] = {} as Record<ConflictField, FieldChoice>;
          for (const fc of sc.conflicts) {
            init[sc.canvasId][fc.field] = 'jira';
          }
        }
      }
    }
    return init;
  };

  const [choices, setChoices] = useState<Record<string, Record<ConflictField, FieldChoice>>>(buildInitial);
  const [applying, setApplying] = useState(false);

  const setChoice = useCallback((artifactId: string, field: ConflictField, value: FieldChoice) => {
    setChoices(prev => ({
      ...prev,
      [artifactId]: { ...(prev[artifactId] ?? {}), [field]: value }
    }));
  }, []);

  const handleApply = useCallback(() => {
    setApplying(true);
    const resolution: ConflictResolution = { choices };
    vscode.postMessage({
      type: 'jiraAction',
      action: 'applySync',
      epicConflicts,
      resolution,
    });
    onApplied();
  }, [choices, epicConflicts, onApplied]);

  // Count things for the summary header
  const conflictingEpics   = epicConflicts.filter(ec => !ec.isNew && ec.conflicts.length > 0).length;
  const newEpics           = epicConflicts.filter(ec => ec.isNew).length;
  const conflictingStories = epicConflicts.reduce(
    (n, ec) => n + ec.storyConflicts.filter(sc => !sc.isNew && sc.conflicts.length > 0).length, 0
  );
  const newStories = epicConflicts.reduce(
    (n, ec) => n + ec.storyConflicts.filter(sc => sc.isNew).length, 0
  );

  return (
    <div className="jira-cp">
      {/* Summary bar */}
      <div className="jira-cp-summary">
        <span className="jira-cp-summary-title">Resolve conflicts before syncing</span>
        <div className="jira-cp-summary-chips">
          {conflictingEpics > 0  && <span className="jira-cp-chip conflict">{conflictingEpics} epic{conflictingEpics > 1 ? 's' : ''} conflict</span>}
          {conflictingStories > 0 && <span className="jira-cp-chip conflict">{conflictingStories} stor{conflictingStories > 1 ? 'ies' : 'y'} conflict</span>}
          {newEpics > 0           && <span className="jira-cp-chip new">{newEpics} new epic{newEpics > 1 ? 's' : ''}</span>}
          {newStories > 0         && <span className="jira-cp-chip new">{newStories} new stor{newStories > 1 ? 'ies' : 'y'}</span>}
        </div>
        <p className="jira-cp-summary-hint">
          Status, story points, and assignee always take the Jira value.
          New artifacts are added automatically — only conflicts need your choice.
        </p>
      </div>

      {/* Conflict list */}
      <div className="jira-cp-list">
        {epicConflicts.map(ec => {
          const hasEpicConflicts  = !ec.isNew && ec.conflicts.length > 0;
          const hasStoryConflicts = ec.storyConflicts.some(sc => !sc.isNew && sc.conflicts.length > 0);
          if (!hasEpicConflicts && !hasStoryConflicts) return null;

          return (
            <div key={ec.key} className="jira-cp-epic-block">
              <div className="jira-cp-epic-header">
                <span className="jira-cp-key">{ec.key}</span>
                <span className="jira-cp-epic-title">{ec.jiraEpic.summary}</span>
              </div>

              {/* Epic-level conflicts */}
              {hasEpicConflicts && ec.conflicts.map(fc => (
                <ConflictRow
                  key={fc.field}
                  artifactId={ec.canvasId}
                  conflict={fc}
                  choice={choices[ec.canvasId]?.[fc.field] ?? 'jira'}
                  onChange={setChoice}
                />
              ))}

              {/* Story-level conflicts */}
              {ec.storyConflicts.filter(sc => !sc.isNew && sc.conflicts.length > 0).map(sc => (
                <div key={sc.key} className="jira-cp-story-block">
                  <div className="jira-cp-story-header">
                    <span className="jira-cp-key jira-cp-key--story">{sc.key}</span>
                    <span className="jira-cp-story-title">{sc.jiraStory.summary}</span>
                  </div>
                  {sc.conflicts.map(fc => (
                    <ConflictRow
                      key={fc.field}
                      artifactId={sc.canvasId}
                      conflict={fc}
                      choice={choices[sc.canvasId]?.[fc.field] ?? 'jira'}
                      onChange={setChoice}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="jira-cp-footer">
        <span className="jira-cp-footer-hint">Jira is applied for uncontested fields.</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={applying}>Cancel</button>
          <button className="btn btn-primary" onClick={handleApply} disabled={applying}>
            {applying ? 'Applying…' : 'Apply & Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single field conflict row ────────────────────────────────────────────────

interface ConflictRowProps {
  artifactId: string;
  conflict: FieldConflict;
  choice: FieldChoice;
  onChange: (artifactId: string, field: ConflictField, value: FieldChoice) => void;
}

function ConflictRow({ artifactId, conflict, choice, onChange }: ConflictRowProps) {
  const id = `${artifactId}__${conflict.field}`;
  return (
    <div className="jira-cp-row">
      <div className="jira-cp-row-label">{fieldLabel(conflict.field)}</div>
      <div className="jira-cp-row-options">
        <label className={`jira-cp-option ${choice === 'jira' ? 'selected' : ''}`}>
          <input
            type="radio"
            name={id}
            value="jira"
            checked={choice === 'jira'}
            onChange={() => onChange(artifactId, conflict.field, 'jira')}
          />
          <span className="jira-cp-option-tag jira-cp-option-tag--jira">Jira</span>
          <span className="jira-cp-option-value">{truncate(conflict.jiraValue)}</span>
        </label>
        <label className={`jira-cp-option ${choice === 'canvas' ? 'selected' : ''}`}>
          <input
            type="radio"
            name={id}
            value="canvas"
            checked={choice === 'canvas'}
            onChange={() => onChange(artifactId, conflict.field, 'canvas')}
          />
          <span className="jira-cp-option-tag jira-cp-option-tag--canvas">Canvas</span>
          <span className="jira-cp-option-value">{truncate(conflict.canvasValue)}</span>
        </label>
      </div>
    </div>
  );
}
