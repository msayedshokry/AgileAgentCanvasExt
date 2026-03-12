import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './Icon';

interface AskModalProps {
  onSubmit: (text: string) => void;
  onClose: () => void;
}

export function AskModal({ onSubmit, onClose }: AskModalProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close on Escape (capture phase to intercept before other handlers)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }, [text, onSubmit]);

  // Submit on Ctrl/Cmd+Enter
  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="ask-overlay" onClick={onClose}>
      <div className="ask-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ask-modal-header">
          <div className="ask-modal-title">
            <span className="ask-modal-icon">
              <Icon name="chat" size={18} />
            </span>
            <div>
              <h2>Ask Agile Agent Canvas</h2>
              <p className="ask-subtitle">Send a thought, idea, or question to the AI assistant</p>
            </div>
          </div>
          <button className="ask-close-btn" onClick={onClose} title="Close" aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="ask-modal-body">
          <textarea
            ref={textareaRef}
            className="ask-textarea"
            placeholder="e.g. How should we handle authentication for the mobile app?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            rows={5}
          />
        </div>

        {/* Footer */}
        <div className="ask-modal-footer">
          <span className="ask-footer-hint">Ctrl+Enter to send</span>
          <div className="ask-footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary ask-submit-btn"
              onClick={handleSubmit}
              disabled={!text.trim()}
            >
              <Icon name="chat" size={14} />
              Send to Chat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
