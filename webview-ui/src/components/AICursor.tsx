import type { AICursorState } from '../types';

interface AICursorProps {
  cursor: AICursorState;
}

const ACTION_COLORS: Record<AICursorState['action'], string> = {
  'editing': 'var(--vscode-charts-green)',
  'reviewing': 'var(--vscode-charts-blue)',
  'suggesting': 'var(--vscode-charts-yellow)',
  'idle': 'var(--vscode-charts-gray)',
};

const ACTION_LABELS: Record<AICursorState['action'], string> = {
  'editing': 'AI is editing...',
  'reviewing': 'AI is reviewing...',
  'suggesting': 'AI is suggesting...',
  'idle': 'AI cursor',
};

export function AICursor({ cursor }: AICursorProps) {
  const color = ACTION_COLORS[cursor.action];
  const label = cursor.label || ACTION_LABELS[cursor.action];

  return (
    <div
      className="ai-cursor"
      style={{
        left: cursor.x,
        top: cursor.y,
        '--cursor-color': color,
      } as React.CSSProperties}
    >
      {/* Cursor pointer */}
      <svg width="24" height="24" viewBox="0 0 24 24" className="ai-cursor-icon">
        <path
          d="M5.5 3.21V20.8L11.5 14.8H19.5L5.5 3.21Z"
          fill={color}
          stroke="var(--vscode-editor-background)"
          strokeWidth="1.5"
        />
      </svg>
      
      {/* Label tooltip */}
      <div className="ai-cursor-label" style={{ backgroundColor: color }}>
        <span className="ai-cursor-text">{label}</span>
        {cursor.action !== 'idle' && (
          <span className="ai-cursor-pulse"></span>
        )}
      </div>
    </div>
  );
}
