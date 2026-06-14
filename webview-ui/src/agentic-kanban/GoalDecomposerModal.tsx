import { useState } from 'react';
import { vscode } from '../vscodeApi';
import { useEvent } from './useEvent';

// Mirrored from src/workflow/goal-decomposer.ts
interface ProposedStory {
  id: string;
  title: string;
  description?: string;
  priority?: string;
}

interface ProposedGoal {
  id: string;
  goal: string;
  proposedStories: ProposedStory[];
  approvedStories: ProposedStory[];
}

interface GoalDecomposerModalProps {
  goal: ProposedGoal;
  onClose: () => void;
}

export function GoalDecomposerModal({ goal, onClose }: GoalDecomposerModalProps) {
  // Start with all proposed stories selected (user can deselect)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(goal.proposedStories.map(s => s.id)),
  );
  const [submitting, setSubmitting] = useState(false);

  const handleToggle = useEvent((storyId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  });

  const handleSelectAll = useEvent(() => {
    setSelected(new Set(goal.proposedStories.map(s => s.id)));
  });

  const handleClearAll = useEvent(() => {
    setSelected(new Set());
  });

  const handleApprove = useEvent(() => {
    if (selected.size === 0) return;
    setSubmitting(true);
    vscode.postMessage({
      type: 'approveGoalStories',
      goalId: goal.id,
      storyIds: Array.from(selected),
    });
    // Close after a brief delay to let the message round-trip
    setTimeout(() => {
      setSubmitting(false);
      onClose();
    }, 300);
  });

  return (
    <div className="goal-modal-overlay" onClick={onClose}>
      <div className="goal-modal" onClick={e => e.stopPropagation()}>
        <header className="goal-modal-header">
          <div className="goal-modal-title">
            <span className="goal-modal-icon">🎯</span>
            <div>
              <h3>Review Goal Decomposition</h3>
              <p className="goal-modal-subtitle">"{goal.goal}"</p>
            </div>
          </div>
          <button className="goal-modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>

        <div className="goal-modal-summary">
          <span>
            <strong>{goal.proposedStories.length}</strong> proposed ·{' '}
            <strong className="goal-modal-selected-count">{selected.size}</strong> selected
          </span>
          <div className="goal-modal-bulk-actions">
            <button className="goal-modal-btn-link" onClick={handleSelectAll}>
              Select all
            </button>
            <span className="goal-modal-divider">·</span>
            <button className="goal-modal-btn-link" onClick={handleClearAll}>
              Clear
            </button>
          </div>
        </div>

        <div className="goal-modal-stories">
          {goal.proposedStories.length === 0 ? (
            <p className="goal-modal-empty">No stories proposed for this goal.</p>
          ) : (
            goal.proposedStories.map(story => {
              const isSelected = selected.has(story.id);
              return (
                <label
                  key={story.id}
                  className={`goal-modal-story${isSelected ? ' goal-modal-story--selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(story.id)}
                    aria-label={`Include story "${story.title}"`}
                  />
                  <div className="goal-modal-story-content">
                    <div className="goal-modal-story-title">{story.title}</div>
                    {story.description && (
                      <div className="goal-modal-story-description">{story.description}</div>
                    )}
                    {story.priority && (
                      <span className={`goal-modal-priority goal-modal-priority--${story.priority}`}>
                        {story.priority}
                      </span>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <footer className="goal-modal-footer">
          <button className="goal-modal-btn goal-modal-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="goal-modal-btn goal-modal-btn--primary"
            onClick={handleApprove}
            disabled={selected.size === 0 || submitting}
            title={
              selected.size === 0
                ? 'Select at least one story to approve'
                : `Approve ${selected.size} story(ies) for the scheduler`
            }
          >
            {submitting
              ? '⟳ Approving…'
              : `Approve ${selected.size} & Dispatch`}
          </button>
        </footer>
      </div>
    </div>
  );
}
