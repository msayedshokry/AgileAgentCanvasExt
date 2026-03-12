/**
 * Smoke tests for bmm-renderers.tsx
 *
 * Each exported renderer is tested with minimal props to verify it renders
 * without crashing, plus a second test with representative data.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { Artifact } from '../../types';
import type { RendererProps } from './shared';
import {
  renderDefinitionOfDoneDetails,
  renderFitCriteriaDetails,
  renderSuccessMetricsDetails,
  renderRetrospectiveDetails,
  renderSprintStatusDetails,
  renderCodeReviewDetails,
  renderChangeProposalDetails,
  renderRisksDetails,
  renderReadinessReportDetails,
  renderResearchDetails,
  renderUxDesignDetails,
  renderTechSpecDetails,
  renderProjectOverviewDetails,
  renderProjectContextDetails,
  renderSourceTreeDetails,
} from './bmm-renderers';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeArtifact(type: Artifact['type'], metadata: Record<string, any> = {}): Artifact {
  return {
    id: `${type}-1`,
    type,
    title: `Test ${type}`,
    description: 'Test description',
    status: 'draft',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 120 },
    dependencies: [],
    metadata,
  };
}

function makeProps(type: Artifact['type'], metadata: Record<string, any> = {}): RendererProps {
  return {
    editedData: { ...metadata },
    editMode: false,
    handleFieldChange: vi.fn(),
    updateArrayItem: vi.fn(),
    removeFromArray: vi.fn(),
    addToArray: vi.fn(),
    artifact: makeArtifact(type, metadata),
    allArtifacts: [],
  };
}

function makeEditProps(type: Artifact['type'], metadata: Record<string, any> = {}): RendererProps {
  return { ...makeProps(type, metadata), editMode: true };
}

// ── Smoke tests ─────────────────────────────────────────────────────────────

describe('bmm-renderers smoke tests', () => {
  // Definition of Done
  it('renderDefinitionOfDoneDetails — empty', () => {
    const { container } = render(<>{renderDefinitionOfDoneDetails(makeProps('definition-of-done'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderDefinitionOfDoneDetails — with data', () => {
    const { container } = render(
      <>{renderDefinitionOfDoneDetails(makeProps('definition-of-done', {
        items: [{ id: '1', item: 'Code reviewed', completed: true }],
        qualityGates: [{ id: 'QG1', gate: 'Tests pass', passed: true }],
        summary: { totalItems: 1, completedItems: 1, completionPercentage: '100%' },
      }))}</>
    );
    expect(container.textContent).toContain('Code reviewed');
  });

  // Fit Criteria
  it('renderFitCriteriaDetails — empty', () => {
    const { container } = render(<>{renderFitCriteriaDetails(makeProps('fit-criteria'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderFitCriteriaDetails — with data', () => {
    const { container } = render(
      <>{renderFitCriteriaDetails(makeProps('fit-criteria', {
        functional: [{ criterion: 'System shall respond in 1s', verified: true }],
        nonFunctional: [{ criterion: 'Uptime 99.9%', verified: false }],
        security: [{ criterion: 'Encrypt PII', verified: false }],
        summary: { totalCriteria: 3 },
      }))}</>
    );
    expect(container.textContent).toContain('System shall respond');
  });

  // Success Metrics
  it('renderSuccessMetricsDetails — empty', () => {
    const { container } = render(<>{renderSuccessMetricsDetails(makeProps('success-metrics'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderSuccessMetricsDetails — with data', () => {
    const { container } = render(
      <>{renderSuccessMetricsDetails(makeProps('success-metrics', {
        codeQuality: [{ metric: 'Coverage', target: '80%' }],
        operational: [{ metric: 'Uptime', target: '99.9%' }],
        customerImpact: [{ metric: 'NPS', target: '60' }],
        deployment: [{ metric: 'Deploy freq', target: 'Daily' }],
      }))}</>
    );
    expect(container.textContent).toContain('Coverage');
  });

  // Retrospective
  it('renderRetrospectiveDetails — empty', () => {
    const { container } = render(<>{renderRetrospectiveDetails(makeProps('retrospective'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderRetrospectiveDetails — with data', () => {
    const { container } = render(
      <>{renderRetrospectiveDetails(makeProps('retrospective', {
        epicReference: { epicId: 'E1', title: 'Epic 1' },
        summary: { overallSuccess: 'Good', keyAchievements: ['Shipped on time'] },
        whatWentWell: [{ item: 'Good collaboration' }],
        whatDidNotGoWell: [{ item: 'Scope creep' }],
        lessonsLearned: [{ lesson: 'Plan better' }],
        actionItems: [{ action: 'Improve estimates', priority: 'high' }],
      }))}</>
    );
    expect(container.textContent).toContain('Good collaboration');
  });

  // Sprint Status
  it('renderSprintStatusDetails — empty', () => {
    const { container } = render(<>{renderSprintStatusDetails(makeProps('sprint-status'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderSprintStatusDetails — with data', () => {
    const { container } = render(
      <>{renderSprintStatusDetails(makeProps('sprint-status', {
        project: 'BMAD',
        summary: { totalStories: 10, completedStories: 7 },
        epics: [{ epicId: 'E1', title: 'Epic 1', status: 'in-progress', stories: [] }],
      }))}</>
    );
    expect(container.textContent).toContain('BMAD');
  });

  // Code Review
  it('renderCodeReviewDetails — empty', () => {
    const { container } = render(<>{renderCodeReviewDetails(makeProps('code-review'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderCodeReviewDetails — with data', () => {
    const { container } = render(
      <>{renderCodeReviewDetails(makeProps('code-review', {
        storyReference: { storyId: 'S1', storyTitle: 'Story 1' },
        reviewSummary: { overallVerdict: 'Approved', totalFindings: 3 },
        findings: [{ id: 'F1', severity: 'minor', description: 'Naming inconsistency' }],
      }))}</>
    );
    expect(container.textContent).toContain('Approved');
  });

  // Change Proposal
  it('renderChangeProposalDetails — empty', () => {
    const { container } = render(<>{renderChangeProposalDetails(makeProps('change-proposal'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderChangeProposalDetails — with data', () => {
    const { container } = render(
      <>{renderChangeProposalDetails(makeProps('change-proposal', {
        changeRequest: { title: 'Add dark mode', changeType: 'feature', urgency: 'medium' },
        impactAnalysis: { overallImpact: 'Low' },
        proposal: { recommendation: 'Proceed', rationale: 'User demand' },
      }))}</>
    );
    expect(container.textContent).toContain('Add dark mode');
  });

  // Risks
  it('renderRisksDetails — empty', () => {
    const { container } = render(<>{renderRisksDetails(makeProps('risks'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderRisksDetails — with data', () => {
    const { container } = render(
      <>{renderRisksDetails(makeProps('risks', {
        risks: [{ id: 'R1', risk: 'Data loss', probability: 'low', impact: 'critical' }],
        summary: { totalRisks: 1, overallRiskLevel: 'medium' },
        riskMatrix: { critical: ['R1'] },
      }))}</>
    );
    expect(container.textContent).toContain('Data loss');
  });

  // Readiness Report
  it('renderReadinessReportDetails — empty', () => {
    const { container } = render(<>{renderReadinessReportDetails(makeProps('readiness-report'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderReadinessReportDetails — with data', () => {
    const { container } = render(
      <>{renderReadinessReportDetails(makeProps('readiness-report', {
        summary: { projectName: 'BMAD', overallStatus: 'Ready', overallScore: 85 },
        blockers: [{ id: 'B1', description: 'Missing API key' }],
        recommendations: [{ recommendation: 'Add monitoring' }],
      }))}</>
    );
    expect(container.textContent).toContain('BMAD');
  });

  // Research
  it('renderResearchDetails — empty', () => {
    const { container } = render(<>{renderResearchDetails(makeProps('research'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderResearchDetails — with data', () => {
    const { container } = render(
      <>{renderResearchDetails(makeProps('research', {
        topic: 'AI in Testing',
        goals: ['Evaluate frameworks'],
        findings: [{ finding: 'Vitest is fast', confidence: 'high' }],
        recommendations: [{ recommendation: 'Adopt Vitest' }],
      }))}</>
    );
    expect(container.textContent).toContain('AI in Testing');
  });

  // UX Design
  it('renderUxDesignDetails — empty', () => {
    expect(() => render(<>{renderUxDesignDetails(makeProps('ux-design'))}</>)).not.toThrow();
  });

  it('renderUxDesignDetails — with data', () => {
    const { container } = render(
      <>{renderUxDesignDetails(makeProps('ux-design', {
        overview: { productName: 'BMAD Studio', designPhilosophy: 'Simple & Clear' },
        coreExperience: { primaryValue: 'Speed' },
        wireframes: [{ id: 'W1', name: 'Dashboard', description: 'Main view' }],
      }))}</>
    );
    expect(container.textContent).toContain('BMAD Studio');
  });

  // Tech Spec
  it('renderTechSpecDetails — empty', () => {
    expect(() => render(<>{renderTechSpecDetails(makeProps('tech-spec'))}</>)).not.toThrow();
  });

  it('renderTechSpecDetails — with data', () => {
    const { container } = render(
      <>{renderTechSpecDetails(makeProps('tech-spec', {
        title: 'Canvas Refactor',
        overview: { summary: 'Refactor canvas rendering', goals: [{ goal: 'Performance' }] },
        context: { overview: 'Current rendering is slow' },
      }))}</>
    );
    expect(container.textContent).toContain('Refactor canvas rendering');
  });

  // Project Overview
  it('renderProjectOverviewDetails — empty', () => {
    expect(() => render(<>{renderProjectOverviewDetails(makeProps('project-overview'))}</>)).not.toThrow();
  });

  it('renderProjectOverviewDetails — with data', () => {
    const { container } = render(
      <>{renderProjectOverviewDetails(makeProps('project-overview', {
        projectInfo: { name: 'BMAD', type: 'web-app' },
        executiveSummary: 'A VS Code extension for BMAD',
        keyFeatures: [{ feature: 'Canvas view', status: 'done' }],
      }))}</>
    );
    expect(container.textContent).toContain('A VS Code extension');
  });

  // Project Context
  it('renderProjectContextDetails — empty', () => {
    expect(() => render(<>{renderProjectContextDetails(makeProps('project-context'))}</>)).not.toThrow();
  });

  it('renderProjectContextDetails — with data', () => {
    const { container } = render(
      <>{renderProjectContextDetails(makeProps('project-context', {
        projectInfo: { name: 'BMAD Studio', type: 'extension' },
        overview: { summary: 'VS Code extension', keyFeatures: ['Canvas', 'Chat'] },
        implementationRules: [{ rule: 'Use TypeScript', rationale: 'Type safety' }],
      }))}</>
    );
    expect(container.textContent).toContain('BMAD Studio');
  });

  // Source Tree
  it('renderSourceTreeDetails — empty', () => {
    expect(() => render(<>{renderSourceTreeDetails(makeProps('source-tree'))}</>)).not.toThrow();
  });

  it('renderSourceTreeDetails — with data', () => {
    expect(() => render(
      <>{renderSourceTreeDetails(makeProps('source-tree', {
        sourceTree: 'src/\n  components/\n  styles/',
      }))}</>
    )).not.toThrow();
  });
});

// ── Edit mode smoke tests ──────────────────────────────────────────────────

describe('bmm-renderers edit mode', () => {
  it('renderDefinitionOfDoneDetails in edit mode', () => {
    const { container } = render(
      <>{renderDefinitionOfDoneDetails(makeEditProps('definition-of-done', {
        items: [{ id: '1', item: 'Tests pass', completed: false }],
      }))}</>
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('renderResearchDetails in edit mode', () => {
    // Research renderer with empty data renders no editable fields since all sections are conditional
    expect(() => render(<>{renderResearchDetails(makeEditProps('research'))}</>)).not.toThrow();
  });

  it('renderTechSpecDetails in edit mode', () => {
    // Tech spec renderer with empty data renders no editable fields since all sections are conditional
    expect(() => render(<>{renderTechSpecDetails(makeEditProps('tech-spec'))}</>)).not.toThrow();
  });

  it('renderChangeProposalDetails in edit mode', () => {
    const { container } = render(<>{renderChangeProposalDetails(makeEditProps('change-proposal'))}</>);
    expect(container.querySelector('textarea, input')).toBeInTheDocument();
  });

  it('renderUxDesignDetails in edit mode', () => {
    // UX design renderer with empty data renders no editable fields since all sections are conditional
    expect(() => render(<>{renderUxDesignDetails(makeEditProps('ux-design'))}</>)).not.toThrow();
  });
});

// ── Deep per-section tests ──────────────────────────────────────────────────

describe('renderDefinitionOfDoneDetails — deep', () => {
  it('renders DoD items with completion state', () => {
    const { container } = render(<>{renderDefinitionOfDoneDetails(makeProps('definition-of-done', {
      items: [
        { id: '1', item: 'Code reviewed', completed: true },
        { id: '2', item: 'Tests pass', completed: false },
      ],
    }))}</>);
    expect(container.textContent).toContain('Code reviewed');
    expect(container.textContent).toContain('Tests pass');
  });

  it('completed items show checkmark indicator (\u2611)', () => {
    const { container } = render(<>{renderDefinitionOfDoneDetails(makeProps('definition-of-done', {
      items: [
        { id: '1', item: 'Done task', completed: true },
        { id: '2', item: 'Pending task', completed: false },
      ],
    }))}</>);
    expect(container.textContent).toContain('\u2611');
    expect(container.textContent).toContain('\u2610');
  });

  it('renders quality gates with pass/fail indicators', () => {
    const { container } = render(<>{renderDefinitionOfDoneDetails(makeProps('definition-of-done', {
      qualityGates: [
        { id: 'QG1', gate: 'Unit tests pass', passed: true },
        { id: 'QG2', gate: 'No critical bugs', passed: false },
      ],
    }))}</>);
    expect(container.textContent).toContain('Unit tests pass');
    expect(container.textContent).toContain('No critical bugs');
    expect(container.textContent).toContain('Passed');
  });

  it('renders summary with completion stats', () => {
    const { container } = render(<>{renderDefinitionOfDoneDetails(makeProps('definition-of-done', {
      summary: { totalItems: 10, completedItems: 7, completionPercentage: '70%' },
    }))}</>);
    expect(container.textContent).toContain('70%');
    expect(container.textContent).toContain('7');
    expect(container.textContent).toContain('10');
  });

  it('edit mode: checkboxes are interactive', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('definition-of-done', {
      items: [{ id: '1', item: 'Tests pass', completed: false }],
    });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderDefinitionOfDoneDetails(props)}</>);
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox);
    expect(handleFieldChange).toHaveBeenCalledWith('items', expect.arrayContaining([
      expect.objectContaining({ completed: true }),
    ]));
  });

  it('edit mode: "Add Item" button exists and calls handleFieldChange', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('definition-of-done', { items: [] });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderDefinitionOfDoneDetails(props)}</>);
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Add Item'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(handleFieldChange).toHaveBeenCalledWith('items', expect.any(Array));
  });
});

describe('renderFitCriteriaDetails — deep', () => {
  it('renders functional criteria section', () => {
    const { container } = render(<>{renderFitCriteriaDetails(makeProps('fit-criteria', {
      functional: [{ criterion: 'Response < 200ms', verified: false }],
    }))}</>);
    expect(container.textContent).toContain('Response < 200ms');
  });

  it('renders non-functional criteria section', () => {
    const { container } = render(<>{renderFitCriteriaDetails(makeProps('fit-criteria', {
      nonFunctional: [{ criterion: 'Uptime 99.9%', verified: true, category: 'reliability' }],
    }))}</>);
    expect(container.textContent).toContain('Uptime 99.9%');
    expect(container.textContent).toContain('reliability');
  });

  it('renders security criteria section', () => {
    const { container } = render(<>{renderFitCriteriaDetails(makeProps('fit-criteria', {
      security: [{ criterion: 'Encrypt PII at rest', verified: false, category: 'encryption' }],
    }))}</>);
    expect(container.textContent).toContain('Encrypt PII at rest');
    expect(container.textContent).toContain('encryption');
  });

  it('verified criteria show verified indicator (\u2611)', () => {
    const { container } = render(<>{renderFitCriteriaDetails(makeProps('fit-criteria', {
      functional: [
        { criterion: 'Verified one', verified: true },
        { criterion: 'Unverified one', verified: false },
      ],
    }))}</>);
    expect(container.textContent).toContain('\u2611');
    expect(container.textContent).toContain('\u2610');
  });

  it('renders summary stats', () => {
    const { container } = render(<>{renderFitCriteriaDetails(makeProps('fit-criteria', {
      summary: { totalCriteria: 5, verifiedCount: 3, verificationPercentage: '60%' },
    }))}</>);
    expect(container.textContent).toContain('60%');
    expect(container.textContent).toContain('3');
  });
});

describe('renderSuccessMetricsDetails — deep', () => {
  it('renders code quality metrics', () => {
    const { container } = render(<>{renderSuccessMetricsDetails(makeProps('success-metrics', {
      codeQuality: [{ metric: 'Coverage', target: '80%' }],
    }))}</>);
    expect(container.textContent).toContain('Coverage');
    expect(container.textContent).toContain('80%');
  });

  it('renders operational metrics with target values', () => {
    const { container } = render(<>{renderSuccessMetricsDetails(makeProps('success-metrics', {
      operational: [{ metric: 'Uptime', target: '99.9%', actualValue: '99.95%' }],
    }))}</>);
    expect(container.textContent).toContain('Uptime');
    expect(container.textContent).toContain('99.9%');
    expect(container.textContent).toContain('99.95%');
  });

  it('renders customer impact metrics', () => {
    const { container } = render(<>{renderSuccessMetricsDetails(makeProps('success-metrics', {
      customerImpact: [{ metric: 'NPS Score', target: '60+' }],
    }))}</>);
    expect(container.textContent).toContain('NPS Score');
    expect(container.textContent).toContain('60+');
  });

  it('renders deployment metrics', () => {
    const { container } = render(<>{renderSuccessMetricsDetails(makeProps('success-metrics', {
      deployment: [{ metric: 'Deploy frequency', target: 'Daily' }],
    }))}</>);
    expect(container.textContent).toContain('Deploy frequency');
    expect(container.textContent).toContain('Daily');
  });
});

describe('renderRetrospectiveDetails — deep', () => {
  it('renders epic reference info', () => {
    const { container } = render(<>{renderRetrospectiveDetails(makeProps('retrospective', {
      epicReference: { epicId: 'E-42', title: 'Canvas Redesign', totalStories: 12 },
    }))}</>);
    expect(container.textContent).toContain('E-42');
    expect(container.textContent).toContain('Canvas Redesign');
    expect(container.textContent).toContain('12');
  });

  it('renders summary with key achievements', () => {
    const { container } = render(<>{renderRetrospectiveDetails(makeProps('retrospective', {
      summary: {
        overallSuccess: 'met-expectations',
        keyAchievements: ['Shipped on time', 'Improved perf by 30%'],
      },
    }))}</>);
    expect(container.textContent).toContain('met-expectations');
    expect(container.textContent).toContain('Shipped on time');
    expect(container.textContent).toContain('Improved perf by 30%');
  });

  it('renders "What Went Well" items', () => {
    const { container } = render(<>{renderRetrospectiveDetails(makeProps('retrospective', {
      whatWentWell: [
        { item: 'Good collaboration', impact: 'Faster delivery' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Good collaboration');
    expect(container.textContent).toContain('Faster delivery');
  });

  it('renders "What Did Not Go Well" items', () => {
    const { container } = render(<>{renderRetrospectiveDetails(makeProps('retrospective', {
      whatDidNotGoWell: [
        { item: 'Scope creep', rootCause: 'Unclear requirements' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Scope creep');
    expect(container.textContent).toContain('Unclear requirements');
  });

  it('renders lessons learned', () => {
    const { container } = render(<>{renderRetrospectiveDetails(makeProps('retrospective', {
      lessonsLearned: [
        { lesson: 'Estimate with more buffer', category: 'estimation', actionable: true },
      ],
    }))}</>);
    expect(container.textContent).toContain('Estimate with more buffer');
    expect(container.textContent).toContain('estimation');
    expect(container.textContent).toContain('Actionable');
  });

  it('renders action items with priority', () => {
    const { container } = render(<>{renderRetrospectiveDetails(makeProps('retrospective', {
      actionItems: [
        { action: 'Improve CI pipeline', priority: 'high', status: 'pending', owner: 'Alice' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Improve CI pipeline');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('pending');
  });
});

describe('renderSprintStatusDetails — deep', () => {
  it('renders project name', () => {
    const { container } = render(<>{renderSprintStatusDetails(makeProps('sprint-status', {
      project: 'BMAD Studio',
    }))}</>);
    expect(container.textContent).toContain('BMAD Studio');
  });

  it('renders summary stats (total/completed stories)', () => {
    const { container } = render(<>{renderSprintStatusDetails(makeProps('sprint-status', {
      summary: { totalStories: 20, completedStories: 15, totalEpics: 3, completedEpics: 1 },
    }))}</>);
    expect(container.textContent).toContain('15');
    expect(container.textContent).toContain('20');
  });

  it('renders epic status items', () => {
    const { container } = render(<>{renderSprintStatusDetails(makeProps('sprint-status', {
      epics: [
        { epicId: 'E1', title: 'Auth Module', status: 'in-progress', stories: [
          { storyId: 'S1', title: 'Login flow', status: 'done' },
        ] },
      ],
    }))}</>);
    expect(container.textContent).toContain('Auth Module');
    expect(container.textContent).toContain('Login flow');
  });
});

describe('renderCodeReviewDetails — deep', () => {
  it('renders story reference', () => {
    const { container } = render(<>{renderCodeReviewDetails(makeProps('code-review', {
      storyReference: { storyKey: 'BMAD-123', storyTitle: 'Add canvas zoom' },
    }))}</>);
    expect(container.textContent).toContain('BMAD-123');
    expect(container.textContent).toContain('Add canvas zoom');
  });

  it('renders review summary with verdict', () => {
    const { container } = render(<>{renderCodeReviewDetails(makeProps('code-review', {
      reviewSummary: { overallVerdict: 'approved', totalFindings: 5, criticalCount: 0, majorCount: 1, minorCount: 4 },
    }))}</>);
    expect(container.textContent).toContain('approved');
    expect(container.textContent).toContain('5');
  });

  it('renders findings with severity', () => {
    const { container } = render(<>{renderCodeReviewDetails(makeProps('code-review', {
      findings: [
        { id: 'F1', severity: 'critical', description: 'SQL injection vulnerability', category: 'security' },
        { id: 'F2', severity: 'minor', description: 'Variable naming', category: 'style' },
      ],
    }))}</>);
    expect(container.textContent).toContain('SQL injection vulnerability');
    expect(container.textContent).toContain('Variable naming');
  });
});

describe('renderChangeProposalDetails — deep', () => {
  it('renders change request with title and type', () => {
    const { container } = render(<>{renderChangeProposalDetails(makeProps('change-proposal', {
      changeRequest: { title: 'Add dark mode', changeType: 'new-requirement', urgency: 'medium' },
    }))}</>);
    expect(container.textContent).toContain('Add dark mode');
    expect(container.textContent).toContain('new-requirement');
    expect(container.textContent).toContain('medium');
  });

  it('renders impact analysis section', () => {
    const { container } = render(<>{renderChangeProposalDetails(makeProps('change-proposal', {
      impactAnalysis: {
        overallImpact: 'moderate',
        affectedEpics: [{ epicId: 'E1', epicTitle: 'Theme System' }],
      },
    }))}</>);
    expect(container.textContent).toContain('moderate');
    expect(container.textContent).toContain('Theme System');
  });

  it('renders proposal with recommendation', () => {
    const { container } = render(<>{renderChangeProposalDetails(makeProps('change-proposal', {
      proposal: { recommendation: 'approve', rationale: 'High user demand' },
    }))}</>);
    expect(container.textContent).toContain('approve');
    expect(container.textContent).toContain('High user demand');
  });

  it('edit mode: change type is editable', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('change-proposal', {
      changeRequest: { title: 'Dark mode', changeType: 'new-requirement', urgency: 'medium' },
    });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderChangeProposalDetails(props)}</>);
    // In edit mode, title should be an input
    const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    // Find the select for change type
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThan(0);
  });
});

describe('renderRisksDetails — deep', () => {
  it('renders risk items with probability and impact', () => {
    const { container } = render(<>{renderRisksDetails(makeProps('risks', {
      risks: [
        { id: 'R1', risk: 'Data loss', probability: 'low', impact: 'critical', mitigation: 'Regular backups' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Data loss');
    expect(container.textContent).toContain('low');
    expect(container.textContent).toContain('critical');
    expect(container.textContent).toContain('Regular backups');
  });

  it('renders summary with overall risk level', () => {
    const { container } = render(<>{renderRisksDetails(makeProps('risks', {
      summary: { totalRisks: 5, overallRiskLevel: 'medium', criticalCount: 1, highCount: 2 },
    }))}</>);
    expect(container.textContent).toContain('5');
    expect(container.textContent).toContain('medium');
    expect(container.textContent).toContain('1');
  });

  it('renders risk matrix information', () => {
    const { container } = render(<>{renderRisksDetails(makeProps('risks', {
      riskMatrix: { critical: ['R1'], high: ['R2', 'R3'], medium: ['R4'] },
    }))}</>);
    expect(container.textContent).toContain('Critical:');
    expect(container.textContent).toContain('R1');
    expect(container.textContent).toContain('High:');
    expect(container.textContent).toContain('R2');
  });
});

describe('renderReadinessReportDetails — deep', () => {
  it('renders summary with project name and status', () => {
    const { container } = render(<>{renderReadinessReportDetails(makeProps('readiness-report', {
      summary: { projectName: 'BMAD Studio', overallStatus: 'ready', overallScore: 92 },
    }))}</>);
    expect(container.textContent).toContain('BMAD Studio');
    expect(container.textContent).toContain('ready');
    expect(container.textContent).toContain('92');
  });

  it('renders blockers list', () => {
    const { container } = render(<>{renderReadinessReportDetails(makeProps('readiness-report', {
      blockers: [
        { id: 'B1', blocker: 'Missing API key', severity: 'high', impact: 'Cannot deploy' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Missing API key');
    expect(container.textContent).toContain('Cannot deploy');
  });

  it('renders recommendations', () => {
    const { container } = render(<>{renderReadinessReportDetails(makeProps('readiness-report', {
      recommendations: [
        { id: 'REC1', recommendation: 'Add monitoring', priority: 'must-do', impact: 'Improves reliability' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Add monitoring');
    expect(container.textContent).toContain('must-do');
  });
});

describe('renderResearchDetails — deep', () => {
  it('renders topic', () => {
    const { container } = render(<>{renderResearchDetails(makeProps('research', {
      topic: 'AI-Assisted Testing',
    }))}</>);
    expect(container.textContent).toContain('AI-Assisted Testing');
  });

  it('renders goals', () => {
    const { container } = render(<>{renderResearchDetails(makeProps('research', {
      goals: [{ goal: 'Evaluate top 3 frameworks', rationale: 'Need best fit' }],
    }))}</>);
    expect(container.textContent).toContain('Evaluate top 3 frameworks');
    expect(container.textContent).toContain('Need best fit');
  });

  it('renders findings with confidence level', () => {
    const { container } = render(<>{renderResearchDetails(makeProps('research', {
      findings: [
        { id: 'F1', finding: 'Vitest is 3x faster than Jest', confidence: 'high', category: 'performance' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Vitest is 3x faster than Jest');
    expect(container.textContent).toContain('high');
  });

  it('renders recommendations', () => {
    const { container } = render(<>{renderResearchDetails(makeProps('research', {
      recommendations: [
        { id: 'R1', recommendation: 'Adopt Vitest', priority: 'high', rationale: 'Faster feedback loops' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Adopt Vitest');
    expect(container.textContent).toContain('Faster feedback loops');
  });
});

describe('renderUxDesignDetails — deep', () => {
  it('renders overview with product name', () => {
    const { container } = render(<>{renderUxDesignDetails(makeProps('ux-design', {
      overview: { productName: 'BMAD Studio', designPhilosophy: 'Simple & Clear' },
    }))}</>);
    expect(container.textContent).toContain('BMAD Studio');
    expect(container.textContent).toContain('Simple & Clear');
  });

  it('renders core experience', () => {
    const { container } = render(<>{renderUxDesignDetails(makeProps('ux-design', {
      coreExperience: { primaryValue: 'Speed and simplicity', userFlowSummary: 'Drag and drop workflow' },
    }))}</>);
    expect(container.textContent).toContain('Speed and simplicity');
    expect(container.textContent).toContain('Drag and drop workflow');
  });

  it('renders wireframes list', () => {
    const { container } = render(<>{renderUxDesignDetails(makeProps('ux-design', {
      wireframes: [
        { id: 'W1', name: 'Dashboard', description: 'Main overview panel' },
        { id: 'W2', name: 'Settings', description: 'Configuration page' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Dashboard');
    expect(container.textContent).toContain('Main overview panel');
    expect(container.textContent).toContain('Settings');
  });
});

describe('renderTechSpecDetails — deep', () => {
  it('renders overview summary', () => {
    const { container } = render(<>{renderTechSpecDetails(makeProps('tech-spec', {
      overview: { summary: 'Refactor canvas rendering pipeline' },
    }))}</>);
    expect(container.textContent).toContain('Refactor canvas rendering pipeline');
  });

  it('renders context section', () => {
    const { container } = render(<>{renderTechSpecDetails(makeProps('tech-spec', {
      context: { overview: 'Current renderer uses legacy approach' },
    }))}</>);
    expect(container.textContent).toContain('Current renderer uses legacy approach');
  });

  it('renders goals list', () => {
    const { container } = render(<>{renderTechSpecDetails(makeProps('tech-spec', {
      overview: { summary: 'Spec', goals: [{ goal: 'Reduce render time by 50%', priority: 'high' }] },
    }))}</>);
    expect(container.textContent).toContain('Reduce render time by 50%');
    expect(container.textContent).toContain('high');
  });
});

describe('renderProjectOverviewDetails — deep', () => {
  it('renders project info', () => {
    const { container } = render(<>{renderProjectOverviewDetails(makeProps('project-overview', {
      projectInfo: { name: 'BMAD Extension', type: 'vscode-extension', version: '1.0.0' },
    }))}</>);
    expect(container.textContent).toContain('BMAD Extension');
    expect(container.textContent).toContain('vscode-extension');
    expect(container.textContent).toContain('1.0.0');
  });

  it('renders executive summary', () => {
    const { container } = render(<>{renderProjectOverviewDetails(makeProps('project-overview', {
      executiveSummary: 'A VS Code extension for managing BMAD artifacts',
    }))}</>);
    expect(container.textContent).toContain('A VS Code extension for managing BMAD artifacts');
  });

  it('renders key features', () => {
    const { container } = render(<>{renderProjectOverviewDetails(makeProps('project-overview', {
      keyFeatures: [
        { feature: 'Canvas view', status: 'implemented' },
        { feature: 'Chat panel', status: 'in-progress' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Canvas view');
    expect(container.textContent).toContain('Chat panel');
  });
});

describe('renderProjectContextDetails — deep', () => {
  it('renders project info', () => {
    const { container } = render(<>{renderProjectContextDetails(makeProps('project-context', {
      projectInfo: { name: 'BMAD Studio', type: 'extension', version: '2.0' },
    }))}</>);
    expect(container.textContent).toContain('BMAD Studio');
    expect(container.textContent).toContain('extension');
  });

  it('renders overview', () => {
    const { container } = render(<>{renderProjectContextDetails(makeProps('project-context', {
      overview: { summary: 'Full-featured BMAD management tool' },
    }))}</>);
    expect(container.textContent).toContain('Full-featured BMAD management tool');
  });

  it('renders implementation rules', () => {
    const { container } = render(<>{renderProjectContextDetails(makeProps('project-context', {
      implementationRules: [
        { rule: 'Use TypeScript strict mode', category: 'code-style', severity: 'must', rationale: 'Type safety' },
      ],
    }))}</>);
    expect(container.textContent).toContain('Use TypeScript strict mode');
    expect(container.textContent).toContain('code-style');
    expect(container.textContent).toContain('must');
    expect(container.textContent).toContain('Type safety');
  });
});

describe('renderSourceTreeDetails — deep', () => {
  it('renders source tree overview with project name', () => {
    const { container } = render(<>{renderSourceTreeDetails(makeProps('source-tree', {
      overview: { projectName: 'BMAD UI', rootPath: '/src', primaryLanguage: 'TypeScript' },
    }))}</>);
    expect(container.textContent).toContain('BMAD UI');
    expect(container.textContent).toContain('/src');
    expect(container.textContent).toContain('TypeScript');
  });

  it('renders critical directories', () => {
    const { container } = render(<>{renderSourceTreeDetails(makeProps('source-tree', {
      criticalDirectories: [
        { path: 'src/components', purpose: 'React components', contents: 'UI elements' },
      ],
    }))}</>);
    expect(container.textContent).toContain('src/components');
    expect(container.textContent).toContain('React components');
  });

  it('renders entry points', () => {
    const { container } = render(<>{renderSourceTreeDetails(makeProps('source-tree', {
      entryPoints: [
        { path: 'src/index.tsx', type: 'main', description: 'App entry' },
      ],
    }))}</>);
    expect(container.textContent).toContain('src/index.tsx');
    expect(container.textContent).toContain('App entry');
  });
});

// ── Edit mode interaction tests ─────────────────────────────────────────────

describe('Edit mode interactions — handleFieldChange', () => {
  it('DoD: text input change calls handleFieldChange', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('definition-of-done', {
      items: [{ id: '1', item: 'Original text', completed: false }],
    });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderDefinitionOfDoneDetails(props)}</>);
    const textInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(textInput).toBeTruthy();
    fireEvent.change(textInput, { target: { value: 'Updated text' } });
    expect(handleFieldChange).toHaveBeenCalledWith('items', expect.any(Array));
  });

  it('FitCriteria: checkbox change calls handleFieldChange', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('fit-criteria', {
      functional: [{ criterion: 'Resp < 1s', verified: false }],
    });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderFitCriteriaDetails(props)}</>);
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox);
    expect(handleFieldChange).toHaveBeenCalledWith('functional', expect.arrayContaining([
      expect.objectContaining({ verified: true }),
    ]));
  });

  it('SuccessMetrics: checkbox change calls handleFieldChange', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('success-metrics', {
      codeQuality: [{ metric: 'Coverage', target: '80%', achieved: false }],
    });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderSuccessMetricsDetails(props)}</>);
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox);
    expect(handleFieldChange).toHaveBeenCalledWith('codeQuality', expect.arrayContaining([
      expect.objectContaining({ achieved: true }),
    ]));
  });

  it('Retrospective: edit action item text calls handleFieldChange', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('retrospective', {
      actionItems: [{ action: 'Fix CI', status: 'pending' }],
    });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderRetrospectiveDetails(props)}</>);
    const textInputs = container.querySelectorAll('input[type="text"]');
    // First text input in the action items section should be the action text
    const actionInput = Array.from(textInputs).find(
      (input) => (input as HTMLInputElement).value === 'Fix CI'
    ) as HTMLInputElement;
    expect(actionInput).toBeTruthy();
    fireEvent.change(actionInput!, { target: { value: 'Fix CI v2' } });
    expect(handleFieldChange).toHaveBeenCalledWith('actionItems', expect.any(Array));
  });

  it('SprintStatus: project input calls handleFieldChange', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('sprint-status', { project: 'BMAD' });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderSprintStatusDetails(props)}</>);
    const projectInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(projectInput).toBeTruthy();
    fireEvent.change(projectInput, { target: { value: 'BMAD v2' } });
    expect(handleFieldChange).toHaveBeenCalledWith('project', 'BMAD v2');
  });

  it('Risks: edit risk text calls handleFieldChange', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('risks', {
      risks: [{ risk: 'Data loss', probability: 'low', impact: 'critical' }],
    });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderRisksDetails(props)}</>);
    const textInputs = container.querySelectorAll('input[type="text"]');
    const riskInput = Array.from(textInputs).find(
      (input) => (input as HTMLInputElement).value === 'Data loss'
    ) as HTMLInputElement;
    expect(riskInput).toBeTruthy();
    fireEvent.change(riskInput, { target: { value: 'Data corruption' } });
    expect(handleFieldChange).toHaveBeenCalledWith('risks', expect.any(Array));
  });
});

describe('Edit mode interactions — Add buttons', () => {
  it('FitCriteria: "+ Add Criterion" button for functional', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('fit-criteria', { functional: [] });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderFitCriteriaDetails(props)}</>);
    const addBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent?.includes('Add Criterion'));
    expect(addBtns.length).toBeGreaterThan(0);
    fireEvent.click(addBtns[0]);
    expect(handleFieldChange).toHaveBeenCalledWith('functional', expect.any(Array));
  });

  it('SuccessMetrics: "+ Add Metric" button for code quality', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('success-metrics', { codeQuality: [] });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderSuccessMetricsDetails(props)}</>);
    const addBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent?.includes('Add Metric'));
    expect(addBtns.length).toBeGreaterThan(0);
    fireEvent.click(addBtns[0]);
    expect(handleFieldChange).toHaveBeenCalledWith('codeQuality', expect.any(Array));
  });

  it('Retrospective: "+ Add Item" button for whatWentWell', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('retrospective', { whatWentWell: [] });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderRetrospectiveDetails(props)}</>);
    const addBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent?.includes('Add Item'));
    expect(addBtns.length).toBeGreaterThan(0);
    fireEvent.click(addBtns[0]);
    expect(handleFieldChange).toHaveBeenCalledWith('whatWentWell', expect.any(Array));
  });

  it('Retrospective: "+ Add Action" button for actionItems', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('retrospective', { actionItems: [] });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderRetrospectiveDetails(props)}</>);
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Add Action'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(handleFieldChange).toHaveBeenCalledWith('actionItems', expect.any(Array));
  });

  it('Risks: "+ Add Risk" button', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('risks', { risks: [] });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderRisksDetails(props)}</>);
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Add Risk'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(handleFieldChange).toHaveBeenCalledWith('risks', expect.any(Array));
  });
});

describe('Edit mode interactions — Remove buttons', () => {
  it('DoD: remove button calls handleFieldChange with filtered array', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('definition-of-done', {
      items: [
        { id: '1', item: 'Item A', completed: false },
        { id: '2', item: 'Item B', completed: false },
      ],
    });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderDefinitionOfDoneDetails(props)}</>);
    // The \u2715 character is used for the remove button
    const removeBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent === '\u2715');
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[0]);
    expect(handleFieldChange).toHaveBeenCalledWith('items', expect.any(Array));
    // Should have removed the first item, leaving only one
    const callArgs = handleFieldChange.mock.calls[0];
    expect(callArgs[1]).toHaveLength(1);
  });

  it('FitCriteria: remove button calls handleFieldChange with filtered array', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('fit-criteria', {
      functional: [
        { criterion: 'Crit A', verified: false },
        { criterion: 'Crit B', verified: false },
      ],
    });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderFitCriteriaDetails(props)}</>);
    const removeBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent === '\u2715');
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[0]);
    expect(handleFieldChange).toHaveBeenCalledWith('functional', expect.any(Array));
    const callArgs = handleFieldChange.mock.calls[0];
    expect(callArgs[1]).toHaveLength(1);
  });

  it('Risks: remove button calls handleFieldChange with filtered array', () => {
    const handleFieldChange = vi.fn();
    const props = makeEditProps('risks', {
      risks: [
        { risk: 'Risk A', probability: 'low', impact: 'low' },
        { risk: 'Risk B', probability: 'high', impact: 'high' },
      ],
    });
    props.handleFieldChange = handleFieldChange;
    const { container } = render(<>{renderRisksDetails(props)}</>);
    const removeBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent === '\u2715');
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[0]);
    expect(handleFieldChange).toHaveBeenCalledWith('risks', expect.any(Array));
    const callArgs = handleFieldChange.mock.calls[0];
    expect(callArgs[1]).toHaveLength(1);
  });
});

describe('Edit mode interactions — addToArray / removeFromArray / updateArrayItem', () => {
  it('UxDesign: addToArray called on "+ Add Pattern"', () => {
    const addToArray = vi.fn();
    const props = makeEditProps('ux-design', {
      uxPatterns: [{ pattern: 'Modal dialog', category: 'feedback', usage: 'Confirm actions' }],
    });
    props.addToArray = addToArray;
    const { container } = render(<>{renderUxDesignDetails(props)}</>);
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Add Pattern'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('uxPatterns', expect.objectContaining({ pattern: '' }));
  });

  it('UxDesign: removeFromArray called on "Remove" button', () => {
    const removeFromArray = vi.fn();
    const props = makeEditProps('ux-design', {
      uxPatterns: [{ pattern: 'Modal dialog', category: 'feedback' }],
    });
    props.removeFromArray = removeFromArray;
    const { container } = render(<>{renderUxDesignDetails(props)}</>);
    const removeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Remove');
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn!);
    expect(removeFromArray).toHaveBeenCalledWith('uxPatterns', 0);
  });

  it('UxDesign: updateArrayItem called on pattern input change', () => {
    const updateArrayItem = vi.fn();
    const props = makeEditProps('ux-design', {
      uxPatterns: [{ pattern: 'Modal', category: 'feedback', usage: '', implementation: '' }],
    });
    props.updateArrayItem = updateArrayItem;
    const { container } = render(<>{renderUxDesignDetails(props)}</>);
    const inputs = container.querySelectorAll('input');
    const patternInput = Array.from(inputs).find(
      (input) => (input as HTMLInputElement).value === 'Modal'
    ) as HTMLInputElement;
    expect(patternInput).toBeTruthy();
    fireEvent.change(patternInput, { target: { value: 'Modal v2' } });
    expect(updateArrayItem).toHaveBeenCalledWith('uxPatterns', 0, expect.objectContaining({ pattern: 'Modal v2' }));
  });

  it('TechSpec: addToArray called on "+ Add Risk"', () => {
    const addToArray = vi.fn();
    const props = makeEditProps('tech-spec', {
      risks: [{ risk: 'Perf regression', probability: 'medium', impact: 'high', mitigation: 'Benchmark' }],
    });
    props.addToArray = addToArray;
    const { container } = render(<>{renderTechSpecDetails(props)}</>);
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Add Risk'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('risks', expect.objectContaining({ risk: '' }));
  });

  it('TechSpec: removeFromArray called on risk "Remove" button', () => {
    const removeFromArray = vi.fn();
    const props = makeEditProps('tech-spec', {
      risks: [{ risk: 'Risk 1', probability: 'low', impact: 'low', mitigation: '' }],
    });
    props.removeFromArray = removeFromArray;
    const { container } = render(<>{renderTechSpecDetails(props)}</>);
    const removeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Remove');
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn!);
    expect(removeFromArray).toHaveBeenCalledWith('risks', 0);
  });

  it('ProjectContext: addToArray called on "+ Add Rule"', () => {
    const addToArray = vi.fn();
    const props = makeEditProps('project-context', {
      implementationRules: [{ rule: 'Use TS', category: 'code-style', severity: 'must', rationale: 'Safety' }],
    });
    props.addToArray = addToArray;
    const { container } = render(<>{renderProjectContextDetails(props)}</>);
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Add Rule'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('implementationRules', expect.objectContaining({ rule: '' }));
  });

  it('ProjectContext: removeFromArray called on rule "Remove" button', () => {
    const removeFromArray = vi.fn();
    const props = makeEditProps('project-context', {
      implementationRules: [{ rule: 'Use TS', category: 'code-style', severity: 'must', rationale: '' }],
    });
    props.removeFromArray = removeFromArray;
    const { container } = render(<>{renderProjectContextDetails(props)}</>);
    const removeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Remove');
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn!);
    expect(removeFromArray).toHaveBeenCalledWith('implementationRules', 0);
  });
});
