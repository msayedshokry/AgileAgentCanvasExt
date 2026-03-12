import { useState, useRef, useEffect, useCallback } from 'react';
import type { Artifact } from '../types';
import { Icon, type IconName } from './Icon';

interface ToolbarProps {
  onAddArtifact: (type: Artifact['type']) => void;
  selectedArtifact?: Artifact | null;
  onBreakDown?: (artifact: Artifact) => void;
  onEnhance?: (artifact: Artifact) => void;
  onElicit?: (artifact: Artifact) => void;
  themeOverride?: 'light' | 'dark' | null;
  onToggleTheme?: () => void;
  detectedProjectCount?: number;
  onSwitchProject?: () => void;
  onExport?: () => void;
  onImport?: () => void;
  onHelp?: () => void;
  onAsk?: () => void;
  outputFormat?: 'json' | 'markdown' | 'dual';
  onOutputFormatChange?: (format: 'json' | 'markdown' | 'dual') => void;
  schemaIssueCount?: number;
  onFixSchemas?: () => void;
  onValidateSchemas?: () => void;
  schemaValidating?: boolean;
  schemaFixing?: boolean;
}

const ADD_ITEMS: { type: Artifact['type']; label: string; icon: IconName; needsEpic?: boolean; needsStoryOrEpic?: boolean }[] = [
  { type: 'product-brief', label: 'Brief',          icon: 'prd' },
  { type: 'vision',        label: 'Vision',          icon: 'vision' },
  { type: 'prd',           label: 'PRD',              icon: 'prd' },
  { type: 'requirement',   label: 'Requirement',      icon: 'requirement' },
  { type: 'architecture',  label: 'Architecture',     icon: 'architecture' },
  { type: 'epic',          label: 'Epic',             icon: 'epic' },
  { type: 'story',         label: 'Story',            icon: 'story', needsEpic: true },
  { type: 'use-case',      label: 'Use Case',         icon: 'use-case', needsEpic: true },
  { type: 'test-strategy', label: 'Test Strategy',    icon: 'test-strategy', needsEpic: true },
  { type: 'test-case',     label: 'Test Case',        icon: 'test-case', needsStoryOrEpic: true },
];

