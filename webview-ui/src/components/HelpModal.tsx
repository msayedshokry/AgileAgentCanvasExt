import { useEffect, useCallback } from 'react';
import { Icon } from './Icon';

interface HelpModalProps {
  onClose: () => void;
}

interface HelpSection {
  title: string;
  icon: React.ReactNode;
  items: string[];
}

const HELP_SECTIONS: HelpSection[] = [
  {
    title: 'Getting Started',
    icon: <Icon name="rocket" size={16} />,
    items: [
      'Use Agile Agent Canvas: New Project to start a fresh project',
      'Use Agile Agent Canvas: Load Existing Project to open a .agentcanvas-context folder',
      'Use Agile Agent Canvas: Load Demo Data to explore a sample project with all artifact types',
      'Click Add in the toolbar to create your first artifact',
      'Double-click any card on the canvas to open its detail panel',
      'Switch between multiple Agile Agent Canvas projects using the folder button in the toolbar',
    ],
  },
  {
    title: 'Canvas Navigation',
    icon: <Icon name="empty-canvas" size={16} />,
    items: [
      'Pan: Click and drag on empty canvas, or middle-click drag anywhere',
      'Scroll Pan: Mouse wheel scrolls the canvas (vertical and horizontal)',
      'Zoom: Ctrl+Scroll to zoom in/out centered on cursor (25%-200%)',
      'Select: Single-click a card to select it and highlight its connections',
      'Open Details: Double-click a card or click its info (i) button',
      'Expand/Collapse: Click the chevron on parent cards to show/hide children',
      'Inline Edit: Click a selected card\'s title to rename it directly',
    ],
  },
  {
    title: 'Canvas Features',
    icon: <Icon name="empty-canvas" size={16} />,
    items: [
      'Search (/): Fuzzy search artifacts by title, type, or label — navigate results with arrow keys and Enter',
      'Filter Bar (T): Filter cards by artifact type and status — grouped by phase and status bucket',
      'Focus Mode (F): Show only a selected card and its connected tree (ancestors, descendants, cross-refs)',
      'Minimap (M): Bird\'s-eye overview of all artifacts — click or drag to navigate',
      'Layout Toggle (L): Switch between swim lanes view and mind map tree view',
      'Dependency Arrows: Visual connections between related artifacts — highlighted on selection',
      'Lane Controls: Expand/collapse all cards in a lane, or hide/show entire lanes',
      'Zoom Controls: On-screen +/- buttons, percentage display, and reset button',
    ],
  },
  {
    title: 'Artifacts',
    icon: <Icon name="epic" size={16} />,
    items: [
      'Product Brief, Vision: Define your product direction and problem statement',
      'PRD, Requirements: Product requirements and functional specifications',
      'Architecture, Decisions, Components: System design and technical decisions',
      'Epics & Stories: Break work into deliverable units with agile metadata',
      'Use Cases: Actor-driven interaction scenarios linked to epics',
      'Test Strategy, Test Cases, Test Coverage: Quality assurance planning',
      'Tasks, Risks, NFRs: Supporting artifacts for project management',
    ],
  },
  {
    title: 'Card Actions',
    icon: <Icon name="sparkle" size={16} />,
    items: [
      'Info (i): Open the detail panel for the artifact',
      'Docs: Write documentation for the artifact using AI (/write-doc workflow)',
      'Refine (sparkle): Send the artifact to AI for enhancement',
      'Elicit (crystal ball): Apply an advanced elicitation method to the artifact',
      'Start Dev (rocket): Begin development workflow — available on epics, stories, and test cases',
      'Expand/Collapse (chevron): Show or hide child artifacts with child count badge',
    ],
  },
  {
    title: 'Detail Panel',
    icon: <Icon name="epic" size={16} />,
    items: [
      'Edit Mode: Click Edit or press Ctrl/Cmd+E to edit all fields inline',
      'Save: Click Save or press Ctrl/Cmd+S to save changes',
      'Cancel: Press Escape to discard changes (with confirmation if unsaved)',
      'Refine, Elicit, Start Dev: AI actions available in the panel header',
      'Delete: Remove the artifact (with confirmation dialog)',
      'Pop Out: Open the artifact in a separate VS Code editor tab',
      'Resize: Drag the left edge to adjust panel width (320px-600px)',
      'Shortcut Legend: Collapsible keyboard hints at the bottom of the panel',
    ],
  },
  {
    title: 'AI Features',
    icon: <Icon name="sparkle" size={16} />,
    items: [
      'Enhance (sparkle): AI-powered improvement of selected artifact',
      'Break Down (split): Generate child stories from an epic or requirement',
      'Elicit (crystal ball): Apply 50+ advanced elicitation methods from categorized picker',
      'Refine: AI suggestions to improve artifact content',
      'Start Dev (rocket): Launch development workflow for epics, stories, or test cases',
      'Write Docs: Generate documentation using the Tech Writer agent',
      'Ask Agent (Ctrl/Cmd+Shift+A): Get instant help with BMAD workflows, next steps, or methodology questions',
      'Use @agentcanvas in chat with 30+ slash commands for AI-assisted workflows',
    ],
  },
  {
    title: 'Workflows',
    icon: <Icon name="workflow" size={16} />,
    items: [
      'Click the Workflows button (bottom-right) to browse all workflows',
      'Phases: Analysis, Planning, Solutioning, Implementation, Quick Flow, Documentation, Project Setup, Supporting',
      'Search workflows by name, description, or trigger phrase',
      'Workflows open in the IDE chat panel with pre-filled commands',
      'Use @agentcanvas in chat for direct interaction with the Agile Agent Canvas assistant',
      'Track workflow progress in the Workflow Progress sidebar view',
    ],
  },
  {
    title: 'Export & Import',
    icon: <Icon name="download" size={16} />,
    items: [
      'Export: Save your project as JSON, Markdown, PDF, or JIRA CSV',
      'Canvas Screenshot: Export the visual canvas as PNG or PDF image',
      'Import: Load a previously exported JSON snapshot (replace or merge)',
      'Sync to Files: Write current state to .agentcanvas-context folder',
      'Output Format: Cycle between JSON-only, Markdown-only, or Dual output via toolbar',
      'All exports are saved in an exports/ subfolder of your project',
    ],
  },
  {
    title: 'Schema Validation',
    icon: <Icon name="wrench" size={16} />,
    items: [
      'Validate: Click the wrench button to check all artifacts against their schemas',
      'Fix: When issues are detected, click the wrench button (with badge count) to auto-fix',
      'Toast notifications alert you to schema issues when loading or saving artifacts',
    ],
  },
  {
    title: 'Keyboard Shortcuts',
    icon: <Icon name="keyboard" size={16} />,
    items: [
      'Escape: Close modals/panels, cancel edit, exit focus mode, close filters, deselect',
      'Ctrl/Cmd+E: Toggle edit mode in detail panel',
      'Ctrl/Cmd+S: Save changes in detail panel (edit mode)',
      'Arrow keys: Pan canvas up/down/left/right',
      '+ / -: Zoom in / zoom out',
      '0: Reset zoom and pan to default',
      'F: Toggle focus mode (with card selected)',
      'M: Toggle minimap visibility',
      'T: Toggle type/status filter bar',
      'L: Toggle layout between lanes and mind map',
      '/: Open canvas search (arrow keys to navigate, Enter to select)',
      'Double-click card: Open detail panel',
      'Double-click empty space: Deselect current card',
      'Ctrl/Cmd+Shift+A: Open Ask Agent — get help with BMAD workflows and methodology',
      'Ctrl+Shift+P: Open VS Code command palette for all Agile Agent Canvas commands',
    ],
  },
];

export function HelpModal({ onClose }: HelpModalProps) {
  // Close on Escape (capture phase to intercept before DetailPanel)
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

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="help-header">
          <div className="help-header-left">
            <Icon name="help" size={20} />
            <h2 className="help-title">Agile Agent Canvas Help</h2>
          </div>
          <button className="help-close-btn" onClick={onClose} title="Close" aria-label="Close help">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="help-content">
          {HELP_SECTIONS.map((section) => (
            <div key={section.title} className="help-section">
              <div className="help-section-header">
                <span className="help-section-icon">{section.icon}</span>
                <h3 className="help-section-title">{section.title}</h3>
              </div>
              <ul className="help-section-list">
                {section.items.map((item, i) => (
                  <li key={i} className="help-section-item">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="help-footer">
          <span className="help-footer-hint">
            Tip: Use Ctrl+Shift+P and type "Agile Agent Canvas" to see all available commands
          </span>
          <button className="help-footer-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