export function Toolbar({ onAddArtifact, selectedArtifact, onBreakDown, onEnhance, onElicit, themeOverride, onToggleTheme, detectedProjectCount, onSwitchProject, onExport, onImport, onHelp, onAsk, outputFormat, onOutputFormatChange, schemaIssueCount, onFixSchemas, onValidateSchemas, schemaValidating, schemaFixing }: ToolbarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const canBreakDown = selectedArtifact && (selectedArtifact.type === 'epic' || selectedArtifact.type === 'requirement');
  const canEnhance   = !!selectedArtifact;

  const handleAdd = useCallback((type: Artifact['type']) => {
    onAddArtifact(type);
    setOpen(false);
  }, [onAddArtifact]);

  // Close popover when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="toolbar-fab-container" ref={containerRef}>
      {/* Primary add button */}
      <button
        className={`toolbar-fab-btn${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Add artifact"
        aria-label="Add artifact"
        aria-expanded={open}
      >
        <span className="toolbar-fab-icon">{open ? <Icon name="close" size={16} /> : <Icon name="plus" size={16} />}</span>
        <span className="toolbar-fab-label">Add</span>
      </button>

      {/* Context AI actions — only when an artifact is selected */}
      {canEnhance && (
        <button
          className="toolbar-ai-btn"
          onClick={() => onEnhance?.(selectedArtifact!)}
          title="Ask AI to enhance selected item"
        >
          <Icon name="sparkle" size={16} />
        </button>
      )}
      {canBreakDown && (
        <button
          className="toolbar-ai-btn"
          onClick={() => onBreakDown?.(selectedArtifact!)}
          title={`Break down ${selectedArtifact!.type} into stories`}
        >
          <Icon name="split" size={16} />
        </button>
      )}
      {canEnhance && (
        <button
          className="toolbar-ai-btn"
          onClick={() => onElicit?.(selectedArtifact!)}
          title="Elicit with advanced method"
        >
          <Icon name="crystal-ball" size={16} />
        </button>
      )}

      {/* Switch project button — only shown when multiple BMAD projects exist */}
      {onSwitchProject && (detectedProjectCount ?? 0) >= 2 && (
        <button
          className="toolbar-switch-btn"
          onClick={onSwitchProject}
          title="Switch BMAD project"
        >
          <Icon name="folder" size={16} />
        </button>
      )}

      {/* Export button */}
      {onExport && (
        <button
          className="toolbar-export-btn"
          onClick={onExport}
          title="Export artifacts"
        >
          <Icon name="upload" size={16} />
        </button>
      )}

      {/* Import button */}
      {onImport && (
        <button
          className="toolbar-import-btn"
          onClick={onImport}
          title="Import artifacts"
        >
          <Icon name="download" size={16} />
        </button>
      )}

      {/* Schema button — validate (when no issues) or fix (when issues exist) */}
      {(onValidateSchemas || onFixSchemas) && (
        <button
          className={`toolbar-fix-btn${(schemaIssueCount ?? 0) > 0 ? ' has-issues' : ''}${schemaValidating || schemaFixing ? ' validating' : ''}`}
          onClick={(schemaIssueCount ?? 0) > 0 ? onFixSchemas : onValidateSchemas}
          title={
            schemaFixing
              ? 'Fixing schemas...'
              : schemaValidating
              ? 'Validating schemas...'
              : (schemaIssueCount ?? 0) > 0
              ? `Fix ${schemaIssueCount} schema issue(s)`
              : 'Validate artifacts against schemas'
          }
          disabled={schemaValidating || schemaFixing}
        >
          <Icon name="wrench" size={16} />
          {(schemaIssueCount ?? 0) > 0 && (
            <span className="toolbar-badge">{schemaIssueCount}</span>
          )}
        </button>
      )}

      {/* Ask / Chat button */}
      {onAsk && (
        <button
          className="toolbar-ask-btn"
          onClick={onAsk}
          title="Ask Agile Agent Canvas a question"
        >
          <Icon name="chat" size={16} />
        </button>
      )}

      {/* Help button */}
      {onHelp && (
        <button
          className="toolbar-help-btn"
          onClick={onHelp}
          title="Help &amp; instructions"
        >
          <Icon name="help" size={16} />
        </button>
      )}

      {/* Output format selector — cycle button */}
      {onOutputFormatChange && (
        <button
          className={`toolbar-format-btn ${outputFormat || 'dual'}`}
          title={`Output format: ${outputFormat === 'json' ? 'JSON only' : outputFormat === 'markdown' ? 'Markdown only' : 'Dual (JSON + Markdown)'}. Click to cycle.`}
          onClick={() => {
            const order: ('dual' | 'json' | 'markdown')[] = ['dual', 'json', 'markdown'];
            const idx = order.indexOf(outputFormat || 'dual');
            onOutputFormatChange(order[(idx + 1) % order.length]);
          }}
        >
          <Icon name="settings" size={13} />
          <span className="toolbar-format-label">
            {outputFormat === 'json' ? 'JSON' : outputFormat === 'markdown' ? 'MD' : 'Dual'}
          </span>
        </button>
      )}

      {/* Theme toggle */}
      {onToggleTheme && (
        <button
          className="toolbar-theme-btn"
          onClick={onToggleTheme}
          title={
            themeOverride === 'light' ? 'Switch to dark theme' :
            themeOverride === 'dark'  ? 'Reset to VS Code theme' :
            'Switch to light theme'
          }
        >
          {themeOverride === 'light' ? <Icon name="moon" size={16} /> : themeOverride === 'dark' ? <Icon name="settings" size={16} /> : <Icon name="sun" size={16} />}
        </button>
      )}

      {/* Add artifact popover */}
      {open && (
        <div className="toolbar-popover" role="menu">
          {ADD_ITEMS.map(item => {
            const disabled =
              (item.needsEpic && selectedArtifact?.type !== 'epic') ||
              (item.needsStoryOrEpic && selectedArtifact?.type !== 'story' && selectedArtifact?.type !== 'epic');
            const disabledReason = item.needsEpic
              ? 'Select an Epic first'
              : item.needsStoryOrEpic
              ? 'Select a Story or Epic first'
              : undefined;
            return (
              <button
                key={item.type}
                className={`toolbar-popover-item ${item.type}${disabled ? ' disabled' : ''}`}
                onClick={() => !disabled && handleAdd(item.type)}
                title={disabled ? disabledReason : `Add ${item.label}`}
                aria-disabled={disabled}
                role="menuitem"
              >
                <span className="toolbar-popover-icon"><Icon name={item.icon} size={16} /></span>
                <span className="toolbar-popover-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
