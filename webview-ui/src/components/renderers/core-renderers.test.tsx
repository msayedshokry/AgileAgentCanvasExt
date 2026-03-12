/**
 * Smoke tests for core-renderers.tsx
 *
 * Each exported renderer is tested with minimal props to verify it renders
 * without crashing. This covers the "renders at all" code path and pulls
 * in all the default-fallback branches (|| {}, || []) that account for
 * a large fraction of the line count.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import type { Artifact } from '../../types';
import type { RendererProps } from './shared';
import {
  renderPriorityField,
  renderLabelsField,
  renderStoryDetails,
  renderEpicDetails,
  renderRequirementDetails,
  renderVisionDetails,
  renderGenericDetails,
  renderTestCaseDetails,
  renderTestStrategyDetails,
  renderArchitectureDecisionDetails,
  renderSystemComponentDetails,
  renderTaskDetails,
  renderRiskDetails,
  renderNFRDetails,
  renderAdditionalReqDetails,
  renderUseCaseDetails,
  renderPRDDetails,
  renderArchitectureDetails,
  renderProductBriefDetails,
} from './core-renderers';

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

// ── Standalone helpers ──────────────────────────────────────────────────────

describe('renderPriorityField', () => {
  it('renders in view mode without value', () => {
    const { container } = render(<>{renderPriorityField(undefined, vi.fn(), false)}</>);
    expect(container.textContent).toContain('Priority');
  });

  it('renders in view mode with value', () => {
    const { container } = render(<>{renderPriorityField('P0', vi.fn(), false)}</>);
    expect(container.textContent).toContain('P0');
  });

  it('renders in edit mode', () => {
    const { container } = render(<>{renderPriorityField('P1', vi.fn(), true)}</>);
    expect(container.querySelector('select')).toBeInTheDocument();
  });
});

describe('renderLabelsField', () => {
  it('renders empty labels', () => {
    const { container } = render(
      <>{renderLabelsField([], false, vi.fn(), vi.fn(), vi.fn())}</>
    );
    expect(container.textContent).toContain('Labels');
  });

  it('renders with labels', () => {
    const { container } = render(
      <>{renderLabelsField(['alpha', 'beta'], false, vi.fn(), vi.fn(), vi.fn())}</>
    );
    expect(container.textContent).toContain('alpha');
    expect(container.textContent).toContain('beta');
  });

  it('renders in edit mode', () => {
    const { container } = render(
      <>{renderLabelsField(['alpha'], true, vi.fn(), vi.fn(), vi.fn())}</>
    );
    expect(container.querySelector('input')).toBeInTheDocument();
  });
});

// ── RendererProps-based renderers (smoke tests) ─────────────────────────────

describe('core-renderers smoke tests', () => {
  it('renderStoryDetails — empty metadata', () => {
    const { container } = render(<>{renderStoryDetails(makeProps('story'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderStoryDetails — with user story', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', {
        userStory: { asA: 'user', iWant: 'to test', soThat: 'it works' },
        acceptanceCriteria: [{ criterion: 'AC1' }],
        tasks: [{ id: 't1', description: 'Task 1', completed: false }],
      }))}</>
    );
    expect(container.textContent).toContain('user');
  });

  it('renderEpicDetails — empty metadata', () => {
    const { container } = render(<>{renderEpicDetails(makeProps('epic'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderEpicDetails — with data', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {
        goal: 'Deliver value',
        storyCount: 5,
        priority: 'P0',
        functionalRequirements: ['FR-1'],
        dependencies: ['DEP-1'],
      }))}</>
    );
    expect(container.textContent).toContain('Deliver value');
  });

  it('renderRequirementDetails — empty metadata', () => {
    const { container } = render(<>{renderRequirementDetails(makeProps('requirement'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderRequirementDetails — with data', () => {
    const { container } = render(
      <>{renderRequirementDetails(makeProps('requirement', {
        type: 'functional',
        priority: 'P1',
        metrics: { target: '99%', unit: '%' },
        relatedEpics: ['E-1'],
        relatedStories: ['S-1'],
      }))}</>
    );
    expect(container.textContent).toContain('functional');
  });

  it('renderVisionDetails — empty metadata', () => {
    const { container } = render(<>{renderVisionDetails(makeProps('vision'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderVisionDetails — with data', () => {
    const props = makeProps('vision', {
      coreValues: ['Simplicity', 'Speed'],
      targetAudience: ['Developers'],
      successMetrics: ['Adoption rate > 80%'],
    });
    props.artifact.description = 'Our vision statement';
    const { container } = render(<>{renderVisionDetails(props)}</>);
    expect(container.textContent).toContain('Simplicity');
  });

  it('renderGenericDetails — empty metadata', () => {
    const { container } = render(<>{renderGenericDetails(makeProps('epic'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestCaseDetails — empty metadata', () => {
    const { container } = render(<>{renderTestCaseDetails(makeProps('test-case'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestCaseDetails — with steps', () => {
    const { container } = render(
      <>{renderTestCaseDetails(makeProps('test-case', {
        type: 'unit',
        level: 'unit',
        steps: [{ given: 'a user', when: 'they click', then: 'it works' }],
        preconditions: ['Logged in'],
        tags: ['smoke'],
        expectedResult: 'Success',
      }))}</>
    );
    expect(container.textContent).toContain('unit');
  });

  it('renderTestStrategyDetails — empty metadata', () => {
    const { container } = render(<>{renderTestStrategyDetails(makeProps('test-strategy'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestStrategyDetails — with data', () => {
    const { container } = render(
      <>{renderTestStrategyDetails(makeProps('test-strategy', {
        scope: 'Full system',
        approach: 'BDD',
        testTypes: ['unit', 'e2e'],
        tooling: ['vitest', 'playwright'],
        coverageTargets: [{ area: 'core', target: '90%' }],
        riskAreas: ['Auth module'],
      }))}</>
    );
    expect(container.textContent).toContain('Full system');
  });

  it('renderArchitectureDecisionDetails — empty metadata', () => {
    const { container } = render(<>{renderArchitectureDecisionDetails(makeProps('architecture-decision'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderArchitectureDecisionDetails — with data', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', {
        context: 'Need a DB',
        decision: 'Use PostgreSQL',
        rationale: 'Proven technology',
        consequences: { positive: ['Reliable'], negative: ['Complex'] },
        alternatives: [{ option: 'MongoDB', pros: ['Flexible'], cons: ['No joins'] }],
      }))}</>
    );
    expect(container.textContent).toContain('Use PostgreSQL');
  });

  it('renderSystemComponentDetails — empty metadata', () => {
    const { container } = render(<>{renderSystemComponentDetails(makeProps('system-component'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTaskDetails — empty metadata', () => {
    const { container } = render(<>{renderTaskDetails(makeProps('task'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderRiskDetails — empty metadata', () => {
    const { container } = render(<>{renderRiskDetails(makeProps('risk'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderRiskDetails — with data', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        probability: 'high',
        impact: 'critical',
        mitigation: 'Add monitoring',
        category: 'technical',
        triggers: ['Spike in errors'],
      }))}</>
    );
    expect(container.textContent).toContain('Add monitoring');
  });

  it('renderNFRDetails — empty metadata', () => {
    const { container } = render(<>{renderNFRDetails(makeProps('nfr'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderAdditionalReqDetails — empty metadata', () => {
    const { container } = render(<>{renderAdditionalReqDetails(makeProps('additional-req'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderUseCaseDetails — empty metadata', () => {
    const { container } = render(<>{renderUseCaseDetails(makeProps('use-case'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderUseCaseDetails — with flow data', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        summary: 'User logs in',
        primaryActor: 'End User',
        preconditions: ['Has account'],
        postconditions: ['Logged in'],
        mainFlow: [{ step: 1, action: 'Enter credentials' }],
        alternativeFlows: [{ id: 'AF1', name: 'Forgot password', steps: ['Click reset'] }],
        exceptionFlows: [{ id: 'EF1', name: 'Invalid creds', trigger: 'Wrong password' }],
      }))}</>
    );
    expect(container.textContent).toContain('User logs in');
  });

  it('renderPRDDetails — empty metadata', () => {
    const { container } = render(<>{renderPRDDetails(makeProps('prd'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderPRDDetails — with product overview', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        productOverview: {
          productName: 'Acme App',
          purpose: 'Solve problems',
          keyBenefits: ['Fast', 'Reliable'],
        },
        userPersonas: [{ name: 'Dev', role: 'Developer', goals: ['Ship fast'] }],
        successCriteria: [{ criterion: 'Adoption > 80%' }],
      }))}</>
    );
    expect(container.textContent).toContain('Acme App');
  });

  it('renderArchitectureDetails — empty metadata', () => {
    const { container } = render(<>{renderArchitectureDetails(makeProps('architecture'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderArchitectureDetails — with overview', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        overview: {
          projectName: 'BMAD',
          architectureStyle: 'Microservices',
          summary: 'Cloud-native architecture',
        },
        techStack: { frontend: { framework: 'React' } },
        decisions: [{ id: 'ADR-1', title: 'Use React', status: 'accepted', context: 'Need UI', decision: 'React' }],
      }))}</>
    );
    expect(container.textContent).toContain('BMAD');
  });

  it('renderProductBriefDetails — empty metadata', () => {
    const { container } = render(<>{renderProductBriefDetails(makeProps('product-brief'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderProductBriefDetails — with data', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        productName: 'SuperApp',
        vision: { statement: 'Make things better', problemStatement: 'Things are hard' },
        targetUsers: [{ persona: 'Developer', goals: [{ goal: 'Efficiency' }] }],
        keyFeatures: [{ name: 'Dashboard', description: 'Main view' }],
        successMetrics: [{ metric: 'DAU', target: '10k' }],
      }))}</>
    );
    expect(container.textContent).toContain('SuperApp');
  });
});

// ── Edit mode smoke tests ──────────────────────────────────────────────────

describe('core-renderers edit mode', () => {
  function makeEditProps(type: Artifact['type'], metadata: Record<string, any> = {}): RendererProps {
    return {
      ...makeProps(type, metadata),
      editMode: true,
    };
  }

  it('renderStoryDetails in edit mode', () => {
    const { container } = render(<>{renderStoryDetails(makeEditProps('story', {
      userStory: { asA: '', iWant: '', soThat: '' },
    }))}</>);
    expect(container.querySelector('textarea, input')).toBeInTheDocument();
  });

  it('renderEpicDetails in edit mode', () => {
    const { container } = render(<>{renderEpicDetails(makeEditProps('epic'))}</>);
    expect(container.querySelector('textarea, input')).toBeInTheDocument();
  });

  it('renderRequirementDetails in edit mode', () => {
    const { container } = render(<>{renderRequirementDetails(makeEditProps('requirement'))}</>);
    expect(container.querySelector('textarea, input, select')).toBeInTheDocument();
  });

  it('renderVisionDetails in edit mode', () => {
    const { container } = render(<>{renderVisionDetails(makeEditProps('vision'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestCaseDetails in edit mode', () => {
    const { container } = render(<>{renderTestCaseDetails(makeEditProps('test-case'))}</>);
    expect(container.querySelector('textarea, input, select')).toBeInTheDocument();
  });

  it('renderPRDDetails in edit mode', () => {
    const { container } = render(<>{renderPRDDetails(makeEditProps('prd', {
      productOverview: { productName: 'Test' },
    }))}</>);
    expect(container.querySelector('textarea, input')).toBeInTheDocument();
  });

  it('renderArchitectureDetails in edit mode', () => {
    const { container } = render(<>{renderArchitectureDetails(makeEditProps('architecture', {
      overview: { projectName: 'Test' },
    }))}</>);
    expect(container.querySelector('textarea, input')).toBeInTheDocument();
  });

  it('renderUseCaseDetails in edit mode', () => {
    const { container } = render(<>{renderUseCaseDetails(makeEditProps('use-case'))}</>);
    expect(container.querySelector('textarea, input')).toBeInTheDocument();
  });

  it('renderRiskDetails in edit mode', () => {
    const { container } = render(<>{renderRiskDetails(makeEditProps('risk'))}</>);
    expect(container.querySelector('textarea, input, select')).toBeInTheDocument();
  });

  it('renderProductBriefDetails in edit mode', () => {
    const { container } = render(<>{renderProductBriefDetails(makeEditProps('product-brief', {
      productName: 'Test',
      vision: { statement: 'Test vision' },
    }))}</>);
    expect(container.querySelector('textarea, input')).toBeInTheDocument();
  });
});

// ==========================================================================
// DEEP PER-SECTION / PER-FIELD TESTS
// ==========================================================================

// Shared edit-mode helper (top-level, not scoped inside a describe)
function makeEditProps(type: Artifact['type'], metadata: Record<string, any> = {}): RendererProps {
  return {
    ...makeProps(type, metadata),
    editMode: true,
  };
}

// ── renderStoryDetails deep tests ──────────────────────────────────────────

describe('renderStoryDetails deep', () => {
  it('renders User Story section with asA/iWant/soThat', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', {
        userStory: { asA: 'developer', iWant: 'to test', soThat: 'quality improves' },
      }))}</>
    );
    expect(container.textContent).toContain('As a');
    expect(container.textContent).toContain('developer');
    expect(container.textContent).toContain('to test');
    expect(container.textContent).toContain('quality improves');
  });

  it('shows "No user story defined" fallback when no user story data', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', { userStory: {} }))}</>
    );
    expect(container.textContent).toContain('No user story defined');
  });

  it('renders Acceptance Criteria with count', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', {
        acceptanceCriteria: [
          { criterion: 'AC one' },
          { criterion: 'AC two' },
          { criterion: 'AC three' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Acceptance Criteria');
    expect(container.textContent).toContain('(3)');
    expect(container.textContent).toContain('AC one');
    expect(container.textContent).toContain('AC two');
  });

  it('renders Tasks with checkmarks', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', {
        tasks: [
          { id: 't1', description: 'Do thing', completed: true },
          { id: 't2', description: 'Other thing', completed: false },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Tasks');
    expect(container.textContent).toContain('(2)');
    expect(container.textContent).toContain('☑');
    expect(container.textContent).toContain('☐');
    expect(container.textContent).toContain('Do thing');
    expect(container.textContent).toContain('Other thing');
  });

  it('renders Story Points in view mode', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', { storyPoints: 5 }))}</>
    );
    expect(container.textContent).toContain('Story Points');
    expect(container.textContent).toContain('5');
  });

  it('renders "Not estimated" when no story points', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', {}))}</>
    );
    expect(container.textContent).toContain('Not estimated');
  });

  it('renders Dependencies section when blockedBy exists', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', {
        dependencies: { blockedBy: [{ storyId: 'STORY-5' }] },
      }))}</>
    );
    expect(container.textContent).toContain('Dependencies');
    expect(container.textContent).toContain('Blocked By');
    expect(container.textContent).toContain('STORY-5');
  });

  it('hides Dependencies section when no dependency data in view mode', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', {}))}</>
    );
    // Dependencies section uses conditional rendering — should not appear
    expect(container.textContent).not.toContain('Blocked By');
  });

  it('renders Dev Notes section when overview is provided', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', {
        devNotes: { overview: 'Implementation plan here' },
      }))}</>
    );
    expect(container.textContent).toContain('Dev Notes');
    expect(container.textContent).toContain('Implementation plan here');
  });

  it('hides Dev Notes section when devNotes is empty in view mode', () => {
    const { container } = render(
      <>{renderStoryDetails(makeProps('story', {}))}</>
    );
    expect(container.textContent).not.toContain('Dev Notes');
  });

  it('edit mode renders As a / I want / So that inputs', () => {
    const { container } = render(
      <>{renderStoryDetails(makeEditProps('story', {
        userStory: { asA: 'dev', iWant: 'test', soThat: 'works' },
      }))}</>
    );
    expect(container.textContent).toContain('As a');
    expect(container.textContent).toContain('I want');
    expect(container.textContent).toContain('So that');
    // Should have text input for asA and textareas for iWant/soThat
    expect(container.querySelector('input[placeholder="role/persona..."]')).toBeInTheDocument();
    expect(container.querySelector('textarea[placeholder="capability..."]')).toBeInTheDocument();
    expect(container.querySelector('textarea[placeholder="benefit..."]')).toBeInTheDocument();
  });

  it('edit mode renders AC format select (Prose/Given-When-Then)', () => {
    const { container } = render(
      <>{renderStoryDetails(makeEditProps('story', {
        acceptanceCriteria: [{ criterion: 'Something' }],
      }))}</>
    );
    const formatSelect = container.querySelector('.ac-format-select') as HTMLSelectElement;
    expect(formatSelect).toBeInTheDocument();
    expect(formatSelect.value).toBe('prose');
  });

  it('edit mode renders story points number input', () => {
    const { container } = render(
      <>{renderStoryDetails(makeEditProps('story', { storyPoints: 8 }))}</>
    );
    const input = container.querySelector('input[type="number"][placeholder="Points"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('8');
  });

  it('handleFieldChange is called when story points changes', () => {
    const handleFieldChange = vi.fn();
    const props: RendererProps = {
      ...makeEditProps('story', { storyPoints: 3 }),
      handleFieldChange,
    };
    const { container } = render(<>{renderStoryDetails(props)}</>);
    const input = container.querySelector('input[type="number"][placeholder="Points"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '13' } });
    expect(handleFieldChange).toHaveBeenCalledWith('storyPoints', 13);
  });
});

// ── renderEpicDetails deep tests ───────────────────────────────────────────

describe('renderEpicDetails deep', () => {
  it('renders Description section', () => {
    const props = makeProps('epic', { goal: 'Deliver value' });
    props.artifact.description = 'Epic description text';
    const { container } = render(<>{renderEpicDetails(props)}</>);
    expect(container.textContent).toContain('Description');
    expect(container.textContent).toContain('Epic description text');
  });

  it('renders Goal section with content', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', { goal: 'Ship feature X' }))}</>
    );
    expect(container.textContent).toContain('Goal');
    expect(container.textContent).toContain('Ship feature X');
  });

  it('shows "No goal defined" fallback when goal is empty', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {}))}</>
    );
    expect(container.textContent).toContain('No goal defined');
  });

  it('renders Stories count in done/total format', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {
        doneStoryCount: 3,
        totalStoryCount: 10,
      }))}</>
    );
    expect(container.textContent).toContain('Stories');
    expect(container.textContent).toContain('3/10');
  });

  it('renders Value Delivered when data exists', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {
        valueDelivered: 'Improved user experience',
      }))}</>
    );
    expect(container.textContent).toContain('Value Delivered');
    expect(container.textContent).toContain('Improved user experience');
  });

  it('hides Value Delivered when not set in view mode', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {}))}</>
    );
    expect(container.textContent).not.toContain('Value Delivered');
  });

  it('renders Requirements with combined FR/NFR/Additional counts', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {
        functionalRequirements: ['FR-1', 'FR-2'],
        nonFunctionalRequirements: ['NFR-1'],
        additionalRequirements: ['AR-1'],
      }))}</>
    );
    expect(container.textContent).toContain('Requirements');
    expect(container.textContent).toContain('(4)'); // 2 + 1 + 1
  });

  it('renders requirement tags grouped by type', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {
        functionalRequirements: ['FR-1'],
        nonFunctionalRequirements: ['NFR-1'],
        additionalRequirements: ['AR-1'],
      }))}</>
    );
    expect(container.textContent).toContain('Functional');
    expect(container.textContent).toContain('FR-1');
    expect(container.textContent).toContain('Non-Functional');
    expect(container.textContent).toContain('NFR-1');
    expect(container.textContent).toContain('Additional');
    expect(container.textContent).toContain('AR-1');
  });

  it('edit mode renders description textarea', () => {
    const { container } = render(
      <>{renderEpicDetails(makeEditProps('epic', {}))}</>
    );
    expect(container.querySelector('textarea[placeholder="Describe the epic..."]')).toBeInTheDocument();
  });

  it('edit mode renders goal textarea', () => {
    const { container } = render(
      <>{renderEpicDetails(makeEditProps('epic', {}))}</>
    );
    expect(container.querySelector('textarea[placeholder="Epic goal / user outcome..."]')).toBeInTheDocument();
  });

  it('edit mode renders "+ Add FR" button', () => {
    const { container } = render(
      <>{renderEpicDetails(makeEditProps('epic', {
        functionalRequirements: [],
      }))}</>
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const addFRBtn = buttons.find(b => b.textContent?.includes('+ Add FR'));
    expect(addFRBtn).toBeTruthy();
  });

  // --- Risks section (from test-design riskAssessment) ---
  it('renders Risks section with full risk details', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {
        risks: [
          {
            id: 'R-301',
            category: 'technical',
            probability: 'high',
            impact: 'high',
            riskScore: 9,
            description: 'Database migration risk',
            mitigation: 'Use blue-green deployments',
            testStrategy: 'Run migration on staging first',
            owner: 'Platform Team',
          },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Risks');
    expect(container.textContent).toContain('(1)');
    expect(container.textContent).toContain('R-301');
    expect(container.textContent).toContain('technical');
    expect(container.textContent).toContain('P: high');
    expect(container.textContent).toContain('I: high');
    expect(container.textContent).toContain('Score: 9');
    expect(container.textContent).toContain('Database migration risk');
    expect(container.textContent).toContain('Use blue-green deployments');
    expect(container.textContent).toContain('Run migration on staging first');
    expect(container.textContent).toContain('Platform Team');
  });

  it('renders multiple risks with correct count', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {
        risks: [
          { id: 'R-1', description: 'Risk A' },
          { id: 'R-2', description: 'Risk B' },
          { id: 'R-3', description: 'Risk C' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Risks');
    expect(container.textContent).toContain('(3)');
    expect(container.textContent).toContain('Risk A');
    expect(container.textContent).toContain('Risk B');
    expect(container.textContent).toContain('Risk C');
  });

  it('hides Risks section when risks is empty', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', { risks: [] }))}</>
    );
    expect(container.textContent).not.toContain('Risks');
  });

  it('hides Risks section when risks is not present', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {}))}</>
    );
    expect(container.textContent).not.toContain('Risks');
  });

  it('renders risk with minimal fields (only description fallback)', () => {
    const { container } = render(
      <>{renderEpicDetails(makeProps('epic', {
        risks: [{ risk: 'Some risk text' }],
      }))}</>
    );
    expect(container.textContent).toContain('Some risk text');
  });
});

// ── renderRequirementDetails deep tests ────────────────────────────────────

describe('renderRequirementDetails deep', () => {
  it('renders Type badge', () => {
    const { container } = render(
      <>{renderRequirementDetails(makeProps('requirement', { type: 'functional' }))}</>
    );
    expect(container.textContent).toContain('Type');
    expect(container.textContent).toContain('functional');
  });

  it('renders Priority, Status, and Verification sections', () => {
    const { container } = render(
      <>{renderRequirementDetails(makeProps('requirement', {
        type: 'functional',
        priority: 'P0',
        requirementStatus: 'approved',
        verificationMethod: 'test',
      }))}</>
    );
    expect(container.textContent).toContain('P0');
    expect(container.textContent).toContain('Status');
    expect(container.textContent).toContain('approved');
    expect(container.textContent).toContain('Verification');
    expect(container.textContent).toContain('test');
  });

  it('renders Description section', () => {
    const props = makeProps('requirement', { type: 'functional' });
    props.artifact.description = 'Requirement description here';
    const { container } = render(<>{renderRequirementDetails(props)}</>);
    expect(container.textContent).toContain('Description');
    expect(container.textContent).toContain('Requirement description here');
  });

  it('renders Rationale section when data exists', () => {
    const { container } = render(
      <>{renderRequirementDetails(makeProps('requirement', {
        rationale: 'Because users need this',
      }))}</>
    );
    expect(container.textContent).toContain('Rationale');
    expect(container.textContent).toContain('Because users need this');
  });

  it('hides Rationale section when not set in view mode', () => {
    const { container } = render(
      <>{renderRequirementDetails(makeProps('requirement', {}))}</>
    );
    expect(container.textContent).not.toContain('Rationale');
  });

  it('renders Acceptance Criteria with count', () => {
    const { container } = render(
      <>{renderRequirementDetails(makeProps('requirement', {
        acceptanceCriteria: [
          { id: 'AC-1', given: 'a user', when: 'they login', then: 'access granted' },
          { id: 'AC-2', given: 'invalid creds', when: 'login attempt', then: 'rejected' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Acceptance Criteria');
    expect(container.textContent).toContain('(2)');
    expect(container.textContent).toContain('Given');
    expect(container.textContent).toContain('a user');
  });

  it('renders Related Epics and Stories with counts', () => {
    const { container } = render(
      <>{renderRequirementDetails(makeProps('requirement', {
        relatedEpics: ['EPIC-1', 'EPIC-2'],
        relatedStories: ['STORY-1'],
      }))}</>
    );
    expect(container.textContent).toContain('Related Epics');
    expect(container.textContent).toContain('(2)');
    expect(container.textContent).toContain('Related Stories');
    expect(container.textContent).toContain('(1)');
    expect(container.textContent).toContain('EPIC-1');
    expect(container.textContent).toContain('STORY-1');
  });

  it('edit mode renders type select', () => {
    const { container } = render(
      <>{renderRequirementDetails(makeEditProps('requirement', { type: 'functional' }))}</>
    );
    const selects = Array.from(container.querySelectorAll('select.status-select'));
    const typeSelect = selects.find(s => {
      const options = Array.from(s.querySelectorAll('option'));
      return options.some(o => o.value === 'functional');
    });
    expect(typeSelect).toBeTruthy();
  });

  it('edit mode renders status select with REQUIREMENT_STATUS_OPTIONS', () => {
    const { container } = render(
      <>{renderRequirementDetails(makeEditProps('requirement', {}))}</>
    );
    const selects = Array.from(container.querySelectorAll('select.status-select'));
    // Find the status select (the one that has requirementStatus options)
    const statusSelect = selects.find(s => {
      const options = Array.from(s.querySelectorAll('option'));
      return options.some(o => o.value === 'approved' || o.value === 'proposed');
    });
    expect(statusSelect).toBeTruthy();
  });

  it('edit mode renders verification select with VERIFICATION_METHOD_OPTIONS', () => {
    const { container } = render(
      <>{renderRequirementDetails(makeEditProps('requirement', {}))}</>
    );
    const selects = Array.from(container.querySelectorAll('select.status-select'));
    const verificationSelect = selects.find(s => {
      const options = Array.from(s.querySelectorAll('option'));
      return options.some(o => o.value === 'test' || o.value === 'inspection' || o.value === 'demonstration');
    });
    expect(verificationSelect).toBeTruthy();
  });
});

// ── renderTestCaseDetails deep tests ───────────────────────────────────────

describe('renderTestCaseDetails deep', () => {
  it('renders header metadata — type badge and priority', () => {
    const { container } = render(
      <>{renderTestCaseDetails(makeProps('test-case', {
        type: 'integration',
        priority: 'P1',
      }))}</>
    );
    expect(container.textContent).toContain('Type');
    expect(container.textContent).toContain('integration');
    expect(container.textContent).toContain('Priority');
    expect(container.textContent).toContain('P1');
  });

  it('renders Test Steps with count', () => {
    const { container } = render(
      <>{renderTestCaseDetails(makeProps('test-case', {
        steps: [
          { action: 'Click button', expectedResult: 'Modal opens' },
          { action: 'Fill form', expectedResult: 'Data saved' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Test Steps');
    expect(container.textContent).toContain('(2)');
  });

  it('renders step action and expected result', () => {
    const { container } = render(
      <>{renderTestCaseDetails(makeProps('test-case', {
        steps: [{ action: 'Click submit', expectedResult: 'Form submitted' }],
      }))}</>
    );
    expect(container.textContent).toContain('Click submit');
    expect(container.textContent).toContain('Form submitted');
  });

  it('renders Preconditions list', () => {
    const { container } = render(
      <>{renderTestCaseDetails(makeProps('test-case', {
        preconditions: ['Logged in', 'Has permissions'],
      }))}</>
    );
    expect(container.textContent).toContain('Preconditions');
    expect(container.textContent).toContain('(2)');
    expect(container.textContent).toContain('Logged in');
    expect(container.textContent).toContain('Has permissions');
  });

  it('renders Tags section with tags', () => {
    const { container } = render(
      <>{renderTestCaseDetails(makeProps('test-case', {
        tags: ['smoke', 'regression'],
      }))}</>
    );
    expect(container.textContent).toContain('Tags');
    expect(container.textContent).toContain('(2)');
    expect(container.textContent).toContain('smoke');
    expect(container.textContent).toContain('regression');
  });

  it('renders Expected Result section', () => {
    const { container } = render(
      <>{renderTestCaseDetails(makeProps('test-case', {
        expectedResult: 'All tests pass',
      }))}</>
    );
    expect(container.textContent).toContain('Expected Result');
    expect(container.textContent).toContain('All tests pass');
  });

  it('edit mode renders step editing fields', () => {
    const { container } = render(
      <>{renderTestCaseDetails(makeEditProps('test-case', {
        steps: [{ action: 'Do thing', expectedResult: 'Thing done' }],
      }))}</>
    );
    const actionInput = container.querySelector('input[placeholder="Action..."]') as HTMLInputElement;
    expect(actionInput).toBeInTheDocument();
    expect(actionInput.value).toBe('Do thing');
    const resultInput = container.querySelector('input[placeholder="Expected result..."]') as HTMLInputElement;
    expect(resultInput).toBeInTheDocument();
    expect(resultInput.value).toBe('Thing done');
  });
});

// ── renderUseCaseDetails deep tests ────────────────────────────────────────

describe('renderUseCaseDetails deep', () => {
  it('renders header metadata — primaryActor', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        primaryActor: 'End User',
      }))}</>
    );
    expect(container.textContent).toContain('Primary Actor');
    expect(container.textContent).toContain('End User');
  });

  it('renders Summary section', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        summary: 'User authenticates via SSO',
      }))}</>
    );
    expect(container.textContent).toContain('Summary');
    expect(container.textContent).toContain('User authenticates via SSO');
  });

  it('renders Main Flow with steps', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        mainFlow: [
          { step: 1, action: 'Open login page' },
          { step: 2, action: 'Enter credentials' },
          { step: 3, action: 'Click submit' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Main Flow');
    expect(container.textContent).toContain('(3)');
    expect(container.textContent).toContain('Open login page');
    expect(container.textContent).toContain('Enter credentials');
  });

  it('renders Alternative Flows', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        alternativeFlows: [
          { id: 'AF1', name: 'Forgot password', steps: ['Click reset', 'Enter email'] },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Alternative Flows');
    expect(container.textContent).toContain('Forgot password');
    expect(container.textContent).toContain('Click reset');
  });

  it('hides Exception Flows when none exist in view mode', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {}))}</>
    );
    expect(container.textContent).not.toContain('Exception Flows');
  });

  it('renders Exception Flows when data exists', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        exceptionFlows: [
          { id: 'EF1', name: 'Invalid credentials', trigger: 'Wrong password' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Exception Flows');
    expect(container.textContent).toContain('Invalid credentials');
    expect(container.textContent).toContain('Wrong password');
  });

  it('renders Preconditions and Postconditions', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        preconditions: ['User has account'],
        postconditions: ['User is logged in'],
      }))}</>
    );
    expect(container.textContent).toContain('Preconditions');
    expect(container.textContent).toContain('User has account');
    expect(container.textContent).toContain('Postconditions');
    expect(container.textContent).toContain('User is logged in');
  });
});

// ── renderPRDDetails deep tests ────────────────────────────────────────────

describe('renderPRDDetails deep', () => {
  it('renders Product Overview with product name', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        productOverview: { productName: 'WidgetApp' },
      }))}</>
    );
    expect(container.textContent).toContain('Product Overview');
    expect(container.textContent).toContain('WidgetApp');
  });

  it('renders User Personas with names', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        userPersonas: [
          { name: 'Alice', role: 'PM' },
          { name: 'Bob', role: 'Developer' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('User Personas');
    expect(container.textContent).toContain('(2)');
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
  });

  it('renders Success Criteria items', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        successCriteria: [
          { criterion: 'DAU > 10k' },
          { criterion: 'NPS > 50' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Success Criteria');
    expect(container.textContent).toContain('DAU > 10k');
    expect(container.textContent).toContain('NPS > 50');
  });

  it('renders Constraints items', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        constraints: [
          { type: 'Technical', description: 'Must use React', flexibility: 'fixed' },
          { type: 'Budget', description: 'Budget under 50k' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Constraints');
    expect(container.textContent).toContain('Must use React');
  });

  it('renders Risks items', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        risks: [
          { risk: 'Timeline slip', mitigation: 'Buffer time' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Risks');
    expect(container.textContent).toContain('Timeline slip');
  });
});

// ── renderArchitectureDetails deep tests ───────────────────────────────────

describe('renderArchitectureDetails deep', () => {
  it('renders Architecture Overview with project name and style', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        overview: {
          projectName: 'MyProject',
          architectureStyle: 'Microservices',
          summary: 'Cloud-native approach',
        },
      }))}</>
    );
    expect(container.textContent).toContain('Architecture Overview');
    expect(container.textContent).toContain('MyProject');
    expect(container.textContent).toContain('Microservices');
    expect(container.textContent).toContain('Cloud-native approach');
  });

  it('renders Technology Stack with frontend framework', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        techStack: {
          frontend: { framework: 'React', language: 'TypeScript' },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Technology Stack');
    expect(container.textContent).toContain('Frontend');
    expect(container.textContent).toContain('React');
    expect(container.textContent).toContain('TypeScript');
  });

  it('renders Architecture Decisions with count', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        decisions: [
          { id: 'ADR-1', title: 'Use React', status: 'accepted', context: 'Need UI', decision: 'React' },
          { id: 'ADR-2', title: 'Use PostgreSQL', status: 'proposed', context: 'Need DB', decision: 'PG' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Architecture Decisions');
    expect(container.textContent).toContain('(2)');
    expect(container.textContent).toContain('Use React');
    expect(container.textContent).toContain('Use PostgreSQL');
  });

  it('renders System Components', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        systemComponents: [
          { name: 'API Gateway', description: 'Routes requests', technology: 'Express' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('System Components');
    expect(container.textContent).toContain('API Gateway');
  });

  it('renders Patterns section', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        patterns: [
          { pattern: 'Repository Pattern', category: 'structural', usage: 'Data access' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Patterns');
    expect(container.textContent).toContain('Repository Pattern');
    expect(container.textContent).toContain('structural');
  });
});

// ── renderProductBriefDetails deep tests ───────────────────────────────────

describe('renderProductBriefDetails deep', () => {
  it('renders product name in Product section', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        productName: 'MegaWidget',
      }))}</>
    );
    expect(container.textContent).toContain('Product');
    expect(container.textContent).toContain('MegaWidget');
  });

  it('renders Vision section with statement', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        vision: { statement: 'Empower teams to build faster' },
      }))}</>
    );
    expect(container.textContent).toContain('Vision');
    expect(container.textContent).toContain('Empower teams to build faster');
  });

  it('renders Target Users with persona names', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        targetUsers: [
          { persona: 'Developer', description: 'Full-stack dev' },
          { persona: 'Designer', description: 'UI/UX designer' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Target Users');
    expect(container.textContent).toContain('(2)');
    expect(container.textContent).toContain('Developer');
    expect(container.textContent).toContain('Designer');
  });

  it('renders Key Features', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        keyFeatures: [
          { name: 'Dashboard', description: 'Main overview' },
          { name: 'Reports', description: 'Data export' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Key Features');
    expect(container.textContent).toContain('Dashboard');
    expect(container.textContent).toContain('Reports');
  });

  it('renders Success Metrics', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        successMetrics: [
          { metric: 'DAU', target: '10k' },
          { metric: 'Retention', target: '80%' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Success Metrics');
    expect(container.textContent).toContain('DAU');
    expect(container.textContent).toContain('Retention');
  });
});

// ── renderRiskDetails deep tests ───────────────────────────────────────────

describe('renderRiskDetails deep', () => {
  it('renders header metadata — category, probability, impact', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        category: 'technical',
        probability: 'high',
        impact: 'critical',
      }))}</>
    );
    expect(container.textContent).toContain('Category');
    expect(container.textContent).toContain('technical');
    expect(container.textContent).toContain('Probability');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('Impact');
    expect(container.textContent).toContain('critical');
  });

  it('renders Description section', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        description: 'Server may go down under load',
      }))}</>
    );
    expect(container.textContent).toContain('Description');
    expect(container.textContent).toContain('Server may go down under load');
  });

  it('renders Mitigation Strategy', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        mitigation: 'Add auto-scaling and monitoring',
      }))}</>
    );
    expect(container.textContent).toContain('Mitigation Strategy');
    expect(container.textContent).toContain('Add auto-scaling and monitoring');
  });

  it('renders Triggers list', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        triggers: ['CPU usage > 90%', 'Error rate > 5%'],
      }))}</>
    );
    expect(container.textContent).toContain('Triggers');
    expect(container.textContent).toContain('(2)');
    expect(container.textContent).toContain('CPU usage > 90%');
    expect(container.textContent).toContain('Error rate > 5%');
  });

  it('shows "No triggers defined" when triggers empty', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', { triggers: [] }))}</>
    );
    expect(container.textContent).toContain('No triggers defined');
  });

  it('renders Risk Score section', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        riskScore: 'high',
      }))}</>
    );
    expect(container.textContent).toContain('Risk Score');
    expect(container.textContent).toContain('high');
  });

  it('edit mode renders category select', () => {
    const { container } = render(
      <>{renderRiskDetails(makeEditProps('risk', {}))}</>
    );
    const selects = Array.from(container.querySelectorAll('select.status-select'));
    const categorySelect = selects.find(s => {
      const options = Array.from(s.querySelectorAll('option'));
      return options.some(o => o.value === 'technical') && options.some(o => o.value === 'security');
    });
    expect(categorySelect).toBeTruthy();
  });
});

// ── Edit mode interaction tests ────────────────────────────────────────────

describe('edit mode interactions', () => {
  it('handleFieldChange is called on epic description change', () => {
    const handleFieldChange = vi.fn();
    const props: RendererProps = {
      ...makeEditProps('epic', {}),
      handleFieldChange,
    };
    const { container } = render(<>{renderEpicDetails(props)}</>);
    const textarea = container.querySelector('textarea[placeholder="Describe the epic..."]') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New description' } });
    expect(handleFieldChange).toHaveBeenCalledWith('description', 'New description');
  });

  it('handleFieldChange is called on risk mitigation change', () => {
    const handleFieldChange = vi.fn();
    const props: RendererProps = {
      ...makeEditProps('risk', {}),
      handleFieldChange,
    };
    const { container } = render(<>{renderRiskDetails(props)}</>);
    const textarea = container.querySelector('textarea[placeholder="How to mitigate this risk..."]') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Monitor closely' } });
    expect(handleFieldChange).toHaveBeenCalledWith('mitigation', 'Monitor closely');
  });

  it('addToArray is called when "+ Add Task" button is clicked', () => {
    const addToArray = vi.fn();
    const props: RendererProps = {
      ...makeEditProps('story', { tasks: [] }),
      addToArray,
    };
    const { container } = render(<>{renderStoryDetails(props)}</>);
    const buttons = Array.from(container.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent?.includes('+ Add Task'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('tasks', { description: '', completed: false });
  });

  it('removeFromArray is called when "x" button clicked on a task', () => {
    const removeFromArray = vi.fn();
    const props: RendererProps = {
      ...makeEditProps('story', {
        tasks: [{ id: 't1', description: 'Task to remove', completed: false }],
      }),
      removeFromArray,
    };
    const { container } = render(<>{renderStoryDetails(props)}</>);
    // Find remove button within the task edit area
    const removeBtns = Array.from(container.querySelectorAll('.task-edit .remove-btn'));
    expect(removeBtns.length).toBeGreaterThan(0);
    fireEvent.click(removeBtns[0]);
    expect(removeFromArray).toHaveBeenCalledWith('tasks', 0);
  });

  it('addToArray is called when "+ Add Trigger" button is clicked on risk', () => {
    const addToArray = vi.fn();
    const props: RendererProps = {
      ...makeEditProps('risk', { triggers: [] }),
      addToArray,
    };
    const { container } = render(<>{renderRiskDetails(props)}</>);
    const buttons = Array.from(container.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent?.includes('+ Add Trigger'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('triggers', '');
  });

  it('removeFromArray is called when "x" button clicked on a label', () => {
    const removeFromArray = vi.fn();
    const { container } = render(
      <>{renderLabelsField(['alpha', 'beta'], true, vi.fn(), removeFromArray, vi.fn())}</>
    );
    const removeBtns = Array.from(container.querySelectorAll('.remove-btn'));
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[1]);
    expect(removeFromArray).toHaveBeenCalledWith('labels', 1);
  });

  it('addToArray is called when "+ Add Label" button is clicked', () => {
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderLabelsField([], true, vi.fn(), vi.fn(), addToArray)}</>
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent?.includes('+ Add Label'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('labels', '');
  });

  it('handleFieldChange is called when use case primary actor changes', () => {
    const handleFieldChange = vi.fn();
    const props: RendererProps = {
      ...makeEditProps('use-case', { primaryActor: 'Old Actor' }),
      handleFieldChange,
    };
    const { container } = render(<>{renderUseCaseDetails(props)}</>);
    const input = container.querySelector('input[placeholder="Primary actor"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'New Actor' } });
    expect(handleFieldChange).toHaveBeenCalledWith('primaryActor', 'New Actor');
  });
});

// ==========================================================================
// renderSystemComponentDetails deep tests
// ==========================================================================

describe('renderSystemComponentDetails deep', () => {
  // ── View mode tests ──

  it('renders componentType as tag in view mode', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', { componentType: 'Service' }))}</>
    );
    expect(container.textContent).toContain('Component Type');
    expect(container.textContent).toContain('Service');
    expect(container.querySelector('.tag')?.textContent).toBe('Service');
  });

  it('shows "Not specified" when componentType is absent', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', {}))}</>
    );
    expect(container.textContent).toContain('Not specified');
  });

  it('renders description via Md in view mode', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', { description: 'Auth service handles login' }))}</>
    );
    expect(container.textContent).toContain('Auth service handles login');
  });

  it('shows "No description" when description is absent', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', {}))}</>
    );
    expect(container.textContent).toContain('No description');
  });

  it('renders responsibilities as list items', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', {
        responsibilities: ['Handle auth', 'Manage sessions', 'Token refresh'],
      }))}</>
    );
    expect(container.textContent).toContain('Responsibilities');
    const items = container.querySelectorAll('.criteria-list li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe('Handle auth');
    expect(items[1].textContent).toBe('Manage sessions');
    expect(items[2].textContent).toBe('Token refresh');
  });

  it('shows "No responsibilities defined" for empty responsibilities', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', { responsibilities: [] }))}</>
    );
    expect(container.textContent).toContain('No responsibilities defined');
  });

  it('renders interfaces with name, type, description, protocol', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', {
        interfaces: [
          { name: 'REST API', type: 'HTTP', description: 'Public endpoints', protocol: 'HTTPS' },
          { name: 'gRPC', type: 'RPC' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('REST API');
    expect(container.textContent).toContain('HTTP');
    expect(container.textContent).toContain('Public endpoints');
    expect(container.textContent).toContain('Protocol: HTTPS');
    expect(container.textContent).toContain('gRPC');
    expect(container.textContent).toContain('RPC');
  });

  it('renders interface fallback name when name is absent', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', {
        interfaces: [{ type: 'WebSocket' }],
      }))}</>
    );
    expect(container.textContent).toContain('Interface 1');
  });

  it('shows "No interfaces defined" for empty interfaces', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', { interfaces: [] }))}</>
    );
    expect(container.textContent).toContain('No interfaces defined');
  });

  it('renders technology array as tags', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', {
        technology: ['Node.js', 'TypeScript', 'PostgreSQL'],
      }))}</>
    );
    expect(container.textContent).toContain('Technology');
    const tags = container.querySelectorAll('.tags-list .tag');
    // tech tags (there may be other .tag elements from componentType, etc.)
    const techTexts = Array.from(tags).map(t => t.textContent);
    expect(techTexts).toContain('Node.js');
    expect(techTexts).toContain('TypeScript');
    expect(techTexts).toContain('PostgreSQL');
  });

  it('normalizes technology string to single-element array', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', {
        technology: 'React',
      }))}</>
    );
    expect(container.textContent).toContain('React');
  });

  it('shows "No technologies specified" for empty technology', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', { technology: [] }))}</>
    );
    expect(container.textContent).toContain('No technologies specified');
  });

  it('renders componentDependencies as tags', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', {
        componentDependencies: ['auth-service', 'database'],
      }))}</>
    );
    expect(container.textContent).toContain('Dependencies');
    expect(container.textContent).toContain('auth-service');
    expect(container.textContent).toContain('database');
  });

  it('shows "No dependencies" for empty componentDependencies', () => {
    const { container } = render(
      <>{renderSystemComponentDetails(makeProps('system-component', { componentDependencies: [] }))}</>
    );
    expect(container.textContent).toContain('No dependencies');
  });

  // ── Edit mode tests ──

  it('renders componentType input in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderSystemComponentDetails({
        ...makeEditProps('system-component', { componentType: 'Library' }),
        handleFieldChange,
      })}</>
    );
    const input = container.querySelector('input[placeholder="e.g., Service, Library, API"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Library');
    fireEvent.change(input, { target: { value: 'API Gateway' } });
    expect(handleFieldChange).toHaveBeenCalledWith('componentType', 'API Gateway');
  });

  it('renders description textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderSystemComponentDetails({
        ...makeEditProps('system-component', { description: 'Old desc' }),
        handleFieldChange,
      })}</>
    );
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('Old desc');
    fireEvent.change(textarea, { target: { value: 'New desc' } });
    expect(handleFieldChange).toHaveBeenCalledWith('description', 'New desc');
  });

  it('renders responsibilities editable list in edit mode', () => {
    const updateArrayItem = vi.fn();
    const removeFromArray = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderSystemComponentDetails({
        ...makeEditProps('system-component', { responsibilities: ['Auth', 'Sessions'] }),
        updateArrayItem,
        removeFromArray,
        addToArray,
      })}</>
    );
    const inputs = container.querySelectorAll('input[placeholder="Responsibility..."]');
    expect(inputs.length).toBe(2);
    fireEvent.change(inputs[0], { target: { value: 'Updated Auth' } });
    expect(updateArrayItem).toHaveBeenCalledWith('responsibilities', 0, 'Updated Auth');

    const removeBtns = container.querySelectorAll('.editable-list .remove-btn');
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[1]);
    expect(removeFromArray).toHaveBeenCalledWith('responsibilities', 1);

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Responsibility'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('responsibilities', '');
  });
});

// ==========================================================================
// renderTaskDetails deep tests
// ==========================================================================

describe('renderTaskDetails deep', () => {
  // ── View mode ──

  it('renders AC Reference text in view mode', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', { acReference: 'AC-1.2' }))}</>
    );
    expect(container.textContent).toContain('AC Reference');
    expect(container.textContent).toContain('AC-1.2');
  });

  it('shows "None" when acReference is absent', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', {}))}</>
    );
    expect(container.textContent).toContain('None');
  });

  it('renders estimated hours with "h" suffix', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', { estimatedHours: 4.5 }))}</>
    );
    expect(container.textContent).toContain('Estimated Hours');
    expect(container.textContent).toContain('4.5h');
  });

  it('shows "Not estimated" when estimatedHours is absent', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', {}))}</>
    );
    expect(container.textContent).toContain('Not estimated');
  });

  it('renders "Complete" status badge when completed is true', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', { completed: true }))}</>
    );
    const badge = container.querySelector('.status-badge.status-complete');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toBe('Complete');
  });

  it('renders "Pending" status badge when completed is false', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', { completed: false }))}</>
    );
    const badge = container.querySelector('.status-badge.status-draft');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toBe('Pending');
  });

  it('renders description via Md in view mode', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', { description: 'Implement login flow' }))}</>
    );
    expect(container.textContent).toContain('Implement login flow');
  });

  it('shows "No description" when description is absent', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', {}))}</>
    );
    expect(container.textContent).toContain('No description');
  });

  it('renders subtasks with title and completed styling', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', {
        subtasks: [
          { title: 'Setup DB', completed: true },
          { title: 'Write tests', completed: false },
          { description: 'Deploy', completed: false },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Subtasks');
    const items = container.querySelectorAll('.criteria-list li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Setup DB');
    expect(items[0].textContent).toContain('Done');
    // Completed subtask should have line-through style
    const span0 = items[0].querySelector('span');
    expect(span0?.style.textDecoration).toBe('line-through');
    // Incomplete subtask should NOT have line-through
    expect(items[1].textContent).toContain('Write tests');
    const span1 = items[1].querySelector('span');
    expect(span1?.style.textDecoration).toBe('none');
    // Falls back to description when title is absent
    expect(items[2].textContent).toContain('Deploy');
  });

  it('renders subtask fallback name when title and description absent', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', {
        subtasks: [{ completed: false }],
      }))}</>
    );
    expect(container.textContent).toContain('Subtask 1');
  });

  it('shows "No subtasks" for empty subtasks', () => {
    const { container } = render(
      <>{renderTaskDetails(makeProps('task', { subtasks: [] }))}</>
    );
    expect(container.textContent).toContain('No subtasks');
  });

  // ── Edit mode ──

  it('renders acReference input in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderTaskDetails({
        ...makeEditProps('task', { acReference: 'AC-3' }),
        handleFieldChange,
      })}</>
    );
    const input = container.querySelector('input[placeholder="Acceptance criteria reference..."]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('AC-3');
    fireEvent.change(input, { target: { value: 'AC-4' } });
    expect(handleFieldChange).toHaveBeenCalledWith('acReference', 'AC-4');
  });

  it('renders estimatedHours number input in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderTaskDetails({
        ...makeEditProps('task', { estimatedHours: 2 }),
        handleFieldChange,
      })}</>
    );
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('2');
    fireEvent.change(input, { target: { value: '5' } });
    expect(handleFieldChange).toHaveBeenCalledWith('estimatedHours', 5);
  });

  it('clears estimatedHours to undefined when input emptied', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderTaskDetails({
        ...makeEditProps('task', { estimatedHours: 2 }),
        handleFieldChange,
      })}</>
    );
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(handleFieldChange).toHaveBeenCalledWith('estimatedHours', undefined);
  });

  it('renders description textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderTaskDetails({
        ...makeEditProps('task', { description: 'Old task' }),
        handleFieldChange,
      })}</>
    );
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('Old task');
    fireEvent.change(textarea, { target: { value: 'New task' } });
    expect(handleFieldChange).toHaveBeenCalledWith('description', 'New task');
  });
});

// ==========================================================================
// renderNFRDetails deep tests
// ==========================================================================

describe('renderNFRDetails deep', () => {
  // ── View mode ──

  it('renders category as tag in view mode', () => {
    const { container } = render(
      <>{renderNFRDetails(makeProps('nfr', { category: 'performance' }))}</>
    );
    expect(container.textContent).toContain('Category');
    expect(container.querySelector('.tag')?.textContent).toBe('performance');
  });

  it('shows "Not categorized" when category is absent', () => {
    const { container } = render(
      <>{renderNFRDetails(makeProps('nfr', {}))}</>
    );
    expect(container.textContent).toContain('Not categorized');
  });

  it('renders description via Md', () => {
    const { container } = render(
      <>{renderNFRDetails(makeProps('nfr', { description: 'Response time under 200ms' }))}</>
    );
    expect(container.textContent).toContain('Response time under 200ms');
  });

  it('shows "No description" when description is absent', () => {
    const { container } = render(
      <>{renderNFRDetails(makeProps('nfr', {}))}</>
    );
    expect(container.textContent).toContain('No description');
  });

  it('renders metrics object with target, threshold, unit in view mode', () => {
    const { container } = render(
      <>{renderNFRDetails(makeProps('nfr', {
        metrics: { target: '< 200ms', threshold: '< 500ms', unit: 'ms' },
      }))}</>
    );
    expect(container.textContent).toContain('Metrics');
    expect(container.textContent).toContain('Target');
    expect(container.textContent).toContain('< 200ms');
    expect(container.textContent).toContain('Threshold');
    expect(container.textContent).toContain('< 500ms');
    expect(container.textContent).toContain('Unit');
    expect(container.textContent).toContain('ms');
  });

  it('renders metrics with only target present', () => {
    const { container } = render(
      <>{renderNFRDetails(makeProps('nfr', {
        metrics: { target: '99.9% uptime' },
      }))}</>
    );
    expect(container.textContent).toContain('99.9% uptime');
    expect(container.querySelectorAll('.detail-grid-item').length).toBe(1);
  });

  it('shows "No metrics defined" when metrics is empty object', () => {
    const { container } = render(
      <>{renderNFRDetails(makeProps('nfr', { metrics: {} }))}</>
    );
    expect(container.textContent).toContain('No metrics defined');
  });

  it('treats non-object metrics (array) as empty', () => {
    const { container } = render(
      <>{renderNFRDetails(makeProps('nfr', { metrics: ['bad', 'data'] }))}</>
    );
    expect(container.textContent).toContain('No metrics defined');
  });

  // ── Edit mode ──

  it('renders category select in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderNFRDetails({
        ...makeEditProps('nfr', { category: 'security' }),
        handleFieldChange,
      })}</>
    );
    const select = container.querySelector('select.status-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('security');
    fireEvent.change(select, { target: { value: 'reliability' } });
    expect(handleFieldChange).toHaveBeenCalledWith('category', 'reliability');
  });

  it('renders description textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderNFRDetails({
        ...makeEditProps('nfr', { description: 'Old NFR' }),
        handleFieldChange,
      })}</>
    );
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Old NFR');
    fireEvent.change(textarea, { target: { value: 'New NFR' } });
    expect(handleFieldChange).toHaveBeenCalledWith('description', 'New NFR');
  });

  it('renders metrics target/threshold/unit inputs in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderNFRDetails({
        ...makeEditProps('nfr', {
          metrics: { target: '200ms', threshold: '500ms', unit: 'ms' },
        }),
        handleFieldChange,
      })}</>
    );
    const inputs = container.querySelectorAll('.structured-form input[type="text"]');
    expect(inputs.length).toBe(3);
    // Change target
    fireEvent.change(inputs[0], { target: { value: '100ms' } });
    expect(handleFieldChange).toHaveBeenCalledWith('metrics', { target: '100ms', threshold: '500ms', unit: 'ms' });
    // Change threshold
    fireEvent.change(inputs[1], { target: { value: '300ms' } });
    expect(handleFieldChange).toHaveBeenCalledWith('metrics', { target: '200ms', threshold: '300ms', unit: 'ms' });
    // Change unit
    fireEvent.change(inputs[2], { target: { value: 'seconds' } });
    expect(handleFieldChange).toHaveBeenCalledWith('metrics', { target: '200ms', threshold: '500ms', unit: 'seconds' });
  });
});

// ==========================================================================
// renderAdditionalReqDetails deep tests
// ==========================================================================

describe('renderAdditionalReqDetails deep', () => {
  // ── View mode ──

  it('renders category as tag in view mode', () => {
    const { container } = render(
      <>{renderAdditionalReqDetails(makeProps('additional-req', { category: 'data-migration' }))}</>
    );
    expect(container.textContent).toContain('Category');
    expect(container.querySelector('.tag')?.textContent).toBe('data-migration');
  });

  it('shows "Not categorized" when category is absent', () => {
    const { container } = render(
      <>{renderAdditionalReqDetails(makeProps('additional-req', {}))}</>
    );
    expect(container.textContent).toContain('Not categorized');
  });

  it('renders description via Md', () => {
    const { container } = render(
      <>{renderAdditionalReqDetails(makeProps('additional-req', { description: 'Must support CSV import' }))}</>
    );
    expect(container.textContent).toContain('Must support CSV import');
  });

  it('shows "No description" when description is absent', () => {
    const { container } = render(
      <>{renderAdditionalReqDetails(makeProps('additional-req', {}))}</>
    );
    expect(container.textContent).toContain('No description');
  });

  // ── Edit mode ──

  it('renders category text input in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderAdditionalReqDetails({
        ...makeEditProps('additional-req', { category: 'old-cat' }),
        handleFieldChange,
      })}</>
    );
    const input = container.querySelector('input[placeholder="Requirement category"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('old-cat');
    fireEvent.change(input, { target: { value: 'new-cat' } });
    expect(handleFieldChange).toHaveBeenCalledWith('category', 'new-cat');
  });

  it('renders description textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderAdditionalReqDetails({
        ...makeEditProps('additional-req', { description: 'Old desc' }),
        handleFieldChange,
      })}</>
    );
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Old desc');
    fireEvent.change(textarea, { target: { value: 'New desc' } });
    expect(handleFieldChange).toHaveBeenCalledWith('description', 'New desc');
  });
});

// ==========================================================================
// renderArchitectureDecisionDetails deep tests
// ==========================================================================

describe('renderArchitectureDecisionDetails deep', () => {
  // ── View mode ──

  it('renders context via Md in view mode', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', {
        context: 'We need a message broker',
      }))}</>
    );
    expect(container.textContent).toContain('We need a message broker');
  });

  it('renders decision via Md', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', {
        decision: 'Use RabbitMQ for async messaging',
      }))}</>
    );
    expect(container.textContent).toContain('Use RabbitMQ for async messaging');
  });

  it('renders rationale via Md', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', {
        rationale: 'Well-supported, mature ecosystem',
      }))}</>
    );
    expect(container.textContent).toContain('Well-supported, mature ecosystem');
  });

  it('renders consequences as flat string list', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', {
        consequences: ['Better decoupling', 'Added complexity'],
      }))}</>
    );
    expect(container.textContent).toContain('Better decoupling');
    expect(container.textContent).toContain('Added complexity');
    const items = container.querySelectorAll('.criteria-list li');
    expect(items.length).toBe(2);
  });

  it('shows "No consequences listed" when consequences is empty', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', { consequences: [] }))}</>
    );
    expect(container.textContent).toContain('No consequences listed');
  });

  it('renders alternatives with option, pros, cons, rationale', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', {
        alternatives: [
          {
            option: 'Kafka',
            pros: ['High throughput'],
            cons: ['Complex setup'],
            rationale: 'Better for event streaming',
          },
          {
            option: 'SQS',
            pros: ['Managed service'],
            cons: ['AWS lock-in'],
          },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Kafka');
    expect(container.textContent).toContain('High throughput');
    expect(container.textContent).toContain('Complex setup');
    expect(container.textContent).toContain('Better for event streaming');
    expect(container.textContent).toContain('SQS');
    expect(container.textContent).toContain('Managed service');
    expect(container.textContent).toContain('AWS lock-in');
  });

  it('renders relatedDecisions as tags', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', {
        relatedDecisions: ['ADR-001', 'ADR-003'],
      }))}</>
    );
    expect(container.textContent).toContain('ADR-001');
    expect(container.textContent).toContain('ADR-003');
  });

  it('renders date field', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', {
        date: '2025-01-15',
      }))}</>
    );
    expect(container.textContent).toContain('2025-01-15');
  });

  it('renders deciders list', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', {
        deciders: ['Alice', 'Bob'],
      }))}</>
    );
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
  });

  it('renders description via Md', () => {
    const { container } = render(
      <>{renderArchitectureDecisionDetails(makeProps('architecture-decision', {
        description: 'Additional notes on the decision',
      }))}</>
    );
    expect(container.textContent).toContain('Additional notes on the decision');
  });

  // ── Edit mode ──

  it('renders context textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderArchitectureDecisionDetails({
        ...makeEditProps('architecture-decision', { context: 'Old context' }),
        handleFieldChange,
      })}</>
    );
    const textareas = container.querySelectorAll('textarea');
    // context is the first textarea
    const contextTextarea = Array.from(textareas).find(t => t.value === 'Old context');
    expect(contextTextarea).toBeTruthy();
    fireEvent.change(contextTextarea!, { target: { value: 'New context' } });
    expect(handleFieldChange).toHaveBeenCalledWith('context', 'New context');
  });

  it('renders decision textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderArchitectureDecisionDetails({
        ...makeEditProps('architecture-decision', { decision: 'Old decision' }),
        handleFieldChange,
      })}</>
    );
    const textareas = container.querySelectorAll('textarea');
    const decisionTextarea = Array.from(textareas).find(t => t.value === 'Old decision');
    expect(decisionTextarea).toBeTruthy();
    fireEvent.change(decisionTextarea!, { target: { value: 'New decision' } });
    expect(handleFieldChange).toHaveBeenCalledWith('decision', 'New decision');
  });

  it('renders rationale textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderArchitectureDecisionDetails({
        ...makeEditProps('architecture-decision', { rationale: 'Old rationale' }),
        handleFieldChange,
      })}</>
    );
    const textareas = container.querySelectorAll('textarea');
    const rationaleTextarea = Array.from(textareas).find(t => t.value === 'Old rationale');
    expect(rationaleTextarea).toBeTruthy();
    fireEvent.change(rationaleTextarea!, { target: { value: 'New rationale' } });
    expect(handleFieldChange).toHaveBeenCalledWith('rationale', 'New rationale');
  });
});

// ==========================================================================
// renderRiskDetails deep tests (additional sections)
// ==========================================================================

describe('renderRiskDetails deep', () => {
  // ── View mode ──

  it('renders riskStatus as status badge', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', { riskStatus: 'mitigating' }))}</>
    );
    const badge = container.querySelector('.status-badge.status-mitigating');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toBe('mitigating');
  });

  it('falls back to status field when riskStatus absent', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', { status: 'monitoring' }))}</>
    );
    // The renderer uses editedData.status as fallback
    expect(container.textContent).toContain('monitoring');
  });

  it('renders residualRisk as tag', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', { residualRisk: 'low' }))}</>
    );
    expect(container.textContent).toContain('Residual Risk');
    const tag = container.querySelector('.tag.risk-low');
    expect(tag).toBeInTheDocument();
    expect(tag?.textContent).toBe('low');
  });

  it('shows "Not assessed" when residualRisk absent', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {}))}</>
    );
    expect(container.textContent).toContain('Not assessed');
  });

  it('renders owner in view mode', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', { owner: 'Jane Doe' }))}</>
    );
    expect(container.textContent).toContain('Owner');
    expect(container.textContent).toContain('Jane Doe');
  });

  it('shows "Not assigned" when owner absent', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {}))}</>
    );
    expect(container.textContent).toContain('Not assigned');
  });

  it('renders impactDescription section when present', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        impactDescription: 'Could cause data loss in production',
      }))}</>
    );
    expect(container.textContent).toContain('Impact Description');
    expect(container.textContent).toContain('Could cause data loss in production');
  });

  it('does not render impactDescription section when absent in view mode', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {}))}</>
    );
    expect(container.textContent).not.toContain('Impact Description');
  });

  it('renders mitigationStrategies array in view mode', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        mitigationStrategies: [
          { strategy: 'Add redundancy', owner: 'DevOps', status: 'in-progress' },
          { strategy: 'Implement circuit breaker', status: 'planned' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Mitigation Strategies');
    expect(container.textContent).toContain('Add redundancy');
    expect(container.textContent).toContain('Owner: DevOps');
    expect(container.textContent).toContain('in-progress');
    expect(container.textContent).toContain('Implement circuit breaker');
    expect(container.textContent).toContain('planned');
  });

  it('renders contingencyPlan field in view mode', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        contingencyPlan: 'Switch to backup service',
      }))}</>
    );
    expect(container.textContent).toContain('Contingency Plan');
    expect(container.textContent).toContain('Switch to backup service');
  });

  it('falls back to contingency field when contingencyPlan absent', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        contingency: 'Rollback deployment',
      }))}</>
    );
    expect(container.textContent).toContain('Contingency Plan');
    expect(container.textContent).toContain('Rollback deployment');
  });

  it('shows "No contingency plan" when both contingency fields absent', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {}))}</>
    );
    expect(container.textContent).toContain('No contingency plan');
  });

  it('renders relatedRequirements as tags', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        relatedRequirements: ['REQ-001', 'REQ-005'],
      }))}</>
    );
    expect(container.textContent).toContain('Related Requirements');
    expect(container.textContent).toContain('REQ-001');
    expect(container.textContent).toContain('REQ-005');
  });

  it('does not render relatedRequirements section when empty in view mode', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', { relatedRequirements: [] }))}</>
    );
    expect(container.textContent).not.toContain('Related Requirements');
  });

  it('renders notes section when present', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {
        notes: 'Keep monitoring weekly',
      }))}</>
    );
    expect(container.textContent).toContain('Notes');
    expect(container.textContent).toContain('Keep monitoring weekly');
  });

  it('does not render notes section when absent in view mode', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {}))}</>
    );
    // Notes section should only appear when editMode or notes present
    // Count occurrences — "Notes" may appear in other contexts, check for section specifically
    const sections = container.querySelectorAll('button.collapsible-header');
    const noteSection = Array.from(sections).find(s => s.textContent?.includes('Notes'));
    expect(noteSection).toBeFalsy();
  });

  it('renders riskScore tag in view mode', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', { riskScore: 'critical' }))}</>
    );
    expect(container.textContent).toContain('Risk Score');
    const tag = container.querySelector('.tag.risk-critical');
    expect(tag).toBeInTheDocument();
    expect(tag?.textContent).toBe('critical');
  });

  it('shows "N/A" when riskScore absent', () => {
    const { container } = render(
      <>{renderRiskDetails(makeProps('risk', {}))}</>
    );
    expect(container.textContent).toContain('N/A');
  });

  // ── Edit mode ──

  it('renders riskStatus select in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderRiskDetails({
        ...makeEditProps('risk', { riskStatus: 'identified' }),
        handleFieldChange,
      })}</>
    );
    const selects = container.querySelectorAll('select.status-select');
    // Find the riskStatus select — its value should be 'identified'
    const statusSelect = Array.from(selects).find(s => (s as HTMLSelectElement).value === 'identified') as HTMLSelectElement;
    expect(statusSelect).toBeTruthy();
    fireEvent.change(statusSelect, { target: { value: 'mitigating' } });
    expect(handleFieldChange).toHaveBeenCalledWith('riskStatus', 'mitigating');
  });

  it('renders residualRisk select in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderRiskDetails({
        ...makeEditProps('risk', { residualRisk: 'medium' }),
        handleFieldChange,
      })}</>
    );
    const selects = container.querySelectorAll('select.status-select');
    const residualSelect = Array.from(selects).find(s => (s as HTMLSelectElement).value === 'medium') as HTMLSelectElement;
    expect(residualSelect).toBeTruthy();
    fireEvent.change(residualSelect, { target: { value: 'low' } });
    expect(handleFieldChange).toHaveBeenCalledWith('residualRisk', 'low');
  });

  it('renders owner input in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderRiskDetails({
        ...makeEditProps('risk', { owner: 'Bob' }),
        handleFieldChange,
      })}</>
    );
    const input = container.querySelector('input[placeholder="Risk owner"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Bob');
    fireEvent.change(input, { target: { value: 'Alice' } });
    expect(handleFieldChange).toHaveBeenCalledWith('owner', 'Alice');
  });

  it('renders impactDescription textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderRiskDetails({
        ...makeEditProps('risk', { impactDescription: 'Data loss' }),
        handleFieldChange,
      })}</>
    );
    const textareas = container.querySelectorAll('textarea');
    const impactTA = Array.from(textareas).find(t => t.value === 'Data loss');
    expect(impactTA).toBeTruthy();
    fireEvent.change(impactTA!, { target: { value: 'Service outage' } });
    expect(handleFieldChange).toHaveBeenCalledWith('impactDescription', 'Service outage');
  });

  it('renders mitigation strategies editable list in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderRiskDetails({
        ...makeEditProps('risk', {
          mitigationStrategies: [
            { strategy: 'Add monitoring', owner: 'DevOps', status: 'planned' },
          ],
        }),
        handleFieldChange,
      })}</>
    );
    // Strategy input
    const strategyInput = container.querySelector('input[placeholder="Strategy..."]') as HTMLInputElement;
    expect(strategyInput).toBeInTheDocument();
    expect(strategyInput.value).toBe('Add monitoring');
    // Owner input
    const ownerInput = container.querySelector('input[placeholder="Owner..."]') as HTMLInputElement;
    expect(ownerInput).toBeInTheDocument();
    expect(ownerInput.value).toBe('DevOps');
    // Add button
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Mitigation Strategy'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(handleFieldChange).toHaveBeenCalledWith('mitigationStrategies', [
      { strategy: 'Add monitoring', owner: 'DevOps', status: 'planned' },
      { strategy: '', owner: '', status: 'planned' },
    ]);
  });

  it('renders contingencyPlan textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderRiskDetails({
        ...makeEditProps('risk', { contingencyPlan: 'Switch to backup' }),
        handleFieldChange,
      })}</>
    );
    const textareas = container.querySelectorAll('textarea');
    const contingencyTA = Array.from(textareas).find(t => t.value === 'Switch to backup');
    expect(contingencyTA).toBeTruthy();
    fireEvent.change(contingencyTA!, { target: { value: 'Rollback' } });
    expect(handleFieldChange).toHaveBeenCalledWith('contingencyPlan', 'Rollback');
  });

  it('renders relatedRequirements editable list in edit mode', () => {
    const updateArrayItem = vi.fn();
    const removeFromArray = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderRiskDetails({
        ...makeEditProps('risk', { relatedRequirements: ['REQ-001'] }),
        updateArrayItem,
        removeFromArray,
        addToArray,
      })}</>
    );
    const input = container.querySelector('input[placeholder="Requirement ID..."]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('REQ-001');
    fireEvent.change(input, { target: { value: 'REQ-002' } });
    expect(updateArrayItem).toHaveBeenCalledWith('relatedRequirements', 0, 'REQ-002');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Requirement'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('relatedRequirements', '');
  });

  it('renders notes textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderRiskDetails({
        ...makeEditProps('risk', { notes: 'Old notes' }),
        handleFieldChange,
      })}</>
    );
    const textareas = container.querySelectorAll('textarea');
    const notesTA = Array.from(textareas).find(t => t.value === 'Old notes');
    expect(notesTA).toBeTruthy();
    fireEvent.change(notesTA!, { target: { value: 'New notes' } });
    expect(handleFieldChange).toHaveBeenCalledWith('notes', 'New notes');
  });
});

// ==========================================================================
// renderUseCaseDetails deep tests
// ==========================================================================

describe('renderUseCaseDetails deep', () => {
  // ── View mode ──

  it('renders secondary actors as person-badges in view mode', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        secondaryActors: ['Admin', 'Auditor'],
      }))}</>
    );
    expect(container.textContent).toContain('Secondary Actors');
    const badges = container.querySelectorAll('.person-badge');
    const texts = Array.from(badges).map(b => b.textContent);
    expect(texts).toContain('Admin');
    expect(texts).toContain('Auditor');
  });

  it('does not render secondary actors section when absent in view mode', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {}))}</>
    );
    expect(container.textContent).not.toContain('Secondary Actors');
  });

  it('renders summary via Md', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', { summary: 'User logs in with SSO' }))}</>
    );
    expect(container.textContent).toContain('User logs in with SSO');
  });

  it('falls back to description for summary', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', { description: 'Fallback desc' }))}</>
    );
    expect(container.textContent).toContain('Fallback desc');
  });

  it('shows "No summary defined" when both absent', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {}))}</>
    );
    expect(container.textContent).toContain('No summary defined');
  });

  it('renders trigger via Md', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', { trigger: 'User clicks login button' }))}</>
    );
    expect(container.textContent).toContain('User clicks login button');
  });

  it('shows "No trigger defined" when absent', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {}))}</>
    );
    expect(container.textContent).toContain('No trigger defined');
  });

  it('renders main flow as ordered list', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        mainFlow: [
          { action: 'Open login page', actor: 'User' },
          { action: 'Enter credentials' },
          'Submit form',
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Main Flow');
    const items = container.querySelectorAll('.main-flow-list li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Open login page');
    expect(items[0].textContent).toContain('(User)');
    expect(items[1].textContent).toContain('Enter credentials');
    expect(items[2].textContent).toContain('Submit form');
  });

  it('shows "No main flow defined" when empty', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', { mainFlow: [] }))}</>
    );
    expect(container.textContent).toContain('No main flow defined');
  });

  it('renders preconditions as list', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        preconditions: ['User is registered', 'System is online'],
      }))}</>
    );
    expect(container.textContent).toContain('Preconditions');
    expect(container.textContent).toContain('User is registered');
    expect(container.textContent).toContain('System is online');
  });

  it('shows "No preconditions defined" when empty', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', { preconditions: [] }))}</>
    );
    expect(container.textContent).toContain('No preconditions defined');
  });

  it('renders postconditions as list', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        postconditions: ['User session created', 'Audit log updated'],
      }))}</>
    );
    expect(container.textContent).toContain('Postconditions');
    expect(container.textContent).toContain('User session created');
    expect(container.textContent).toContain('Audit log updated');
  });

  it('renders scenario with all fields', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        scenario: {
          context: 'During business hours',
          before: 'User is unauthenticated',
          after: 'User is authenticated',
          impact: 'Enables access to protected resources',
        },
      }))}</>
    );
    expect(container.textContent).toContain('Context:');
    expect(container.textContent).toContain('During business hours');
    expect(container.textContent).toContain('Before:');
    expect(container.textContent).toContain('User is unauthenticated');
    expect(container.textContent).toContain('After:');
    expect(container.textContent).toContain('User is authenticated');
    expect(container.textContent).toContain('Impact:');
    expect(container.textContent).toContain('Enables access to protected resources');
  });

  it('shows "Not specified" for empty scenario fields', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', { scenario: {} }))}</>
    );
    const emptyValues = container.querySelectorAll('.empty-value');
    expect(emptyValues.length).toBe(4); // context, before, after, impact
  });

  it('renders alternative flows with name, branchPoint, steps', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        alternativeFlows: [
          { name: 'Password Reset', branchPoint: 'after step 2', steps: ['Click forgot password', 'Enter email'] },
          { id: 'AF-2' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Alternative Flows');
    expect(container.textContent).toContain('Password Reset');
    expect(container.textContent).toContain('(branches at: after step 2)');
    expect(container.textContent).toContain('Click forgot password');
    expect(container.textContent).toContain('Enter email');
    expect(container.textContent).toContain('AF-2');
  });

  it('normalizes string alternativeFlows to objects', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        alternativeFlows: ['Simple string flow'],
      }))}</>
    );
    expect(container.textContent).toContain('Simple string flow');
  });

  it('shows "No alternative flows defined" when empty', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', { alternativeFlows: [] }))}</>
    );
    expect(container.textContent).toContain('No alternative flows defined');
  });

  it('renders exception flows with name, trigger, handling', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        exceptionFlows: [
          { name: 'Invalid credentials', trigger: 'Wrong password', handling: 'Show error message' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Exception Flows');
    expect(container.textContent).toContain('Invalid credentials');
    expect(container.textContent).toContain('Trigger: Wrong password');
    expect(container.textContent).toContain('Show error message');
  });

  it('does not render exception flows section when empty in view mode', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', { exceptionFlows: [] }))}</>
    );
    expect(container.textContent).not.toContain('Exception Flows');
  });

  it('renders business rules as list', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        businessRules: ['Max 3 login attempts', 'Password expires every 90 days'],
      }))}</>
    );
    expect(container.textContent).toContain('Business Rules');
    expect(container.textContent).toContain('Max 3 login attempts');
    expect(container.textContent).toContain('Password expires every 90 days');
  });

  it('shows "No business rules defined" when empty', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', { businessRules: [] }))}</>
    );
    expect(container.textContent).toContain('No business rules defined');
  });

  it('renders notes via Md', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', { notes: 'Consider MFA integration' }))}</>
    );
    expect(container.textContent).toContain('Consider MFA integration');
  });

  it('shows "No notes defined" when absent', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {}))}</>
    );
    expect(container.textContent).toContain('No notes defined');
  });

  it('renders related links (epic, requirements, stories) in view mode', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {
        relatedEpic: 'EPIC-001',
        relatedRequirements: ['REQ-001', 'REQ-002'],
        relatedStories: ['STORY-001'],
      }))}</>
    );
    expect(container.textContent).toContain('Related Links');
    expect(container.textContent).toContain('EPIC-001');
    expect(container.textContent).toContain('REQ-001');
    expect(container.textContent).toContain('REQ-002');
    expect(container.textContent).toContain('STORY-001');
  });

  it('does not render related links section when all empty in view mode', () => {
    const { container } = render(
      <>{renderUseCaseDetails(makeProps('use-case', {}))}</>
    );
    expect(container.textContent).not.toContain('Related Links');
  });

  // ── Edit mode ──

  it('renders secondary actors editable list in edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderUseCaseDetails({
        ...makeEditProps('use-case', { secondaryActors: ['Admin'] }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const input = container.querySelector('input[placeholder="Actor name or role"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Admin');
    fireEvent.change(input, { target: { value: 'Moderator' } });
    expect(updateArrayItem).toHaveBeenCalledWith('secondaryActors', 0, 'Moderator');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Actor'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('secondaryActors', '');
  });

  it('renders trigger input in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderUseCaseDetails({
        ...makeEditProps('use-case', { trigger: 'Old trigger' }),
        handleFieldChange,
      })}</>
    );
    const input = container.querySelector('input[placeholder="What initiates this use case?"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Old trigger');
    fireEvent.change(input, { target: { value: 'New trigger' } });
    expect(handleFieldChange).toHaveBeenCalledWith('trigger', 'New trigger');
  });

  it('renders scenario edit fields (context, before, after, impact)', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderUseCaseDetails({
        ...makeEditProps('use-case', {
          scenario: { context: 'Ctx', before: 'Bef', after: 'Aft', impact: 'Imp' },
        }),
        handleFieldChange,
      })}</>
    );
    const contextInput = container.querySelector('input[placeholder="When/where does this occur?"]') as HTMLInputElement;
    expect(contextInput.value).toBe('Ctx');
    fireEvent.change(contextInput, { target: { value: 'New Ctx' } });
    expect(handleFieldChange).toHaveBeenCalledWith('scenario', { context: 'New Ctx', before: 'Bef', after: 'Aft', impact: 'Imp' });

    const beforeInput = container.querySelector('input[placeholder="Current state"]') as HTMLInputElement;
    expect(beforeInput.value).toBe('Bef');

    const afterInput = container.querySelector('input[placeholder="Desired outcome"]') as HTMLInputElement;
    expect(afterInput.value).toBe('Aft');

    const impactInput = container.querySelector('input[placeholder="Business value"]') as HTMLInputElement;
    expect(impactInput.value).toBe('Imp');
  });

  it('renders main flow editable list in edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderUseCaseDetails({
        ...makeEditProps('use-case', {
          mainFlow: [{ action: 'Step one', step: 1 }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const stepInput = container.querySelector('input[placeholder="Action step..."]') as HTMLInputElement;
    expect(stepInput).toBeInTheDocument();
    expect(stepInput.value).toBe('Step one');
    fireEvent.change(stepInput, { target: { value: 'Updated step' } });
    expect(updateArrayItem).toHaveBeenCalledWith('mainFlow', 0, { step: 1, action: 'Updated step' });

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Step'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('mainFlow', { step: 2, action: '' });
  });

  it('renders notes textarea in edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderUseCaseDetails({
        ...makeEditProps('use-case', { notes: 'Old notes' }),
        handleFieldChange,
      })}</>
    );
    const textareas = container.querySelectorAll('textarea');
    const notesTA = Array.from(textareas).find(t => t.value === 'Old notes');
    expect(notesTA).toBeTruthy();
    fireEvent.change(notesTA!, { target: { value: 'New notes' } });
    expect(handleFieldChange).toHaveBeenCalledWith('notes', 'New notes');
  });
});

// =====================================================================
// renderPRDDetails — deep tests
// =====================================================================
describe('renderPRDDetails deep', () => {
  // --- Product Overview ---
  it('renders product overview with all fields', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        productOverview: {
          productName: 'MyApp',
          version: '2.0',
          purpose: 'Simplify workflows',
          productVision: 'Best tool ever',
          targetAudience: 'Developers',
          problemStatement: 'Too complex',
          proposedSolution: 'A unified platform',
          valueProposition: 'Save time',
          keyBenefits: ['Fast', 'Reliable', 'Scalable'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('MyApp');
    expect(container.textContent).toContain('2.0');
    expect(container.textContent).toContain('Simplify workflows');
    expect(container.textContent).toContain('Best tool ever');
    expect(container.textContent).toContain('Developers');
    expect(container.textContent).toContain('Too complex');
    expect(container.textContent).toContain('A unified platform');
    expect(container.textContent).toContain('Save time');
    expect(container.textContent).toContain('Fast');
    expect(container.textContent).toContain('Reliable');
    expect(container.textContent).toContain('Scalable');
    const lis = container.querySelectorAll('li');
    const benefitTexts = Array.from(lis).map(l => l.textContent);
    expect(benefitTexts).toContain('Fast');
    expect(benefitTexts).toContain('Scalable');
  });

  it('renders Not specified for missing productName', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { productOverview: {} }))}</>
    );
    expect(container.textContent).toContain('Not specified');
  });

  // --- Project Type ---
  it('renders project type with type, complexity, and characteristics', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        projectType: {
          type: 'greenfield',
          complexity: 'high',
          domainComplexity: 'Medium',
          technicalComplexity: 'High',
          integrationComplexity: 'Low',
          characteristics: ['Microservices', 'Cloud-native'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('greenfield');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('Domain Complexity');
    expect(container.textContent).toContain('Technical Complexity');
    expect(container.textContent).toContain('Integration Complexity');
    expect(container.textContent).toContain('Microservices');
    expect(container.textContent).toContain('Cloud-native');
  });

  it('does not render project type section when empty and not editing', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { projectType: {} }))}</>
    );
    expect(container.textContent).not.toContain('Project Type');
  });

  // --- User Personas ---
  it('renders user personas with all detail fields', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        userPersonas: [{
          name: 'Alice',
          id: 'P-1',
          role: 'Product Manager',
          description: 'Manages products',
          technicalProficiency: 'medium',
          frequency: 'Daily',
          goals: ['Ship fast', { goal: 'Quality' }],
          painPoints: ['Slow builds', 'Poor docs'],
          behaviors: ['Uses CLI', 'Prefers dark mode'],
          primaryTasks: ['Review PRs', 'Write specs'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('(P-1)');
    expect(container.textContent).toContain('Product Manager');
    expect(container.textContent).toContain('medium');
    expect(container.textContent).toContain('Daily');
    expect(container.textContent).toContain('Ship fast');
    expect(container.textContent).toContain('Quality');
    expect(container.textContent).toContain('Slow builds, Poor docs');
    expect(container.textContent).toContain('Uses CLI, Prefers dark mode');
    expect(container.textContent).toContain('Review PRs, Write specs');
  });

  it('renders empty personas message', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { userPersonas: [] }))}</>
    );
    expect(container.textContent).toContain('No personas defined');
  });

  // --- Success Criteria ---
  it('renders success criteria with all fields', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        successCriteria: [{
          id: 'SC-1',
          criterion: 'Response time < 200ms',
          category: 'Performance',
          metric: 'p95 latency',
          target: '200ms',
          baseline: '500ms',
          measurement: 'APM dashboard',
          timeframe: 'Q1 2026',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('SC-1');
    expect(container.textContent).toContain('Response time < 200ms');
    expect(container.textContent).toContain('Performance');
    expect(container.textContent).toContain('p95 latency');
    expect(container.textContent).toContain('200ms');
    expect(container.textContent).toContain('500ms');
    expect(container.textContent).toContain('APM dashboard');
    expect(container.textContent).toContain('Q1 2026');
  });

  it('renders empty success criteria message', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { successCriteria: [] }))}</>
    );
    expect(container.textContent).toContain('No success criteria defined');
  });

  // --- User Journeys ---
  it('renders user journeys with steps and all step details', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        userJourneys: [{
          name: 'Onboarding',
          id: 'UJ-1',
          persona: 'Alice',
          goal: 'Complete setup',
          preconditions: ['Account created', 'Email verified'],
          steps: [{
            action: 'Click Start',
            systemResponse: 'Shows wizard',
            outcome: 'Wizard loaded',
            errorHandling: 'Retry button',
            alternativeFlows: ['Skip wizard', 'Import config'],
          }],
          successCriteria: '90% completion rate',
          postconditions: ['Profile complete', 'Dashboard visible'],
          notes: 'Critical flow',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Onboarding');
    expect(container.textContent).toContain('(UJ-1)');
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Complete setup');
    expect(container.textContent).toContain('Account created; Email verified');
    expect(container.textContent).toContain('Click Start');
    expect(container.textContent).toContain('System: Shows wizard');
    expect(container.textContent).toContain('Outcome: Wizard loaded');
    expect(container.textContent).toContain('Error handling: Retry button');
    expect(container.textContent).toContain('Alternatives: Skip wizard; Import config');
    expect(container.textContent).toContain('90% completion rate');
    expect(container.textContent).toContain('Profile complete; Dashboard visible');
    expect(container.textContent).toContain('Critical flow');
  });

  it('does not render user journeys section when empty and not editing', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { userJourneys: [] }))}</>
    );
    expect(container.textContent).not.toContain('User Journeys');
  });

  // --- Domain Model ---
  it('renders domain model with overview, core concepts, and glossary', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        domainModel: {
          overview: 'System domain overview',
          coreConcepts: [{
            name: 'User',
            description: 'A system user',
            attributes: [
              { name: 'email', type: 'string', required: true, description: 'Primary email' },
            ],
            relationships: [
              { target: 'Order', type: 'has-many', cardinality: '1:N', description: 'Places orders' },
            ],
            businessRules: ['Must have unique email'],
          }],
          glossary: [{
            term: 'API',
            definition: 'Application Programming Interface',
            synonyms: ['Endpoint', 'Service'],
            relatedTerms: ['REST', 'GraphQL'],
          }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('System domain overview');
    expect(container.textContent).toContain('Core Concepts (1)');
    expect(container.textContent).toContain('User');
    expect(container.textContent).toContain('A system user');
    expect(container.textContent).toContain('email');
    expect(container.textContent).toContain('string');
    expect(container.textContent).toContain('(required)');
    expect(container.textContent).toContain('Primary email');
    expect(container.textContent).toContain('Order');
    expect(container.textContent).toContain('has-many');
    expect(container.textContent).toContain('1:N');
    expect(container.textContent).toContain('Places orders');
    expect(container.textContent).toContain('Must have unique email');
    expect(container.textContent).toContain('Glossary (1)');
    expect(container.textContent).toContain('API');
    expect(container.textContent).toContain('Application Programming Interface');
    expect(container.textContent).toContain('Synonyms: Endpoint, Service');
    expect(container.textContent).toContain('Related: REST, GraphQL');
  });

  it('does not render domain model when empty and not editing', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { domainModel: {} }))}</>
    );
    expect(container.textContent).not.toContain('Domain Model');
  });

  // --- Requirements ---
  it('renders functional requirements with all fields', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        requirements: {
          functional: [{
            id: 'FR-1',
            title: 'User Login',
            priority: 'critical',
            capabilityArea: 'Auth',
            description: 'Users can log in',
            rationale: 'Security',
            source: 'Stakeholder',
            acceptanceCriteria: ['Must accept OAuth', 'Must support 2FA'],
            dependencies: ['FR-2', 'FR-3'],
          }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Functional Requirements (1)');
    expect(container.textContent).toContain('FR-1');
    expect(container.textContent).toContain('User Login');
    expect(container.textContent).toContain('critical');
    expect(container.textContent).toContain('Auth');
    expect(container.textContent).toContain('Users can log in');
    expect(container.textContent).toContain('Security');
    expect(container.textContent).toContain('Stakeholder');
    expect(container.textContent).toContain('Must accept OAuth');
    expect(container.textContent).toContain('Must support 2FA');
    expect(container.textContent).toContain('FR-2, FR-3');
  });

  it('renders non-functional requirements with metrics', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        requirements: {
          nonFunctional: [{
            id: 'NFR-1',
            title: 'Latency',
            priority: 'high',
            category: 'Performance',
            description: 'Low latency',
            metrics: { target: '100ms', threshold: '200ms', unit: 'ms' },
            measurementMethod: 'APM',
            testStrategy: 'Load test',
          }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Non-Functional Requirements (1)');
    expect(container.textContent).toContain('NFR-1');
    expect(container.textContent).toContain('Latency');
    expect(container.textContent).toContain('Performance');
    expect(container.textContent).toContain('Target: 100ms');
    expect(container.textContent).toContain('Threshold: 200ms');
    expect(container.textContent).toContain('(ms)');
    expect(container.textContent).toContain('APM');
    expect(container.textContent).toContain('Load test');
  });

  it('renders technical requirements with rationale and impact', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        requirements: {
          technical: [{
            id: 'TR-1',
            title: 'Node.js 20',
            category: 'Runtime',
            description: 'Must use Node 20+',
            rationale: 'LTS support',
            impact: 'All services',
          }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Technical Requirements (1)');
    expect(container.textContent).toContain('TR-1');
    expect(container.textContent).toContain('Node.js 20');
    expect(container.textContent).toContain('Runtime');
    expect(container.textContent).toContain('Must use Node 20+');
    expect(container.textContent).toContain('LTS support');
    expect(container.textContent).toContain('All services');
  });

  it('does not render requirements section when empty and not editing', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { requirements: {} }))}</>
    );
    expect(container.textContent).not.toContain('Requirements');
  });

  // --- Scope ---
  it('renders scope with inScope, outOfScope, assumptions as strings', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        scope: {
          inScope: ['Feature A', 'Feature B'],
          outOfScope: ['Feature C'],
          assumptions: ['Users have internet'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('In Scope (2)');
    expect(container.textContent).toContain('Feature A');
    expect(container.textContent).toContain('Feature B');
    expect(container.textContent).toContain('Out of Scope (1)');
    expect(container.textContent).toContain('Feature C');
    expect(container.textContent).toContain('Assumptions (1)');
    expect(container.textContent).toContain('Users have internet');
  });

  it('renders scope items as objects with extra fields', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        scope: {
          inScope: [{ item: 'Core API', priority: 'high', description: 'REST endpoints' }],
          outOfScope: [{ item: 'Mobile app', futureConsideration: true, rationale: 'Not yet' }],
          assumptions: [{ assumption: 'DB available', validated: true, impact: 'Critical', validationMethod: 'Ping test' }],
          dependencies: [{ dependency: 'Auth service', type: 'external', status: 'active', owner: 'Team B', risk: 'medium' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Core API');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('REST endpoints');
    expect(container.textContent).toContain('Mobile app');
    expect(container.textContent).toContain('future consideration');
    expect(container.textContent).toContain('Not yet');
    expect(container.textContent).toContain('DB available');
    expect(container.textContent).toContain('validated');
    expect(container.textContent).toContain('Critical');
    expect(container.textContent).toContain('Ping test');
    expect(container.textContent).toContain('Dependencies (1)');
    expect(container.textContent).toContain('Auth service');
    expect(container.textContent).toContain('external');
    expect(container.textContent).toContain('active');
    expect(container.textContent).toContain('Team B');
    expect(container.textContent).toContain('medium');
  });

  it('does not render scope section when empty and not editing', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { scope: {} }))}</>
    );
    expect(container.textContent).not.toContain('Scope');
  });

  // --- Constraints ---
  it('renders constraints with all fields', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        constraints: [{
          id: 'C-1',
          type: 'technical',
          flexibility: 'fixed',
          description: 'Must use PostgreSQL',
          impact: 'Database layer',
          mitigation: 'Use ORM',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('C-1');
    expect(container.textContent).toContain('technical');
    expect(container.textContent).toContain('fixed');
    expect(container.textContent).toContain('Must use PostgreSQL');
    expect(container.textContent).toContain('Database layer');
    expect(container.textContent).toContain('Use ORM');
  });

  it('renders empty constraints message', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { constraints: [] }))}</>
    );
    expect(container.textContent).toContain('No constraints defined');
  });

  // --- Risks (PRD inline) ---
  it('renders PRD risks with all fields', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        risks: [{
          id: 'R-1',
          risk: 'Vendor lock-in',
          category: 'Technical',
          status: 'open',
          probability: 'medium',
          impact: 'high',
          riskScore: 12,
          mitigation: 'Abstraction layer',
          contingency: 'Switch vendor',
          owner: 'CTO',
          triggers: ['Price increase', 'API deprecation'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('R-1');
    expect(container.textContent).toContain('Vendor lock-in');
    expect(container.textContent).toContain('Technical');
    expect(container.textContent).toContain('open');
    expect(container.textContent).toContain('Probability:');
    expect(container.textContent).toContain('Impact:');
    expect(container.textContent).toContain('Score:');
    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('Abstraction layer');
    expect(container.textContent).toContain('Switch vendor');
    expect(container.textContent).toContain('CTO');
    expect(container.textContent).toContain('Price increase; API deprecation');
  });

  it('renders empty risks message', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { risks: [] }))}</>
    );
    expect(container.textContent).toContain('No risks defined');
  });

  // --- Timeline ---
  it('renders timeline with phases, milestones, and deliverables', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        timeline: {
          overview: 'Q1-Q2 delivery',
          phases: [{
            name: 'Alpha',
            description: 'Initial build',
            startDate: '2026-01-01',
            endDate: '2026-03-01',
            deliverables: ['MVP', 'Docs'],
            milestones: [
              { name: 'Beta release', date: '2026-02-15', deliverables: ['Beta build', 'Test report'] },
            ],
          }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Q1-Q2 delivery');
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Initial build');
    expect(container.textContent).toContain('2026-01-01');
    expect(container.textContent).toContain('2026-03-01');
    expect(container.textContent).toContain('MVP, Docs');
    expect(container.textContent).toContain('Beta release');
    expect(container.textContent).toContain('(2026-02-15)');
    expect(container.textContent).toContain('Beta build, Test report');
  });

  it('does not render timeline section when empty and not editing', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { timeline: {} }))}</>
    );
    expect(container.textContent).not.toContain('Timeline');
  });

  // --- Appendices ---
  it('renders appendices with content and references', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        appendices: [{
          id: 'A',
          title: 'Glossary',
          content: 'List of terms',
          references: ['RFC 1234', 'ISO 9001'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('Glossary');
    expect(container.textContent).toContain('List of terms');
    expect(container.textContent).toContain('RFC 1234, ISO 9001');
  });

  it('does not render appendices section when empty and not editing', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { appendices: [] }))}</>
    );
    expect(container.textContent).not.toContain('Appendices');
  });

  // --- Approvals ---
  it('renders approvals with all fields', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', {
        approvals: [{
          role: 'VP Engineering',
          name: 'Jane',
          status: 'approved',
          date: '2026-01-10',
          comments: 'Looks good',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('VP Engineering');
    expect(container.textContent).toContain('Jane');
    expect(container.textContent).toContain('approved');
    expect(container.textContent).toContain('(2026-01-10)');
    expect(container.textContent).toContain('Looks good');
  });

  it('does not render approvals section when empty and not editing', () => {
    const { container } = render(
      <>{renderPRDDetails(makeProps('prd', { approvals: [] }))}</>
    );
    expect(container.textContent).not.toContain('Approvals');
  });

  // --- Edit Mode Tests ---
  it('renders product overview edit inputs', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          productOverview: { productName: 'TestApp', version: '1.0', keyBenefits: ['Speed', 'Safety'] },
        }),
        handleFieldChange,
      })}</>
    );
    const nameInput = container.querySelector('input[placeholder="Product name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('TestApp');
    fireEvent.change(nameInput, { target: { value: 'NewApp' } });
    expect(handleFieldChange).toHaveBeenCalledWith('productOverview', expect.objectContaining({ productName: 'NewApp' }));

    const versionInput = container.querySelector('input[placeholder="PRD version"]') as HTMLInputElement;
    expect(versionInput.value).toBe('1.0');

    // Key benefits textarea — comma-separated
    const benefitsTA = container.querySelector('textarea[placeholder="Benefit 1, Benefit 2, ..."]') as HTMLTextAreaElement;
    expect(benefitsTA.value).toBe('Speed, Safety');
    fireEvent.change(benefitsTA, { target: { value: 'A, B, C' } });
    expect(handleFieldChange).toHaveBeenCalledWith('productOverview', expect.objectContaining({ keyBenefits: ['A', 'B', 'C'] }));
  });

  it('renders constraints edit with selects and textareas', () => {
    const updateArrayItem = vi.fn();
    const removeFromArray = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          constraints: [{ type: 'technical', flexibility: 'fixed', description: 'DB constraint', impact: 'Major', mitigation: 'ORM' }],
        }),
        updateArrayItem,
        removeFromArray,
        addToArray,
      })}</>
    );
    const selects = container.querySelectorAll('select');
    // Find the type select (value='technical')
    const typeSelect = Array.from(selects).find(s => (s as HTMLSelectElement).value === 'technical') as HTMLSelectElement;
    expect(typeSelect).toBeTruthy();
    fireEvent.change(typeSelect, { target: { value: 'business' } });
    expect(updateArrayItem).toHaveBeenCalledWith('constraints', 0, expect.objectContaining({ type: 'business' }));

    const descTA = container.querySelector('textarea[placeholder="Constraint description..."]') as HTMLTextAreaElement;
    expect(descTA.value).toBe('DB constraint');

    const impactInput = container.querySelector('input[placeholder="Impact on project..."]') as HTMLInputElement;
    expect(impactInput.value).toBe('Major');

    // Add button
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Constraint'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('constraints', { type: '', description: '', flexibility: '' });
  });

  it('renders risks edit with selects and inputs', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          risks: [{ risk: 'Data loss', probability: 'high', impact: 'critical', category: 'Technical', mitigation: 'Backups', contingency: 'Restore' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const riskInput = container.querySelector('input[placeholder="Risk description"]') as HTMLInputElement;
    expect(riskInput.value).toBe('Data loss');
    fireEvent.change(riskInput, { target: { value: 'Updated risk' } });
    expect(updateArrayItem).toHaveBeenCalledWith('risks', 0, expect.objectContaining({ risk: 'Updated risk' }));

    const mitigationInput = container.querySelector('input[placeholder="Mitigation strategy..."]') as HTMLInputElement;
    expect(mitigationInput.value).toBe('Backups');

    const contingencyInput = container.querySelector('input[placeholder="Contingency plan..."]') as HTMLInputElement;
    expect(contingencyInput.value).toBe('Restore');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Risk'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('risks', { risk: '', probability: '', impact: '', mitigation: '' });
  });

  it('renders user personas edit mode', () => {
    const updateArrayItem = vi.fn();
    const removeFromArray = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          userPersonas: [{ name: 'Bob', role: 'Dev', description: 'A dev', technicalProficiency: 'high', goals: ['Ship'], painPoints: ['Bugs'] }],
        }),
        updateArrayItem,
        removeFromArray,
        addToArray,
      })}</>
    );
    const nameInput = container.querySelector('input[placeholder="Persona name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Bob');
    fireEvent.change(nameInput, { target: { value: 'Robert' } });
    expect(updateArrayItem).toHaveBeenCalledWith('userPersonas', 0, expect.objectContaining({ name: 'Robert' }));

    const roleInput = container.querySelector('input[placeholder="Role (e.g., Product Manager)"]') as HTMLInputElement;
    expect(roleInput.value).toBe('Dev');

    const goalsInput = container.querySelector('input[placeholder="Goals (comma-separated)"]') as HTMLInputElement;
    expect(goalsInput.value).toBe('Ship');

    const painPointsInput = container.querySelector('input[placeholder="Pain points (comma-separated)"]') as HTMLInputElement;
    expect(painPointsInput.value).toBe('Bugs');

    // Remove button
    const removeBtn = container.querySelector('.remove-btn');
    expect(removeBtn).toBeTruthy();
    fireEvent.click(removeBtn!);
    expect(removeFromArray).toHaveBeenCalledWith('userPersonas', 0);

    // Add button
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Persona'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('userPersonas', { name: '', role: '', description: '' });
  });

  it('renders success criteria edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          successCriteria: [{ criterion: 'Fast load', metric: 'LCP', target: '2s', category: 'Perf' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const criterionInput = container.querySelector('input[placeholder="Success criterion"]') as HTMLInputElement;
    expect(criterionInput.value).toBe('Fast load');
    fireEvent.change(criterionInput, { target: { value: 'Ultra fast' } });
    expect(updateArrayItem).toHaveBeenCalledWith('successCriteria', 0, expect.objectContaining({ criterion: 'Ultra fast' }));

    const metricInput = container.querySelector('input[placeholder="Metric"]') as HTMLInputElement;
    expect(metricInput.value).toBe('LCP');

    const targetInput = container.querySelector('input[placeholder="Target"]') as HTMLInputElement;
    expect(targetInput.value).toBe('2s');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Criterion'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('successCriteria', { criterion: '', metric: '', target: '' });
  });

  it('renders user journeys edit mode', () => {
    const updateArrayItem = vi.fn();
    const removeFromArray = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          userJourneys: [{ name: 'Signup', persona: 'User', goal: 'Register', successCriteria: 'Account exists', notes: 'Easy flow' }],
        }),
        updateArrayItem,
        removeFromArray,
        addToArray,
      })}</>
    );
    const nameInput = container.querySelector('input[placeholder="Journey name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Signup');
    fireEvent.change(nameInput, { target: { value: 'Registration' } });
    expect(updateArrayItem).toHaveBeenCalledWith('userJourneys', 0, expect.objectContaining({ name: 'Registration' }));

    const personaInput = container.querySelector('input[placeholder="Persona"]') as HTMLInputElement;
    expect(personaInput.value).toBe('User');

    const goalInput = container.querySelector('input[placeholder="Goal"]') as HTMLInputElement;
    expect(goalInput.value).toBe('Register');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Journey'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('userJourneys', { name: '', persona: '', goal: '' });
  });

  it('renders domain model edit mode with glossary', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          domainModel: {
            overview: 'Domain overview text',
            glossary: [{ term: 'API', definition: 'Interface' }],
            coreConcepts: [{ name: 'Entity', description: 'A thing' }],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const overviewTA = container.querySelector('textarea[placeholder="Domain model overview..."]') as HTMLTextAreaElement;
    expect(overviewTA.value).toBe('Domain overview text');
    fireEvent.change(overviewTA, { target: { value: 'Updated overview' } });
    expect(handleFieldChange).toHaveBeenCalledWith('domainModel', expect.objectContaining({ overview: 'Updated overview' }));

    const termInput = container.querySelector('input[placeholder="Term"]') as HTMLInputElement;
    expect(termInput.value).toBe('API');

    // Core concepts shown as read-only
    expect(container.textContent).toContain('Core Concepts (1)');
    expect(container.textContent).toContain('Core concepts are read-only');
    expect(container.textContent).toContain('Entity');
  });

  it('renders approvals edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          approvals: [{ role: 'CTO', name: 'Jane', status: 'pending', date: '2026-01-01', comments: 'Review needed' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const roleInput = container.querySelector('input[placeholder="Role"]') as HTMLInputElement;
    expect(roleInput.value).toBe('CTO');
    fireEvent.change(roleInput, { target: { value: 'VP' } });
    expect(updateArrayItem).toHaveBeenCalledWith('approvals', 0, expect.objectContaining({ role: 'VP' }));

    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Jane');

    const dateInput = container.querySelector('input[placeholder="Date"]') as HTMLInputElement;
    expect(dateInput.value).toBe('2026-01-01');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Approval'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('approvals', { role: '', name: '', status: '' });
  });

  it('renders appendices edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          appendices: [{ title: 'Ref', id: 'A', content: 'Some content' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const titleInput = container.querySelector('input[placeholder="Appendix title"]') as HTMLInputElement;
    expect(titleInput.value).toBe('Ref');
    fireEvent.change(titleInput, { target: { value: 'References' } });
    expect(updateArrayItem).toHaveBeenCalledWith('appendices', 0, expect.objectContaining({ title: 'References' }));

    const idInput = container.querySelector('input[placeholder="ID (e.g., A, B)"]') as HTMLInputElement;
    expect(idInput.value).toBe('A');

    const contentTA = container.querySelector('textarea[placeholder="Content..."]') as HTMLTextAreaElement;
    expect(contentTA.value).toBe('Some content');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Appendix'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('appendices', { title: '', content: '' });
  });

  it('renders timeline edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          timeline: {
            overview: 'Six month plan',
            phases: [{ name: 'Phase 1', startDate: '2026-01', endDate: '2026-03', description: 'Build core' }],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const overviewTA = container.querySelector('textarea[placeholder="Timeline overview..."]') as HTMLTextAreaElement;
    expect(overviewTA.value).toBe('Six month plan');
    fireEvent.change(overviewTA, { target: { value: 'Updated plan' } });
    expect(handleFieldChange).toHaveBeenCalledWith('timeline', expect.objectContaining({ overview: 'Updated plan' }));

    const phaseNameInput = container.querySelector('input[placeholder="Phase name"]') as HTMLInputElement;
    expect(phaseNameInput.value).toBe('Phase 1');

    const startInput = container.querySelector('input[placeholder="Start date"]') as HTMLInputElement;
    expect(startInput.value).toBe('2026-01');

    const endInput = container.querySelector('input[placeholder="End date"]') as HTMLInputElement;
    expect(endInput.value).toBe('2026-03');
  });

  it('renders project type edit mode with selects', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          projectType: { type: 'greenfield', complexity: 'high' },
        }),
        handleFieldChange,
      })}</>
    );
    const selects = container.querySelectorAll('select');
    const typeSelect = Array.from(selects).find(s => (s as HTMLSelectElement).value === 'greenfield') as HTMLSelectElement;
    expect(typeSelect).toBeTruthy();
    fireEvent.change(typeSelect, { target: { value: 'migration' } });
    expect(handleFieldChange).toHaveBeenCalledWith('projectType', expect.objectContaining({ type: 'migration' }));

    const complexitySelect = Array.from(selects).find(s => (s as HTMLSelectElement).value === 'high') as HTMLSelectElement;
    expect(complexitySelect).toBeTruthy();
    fireEvent.change(complexitySelect, { target: { value: 'low' } });
    expect(handleFieldChange).toHaveBeenCalledWith('projectType', expect.objectContaining({ complexity: 'low' }));
  });

  it('renders scope edit mode with editable lists', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          scope: {
            inScope: ['Item A'],
            outOfScope: ['Item B'],
            assumptions: ['Assume X'],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const inScopeInput = container.querySelector('input[placeholder="In-scope item..."]') as HTMLInputElement;
    expect(inScopeInput.value).toBe('Item A');
    fireEvent.change(inScopeInput, { target: { value: 'Updated A' } });
    expect(handleFieldChange).toHaveBeenCalledWith('scope', expect.objectContaining({ inScope: ['Updated A'] }));

    const outScopeInput = container.querySelector('input[placeholder="Out-of-scope item..."]') as HTMLInputElement;
    expect(outScopeInput.value).toBe('Item B');

    const assumptionInput = container.querySelector('input[placeholder="Assumption..."]') as HTMLInputElement;
    expect(assumptionInput.value).toBe('Assume X');

    // Add buttons
    const addInScope = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add In Scope'));
    expect(addInScope).toBeTruthy();
    fireEvent.click(addInScope!);
    expect(handleFieldChange).toHaveBeenCalledWith('scope', expect.objectContaining({ inScope: ['Item A', ''] }));
  });

  it('renders functional requirements edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderPRDDetails({
        ...makeEditProps('prd', {
          requirements: {
            functional: [{ id: 'FR-1', title: 'Login', description: 'Auth flow', priority: 'high', capabilityArea: 'Auth' }],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const titleInput = container.querySelector('input[placeholder="Requirement title"]') as HTMLInputElement;
    expect(titleInput.value).toBe('Login');
    fireEvent.change(titleInput, { target: { value: 'Sign In' } });
    expect(handleFieldChange).toHaveBeenCalledWith('requirements', expect.objectContaining({
      functional: [expect.objectContaining({ title: 'Sign In' })],
    }));

    const idInput = container.querySelector('input[placeholder="ID (e.g., FR-1)"]') as HTMLInputElement;
    expect(idInput.value).toBe('FR-1');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Functional'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(handleFieldChange).toHaveBeenCalledWith('requirements', expect.objectContaining({
      functional: expect.arrayContaining([expect.objectContaining({ id: '', title: '', description: '', priority: '' })]),
    }));
  });
});

// ── renderArchitectureDetails deep tests ───────────────────────────────────

describe('renderArchitectureDetails deep', () => {
  // --- Overview section ---
  it('renders overview with projectName, style badge, summary, vision', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        overview: {
          projectName: 'MyProject',
          architectureStyle: 'Microservices',
          summary: 'A summary of the arch',
          vision: 'The vision statement',
        },
      }))}</>
    );
    expect(container.textContent).toContain('MyProject');
    expect(container.textContent).toContain('Microservices');
    expect(container.textContent).toContain('A summary of the arch');
    expect(container.textContent).toContain('The vision statement');
  });

  it('renders "No overview defined" empty state', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        overview: {},
      }))}</>
    );
    expect(container.textContent).toContain('No overview defined');
  });

  it('renders guiding principles in view mode', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        overview: {
          principles: [
            { name: 'DRY', description: 'Do not repeat yourself', rationale: 'Reduces maintenance' },
            { name: 'KISS', description: 'Keep it simple' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Guiding Principles (2)');
    expect(container.textContent).toContain('DRY');
    expect(container.textContent).toContain('Do not repeat yourself');
    expect(container.textContent).toContain('Rationale: Reduces maintenance');
    expect(container.textContent).toContain('KISS');
  });

  // --- Context section ---
  it('renders context with businessContext and technicalContext', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        context: {
          businessContext: 'B2B SaaS platform',
          technicalContext: 'Cloud-native deployment',
        },
      }))}</>
    );
    expect(container.textContent).toContain('Business Context:');
    expect(container.textContent).toContain('B2B SaaS platform');
    expect(container.textContent).toContain('Technical Context:');
    expect(container.textContent).toContain('Cloud-native deployment');
  });

  it('renders assumptions as strings', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        context: {
          assumptions: ['Stable network', 'Low latency'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Assumptions (2)');
    expect(container.textContent).toContain('Stable network');
    expect(container.textContent).toContain('Low latency');
  });

  it('renders assumptions as objects with impact and validatedBy', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        context: {
          assumptions: [
            { assumption: 'Users have modern browsers', impact: 'Can use ES2020', validatedBy: 'Analytics' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Users have modern browsers');
    expect(container.textContent).toContain('Impact: Can use ES2020');
    expect(container.textContent).toContain('Validated by: Analytics');
  });

  it('renders constraints as strings and objects', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        context: {
          constraints: [
            'Must use PostgreSQL',
            { constraint: 'Budget limit', type: 'financial', rationale: 'Startup budget', impact: 'Limits vendor choices' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Constraints (2)');
    expect(container.textContent).toContain('Must use PostgreSQL');
    expect(container.textContent).toContain('Budget limit');
    expect(container.textContent).toContain('financial');
    expect(container.textContent).toContain('Startup budget');
    expect(container.textContent).toContain('Impact: Limits vendor choices');
  });

  it('renders quality attributes with priority, target, measurementMethod', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        context: {
          qualityAttributes: [
            { attribute: 'Performance', priority: 'high', description: 'Fast response', target: '<200ms', measurementMethod: 'Load testing' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Quality Attributes (1)');
    expect(container.textContent).toContain('Performance');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('Target:');
    expect(container.textContent).toContain('<200ms');
    expect(container.textContent).toContain('Measurement:');
    expect(container.textContent).toContain('Load testing');
  });

  it('renders stakeholders with role and concerns', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        context: {
          stakeholders: [
            { role: 'CTO', concerns: ['Scalability', 'Cost'] },
            { role: 'Product Manager', concerns: [] },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Stakeholders (2)');
    expect(container.textContent).toContain('CTO');
    expect(container.textContent).toContain('Concerns: Scalability, Cost');
    expect(container.textContent).toContain('Product Manager');
  });

  it('does not render context section when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { context: {} }))}</>
    );
    expect(container.textContent).not.toContain('Architecture Context');
  });

  // --- Tech Stack section ---
  it('renders full tech stack', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        techStack: {
          frontend: {
            framework: 'React',
            language: 'TypeScript',
            stateManagement: 'Zustand',
            styling: 'Tailwind',
            testing: 'Vitest',
            buildTool: 'Vite',
            rationale: 'Modern stack',
            additionalLibraries: [{ name: 'react-query', version: '5.0', purpose: 'Server state' }],
          },
          backend: {
            framework: 'Express',
            language: 'TypeScript',
            runtime: 'Node.js',
            apiStyle: 'REST',
            rationale: 'Simple and effective',
            additionalLibraries: [{ name: 'zod', purpose: 'Validation' }],
          },
          database: {
            primary: 'PostgreSQL',
            secondary: 'Redis',
            caching: 'Redis',
            orm: 'Prisma',
            schemaStrategy: 'Code-first',
            rationale: 'Battle-tested',
          },
          infrastructure: {
            hosting: 'AWS',
            containerization: 'Docker',
            orchestration: 'ECS',
            cicd: 'GitHub Actions',
            monitoring: 'Datadog',
            logging: 'CloudWatch',
            rationale: 'Reliable cloud',
          },
          devTools: {
            ide: 'VS Code',
            linting: 'ESLint',
            formatting: 'Prettier',
            versionControl: 'Git',
            packageManager: 'pnpm',
          },
        },
      }))}</>
    );
    // Frontend
    expect(container.textContent).toContain('React');
    expect(container.textContent).toContain('(TypeScript)');
    expect(container.textContent).toContain('State:');
    expect(container.textContent).toContain('Zustand');
    expect(container.textContent).toContain('Styling:');
    expect(container.textContent).toContain('Tailwind');
    expect(container.textContent).toContain('Testing:');
    expect(container.textContent).toContain('Vitest');
    expect(container.textContent).toContain('Build:');
    expect(container.textContent).toContain('Vite');
    expect(container.textContent).toContain('Rationale: Modern stack');
    expect(container.textContent).toContain('react-query 5.0 (Server state)');
    // Backend
    expect(container.textContent).toContain('Express');
    expect(container.textContent).toContain('Runtime:');
    expect(container.textContent).toContain('Node.js');
    expect(container.textContent).toContain('API Style:');
    expect(container.textContent).toContain('REST');
    expect(container.textContent).toContain('zod');
    // Database
    expect(container.textContent).toContain('Primary:');
    expect(container.textContent).toContain('PostgreSQL');
    expect(container.textContent).toContain('Secondary:');
    expect(container.textContent).toContain('ORM:');
    expect(container.textContent).toContain('Prisma');
    expect(container.textContent).toContain('Schema Strategy:');
    expect(container.textContent).toContain('Code-first');
    // Infrastructure
    expect(container.textContent).toContain('Hosting:');
    expect(container.textContent).toContain('AWS');
    expect(container.textContent).toContain('Containers:');
    expect(container.textContent).toContain('Docker');
    expect(container.textContent).toContain('Orchestration:');
    expect(container.textContent).toContain('ECS');
    expect(container.textContent).toContain('CI/CD:');
    expect(container.textContent).toContain('GitHub Actions');
    expect(container.textContent).toContain('Monitoring:');
    expect(container.textContent).toContain('Datadog');
    expect(container.textContent).toContain('Logging:');
    expect(container.textContent).toContain('CloudWatch');
    // Dev Tools
    expect(container.textContent).toContain('IDE:');
    expect(container.textContent).toContain('VS Code');
    expect(container.textContent).toContain('Linting:');
    expect(container.textContent).toContain('ESLint');
    expect(container.textContent).toContain('Formatting:');
    expect(container.textContent).toContain('Prettier');
    expect(container.textContent).toContain('VCS:');
    expect(container.textContent).toContain('Git');
    expect(container.textContent).toContain('Package Manager:');
    expect(container.textContent).toContain('pnpm');
  });

  it('renders "No tech stack defined" empty state', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { techStack: {} }))}</>
    );
    expect(container.textContent).toContain('No tech stack defined');
  });

  // --- Tech Stack array normalization (real-world data uses string arrays) ---
  it('normalizes tech stack when categories are string arrays', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        techStack: {
          frontend: ['React 18', 'TypeScript 5.4', 'TanStack Query', 'Tailwind CSS', 'Zustand'],
          backend: ['Node.js 20 LTS', 'TypeScript 5.4', 'Fastify', 'Prisma ORM', 'GraphQL (Mercurius)'],
          database: ['PostgreSQL 16 (primary)', 'Redis 7 (cache + pub/sub)', 'S3 (file storage)'],
          infrastructure: ['AWS ECS Fargate', 'CloudFront CDN', 'RDS Aurora', 'ElastiCache', 'ALB'],
          testing: ['Vitest', 'Playwright', 'k6 (load testing)', 'Testcontainers'],
          devOps: ['GitHub Actions', 'Terraform', 'Docker', 'Datadog'],
        },
      }))}</>
    );
    // Frontend: first item → framework, second → language, rest → additional libraries
    expect(container.textContent).toContain('React 18');
    expect(container.textContent).toContain('(TypeScript 5.4)');
    expect(container.textContent).toContain('TanStack Query');
    expect(container.textContent).toContain('Tailwind CSS');
    expect(container.textContent).toContain('Zustand');
    // Backend: first → framework, second → language, rest → additional
    expect(container.textContent).toContain('Node.js 20 LTS');
    expect(container.textContent).toContain('(TypeScript 5.4)');
    expect(container.textContent).toContain('Fastify');
    expect(container.textContent).toContain('Prisma ORM');
    // Database: first → primary, second → secondary, rest → extra items
    expect(container.textContent).toContain('PostgreSQL 16 (primary)');
    expect(container.textContent).toContain('Redis 7 (cache + pub/sub)');
    expect(container.textContent).toContain('S3 (file storage)');
    // Infrastructure: first → hosting, rest → extra items
    expect(container.textContent).toContain('AWS ECS Fargate');
    expect(container.textContent).toContain('CloudFront CDN');
    expect(container.textContent).toContain('RDS Aurora');
    // Extra categories (testing, devOps) rendered as additional sections
    expect(container.textContent).toContain('Testing');
    expect(container.textContent).toContain('Vitest');
    expect(container.textContent).toContain('Playwright');
    expect(container.textContent).toContain('Dev Ops');
    expect(container.textContent).toContain('GitHub Actions');
    expect(container.textContent).toContain('Terraform');
    // Should NOT show "No tech stack defined"
    expect(container.textContent).not.toContain('No tech stack defined');
  });

  it('passes through object-style tech stack unchanged', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        techStack: {
          frontend: { framework: 'React', language: 'TypeScript' },
          backend: { framework: 'Express', language: 'Python' },
          database: { primary: 'MySQL' },
          infrastructure: { hosting: 'GCP', containerization: 'Docker' },
        },
      }))}</>
    );
    expect(container.textContent).toContain('React');
    expect(container.textContent).toContain('(TypeScript)');
    expect(container.textContent).toContain('Express');
    expect(container.textContent).toContain('(Python)');
    expect(container.textContent).toContain('MySQL');
    expect(container.textContent).toContain('GCP');
    expect(container.textContent).toContain('Docker');
  });

  it('handles empty tech stack arrays gracefully', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        techStack: {
          frontend: [],
          backend: [],
        },
      }))}</>
    );
    // Empty arrays become empty objects — should not crash
    expect(container).toBeTruthy();
  });

  it('handles mixed object and array tech stack categories', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        techStack: {
          frontend: ['React', 'TypeScript'],
          backend: { framework: 'FastAPI', language: 'Python' },
          database: ['PostgreSQL'],
          testing: ['Jest', 'Cypress'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('React');
    expect(container.textContent).toContain('(TypeScript)');
    expect(container.textContent).toContain('FastAPI');
    expect(container.textContent).toContain('(Python)');
    expect(container.textContent).toContain('PostgreSQL');
    expect(container.textContent).toContain('Testing');
    expect(container.textContent).toContain('Jest');
    expect(container.textContent).toContain('Cypress');
  });

  // --- Architecture Decisions (ADRs) section ---
  it('renders ADR with all fields', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        decisions: [{
          id: 'ADR-001',
          title: 'Use React',
          status: 'accepted',
          date: '2024-01-15',
          context: 'Need a UI framework',
          decision: 'We will use React',
          rationale: 'Large ecosystem',
          deciders: ['Alice', 'Bob'],
          consequences: {
            positive: ['Fast dev', 'Large community'],
            negative: ['Bundle size'],
            neutral: ['Learning curve'],
          },
          alternatives: [
            { option: 'Vue', description: 'Progressive framework', rejectionReason: 'Smaller ecosystem' },
          ],
          relatedDecisions: ['ADR-002'],
          implementationNotes: ['Install via npm', 'Use CRA template'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('ADR-001');
    expect(container.textContent).toContain('Use React');
    expect(container.textContent).toContain('accepted');
    expect(container.textContent).toContain('2024-01-15');
    expect(container.textContent).toContain('Context:');
    expect(container.textContent).toContain('Need a UI framework');
    expect(container.textContent).toContain('Decision:');
    expect(container.textContent).toContain('We will use React');
    expect(container.textContent).toContain('Rationale:');
    expect(container.textContent).toContain('Large ecosystem');
    expect(container.textContent).toContain('Deciders:');
    expect(container.textContent).toContain('Alice, Bob');
    expect(container.textContent).toContain('Positive:');
    expect(container.textContent).toContain('Fast dev; Large community');
    expect(container.textContent).toContain('Negative:');
    expect(container.textContent).toContain('Bundle size');
    expect(container.textContent).toContain('Neutral:');
    expect(container.textContent).toContain('Learning curve');
    expect(container.textContent).toContain('Alternatives Considered:');
    expect(container.textContent).toContain('Vue');
    expect(container.textContent).toContain('Progressive framework');
    expect(container.textContent).toContain('Rejected: Smaller ecosystem');
    expect(container.textContent).toContain('Related:');
    expect(container.textContent).toContain('ADR-002');
    expect(container.textContent).toContain('Implementation Notes:');
    expect(container.textContent).toContain('Install via npm; Use CRA template');
  });

  it('renders "No architecture decisions defined" empty state', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { decisions: [] }))}</>
    );
    expect(container.textContent).toContain('No architecture decisions defined');
  });

  // --- Patterns section ---
  it('renders patterns with all fields', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        patterns: [{
          pattern: 'Repository Pattern',
          category: 'structural',
          usage: 'Used for data access',
          implementation: 'TypeORM repositories',
          rationale: 'Separation of concerns',
          examples: [
            { name: 'UserRepo', location: 'src/repos/', description: 'Handles user data' },
          ],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Repository Pattern');
    expect(container.textContent).toContain('structural');
    expect(container.textContent).toContain('Used for data access');
    expect(container.textContent).toContain('Implementation:');
    expect(container.textContent).toContain('TypeORM repositories');
    expect(container.textContent).toContain('Rationale: Separation of concerns');
    expect(container.textContent).toContain('UserRepo');
    expect(container.textContent).toContain('@ src/repos/');
    expect(container.textContent).toContain('Handles user data');
  });

  it('renders "No patterns defined" empty state', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { patterns: [] }))}</>
    );
    expect(container.textContent).toContain('No patterns defined');
  });

  // --- System Components section ---
  it('renders system components with all fields', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        systemComponents: [{
          name: 'API Gateway',
          id: 'comp-1',
          type: 'service',
          technology: 'Express',
          description: 'Routes incoming requests',
          responsibilities: ['Authentication', 'Rate limiting'],
          interfaces: [{ name: 'REST API', type: 'HTTP', description: 'Public interface' }],
          dependencies: ['Auth Service', 'User Service'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('API Gateway');
    expect(container.textContent).toContain('(comp-1)');
    expect(container.textContent).toContain('service');
    expect(container.textContent).toContain('Express');
    expect(container.textContent).toContain('Routes incoming requests');
    expect(container.textContent).toContain('Responsibilities:');
    expect(container.textContent).toContain('Authentication');
    expect(container.textContent).toContain('Rate limiting');
    expect(container.textContent).toContain('Interfaces:');
    expect(container.textContent).toContain('REST API');
    expect(container.textContent).toContain('(HTTP)');
    expect(container.textContent).toContain('Public interface');
    expect(container.textContent).toContain('Dependencies:');
    expect(container.textContent).toContain('Auth Service, User Service');
  });

  it('renders "No components defined" empty state', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { systemComponents: [] }))}</>
    );
    expect(container.textContent).toContain('No components defined');
  });

  // --- Project Structure section ---
  it('renders project structure with all fields', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        projectStructure: {
          monorepo: true,
          description: 'Monorepo with Turborepo',
          moduleOrganization: 'Feature-based',
          structure: [
            { path: 'src/components/', purpose: 'UI components', contents: 'React components', conventions: 'PascalCase' },
          ],
          namingConventions: [
            { type: 'components', convention: 'PascalCase', example: 'UserProfile.tsx', rationale: 'React convention' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Repository Type:');
    expect(container.textContent).toContain('Monorepo');
    expect(container.textContent).toContain('Monorepo with Turborepo');
    expect(container.textContent).toContain('Module Organization:');
    expect(container.textContent).toContain('Feature-based');
    expect(container.textContent).toContain('Directory Structure');
    expect(container.textContent).toContain('src/components/');
    expect(container.textContent).toContain('UI components');
    expect(container.textContent).toContain('(React components)');
    expect(container.textContent).toContain('[Convention: PascalCase]');
    expect(container.textContent).toContain('Naming Conventions');
    expect(container.textContent).toContain('components:');
    expect(container.textContent).toContain('e.g., UserProfile.tsx');
    expect(container.textContent).toContain('(React convention)');
  });

  it('renders Single Repo for monorepo=false', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        projectStructure: { monorepo: false, description: 'A single repo' },
      }))}</>
    );
    expect(container.textContent).toContain('Single Repo');
  });

  it('does not render project structure section when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { projectStructure: {} }))}</>
    );
    expect(container.textContent).not.toContain('Project Structure');
  });

  // --- Data Flow section ---
  it('renders data flow with flows and diagrams', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        dataFlow: {
          description: 'Event-driven data flow',
          flows: [{
            id: 'DF-1',
            name: 'User Registration',
            description: 'Creates user account',
            source: 'Web Client',
            destination: 'API Server',
            dataType: 'JSON',
            protocol: 'HTTPS',
          }],
          diagrams: [
            { name: 'Sequence Diagram', type: 'UML', description: 'Registration flow', reference: 'docs/diagrams/reg.png' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Event-driven data flow');
    expect(container.textContent).toContain('Flows (1)');
    expect(container.textContent).toContain('DF-1');
    expect(container.textContent).toContain('User Registration');
    expect(container.textContent).toContain('HTTPS');
    expect(container.textContent).toContain('Creates user account');
    expect(container.textContent).toContain('Web Client');
    expect(container.textContent).toContain('API Server');
    expect(container.textContent).toContain('(JSON)');
    expect(container.textContent).toContain('Diagrams');
    expect(container.textContent).toContain('Sequence Diagram');
    expect(container.textContent).toContain('(UML)');
    expect(container.textContent).toContain('Registration flow');
    expect(container.textContent).toContain('[docs/diagrams/reg.png]');
  });

  it('does not render data flow section when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { dataFlow: {} }))}</>
    );
    expect(container.textContent).not.toContain('Data Flow');
  });

  // --- Security Architecture section ---
  it('renders security with authentication, authorization, data protection', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        security: {
          overview: 'Defense in depth strategy',
          authentication: {
            method: 'OAuth2',
            description: 'Standard OAuth2 flow',
            provider: 'Auth0',
            tokenStrategy: 'Short-lived access + refresh',
            sessionManagement: 'Stateless JWT',
          },
          authorization: {
            method: 'RBAC',
            description: 'Role-based access control',
            roles: [
              { role: 'Admin', permissions: ['read', 'write', 'delete'] },
              { role: 'Viewer', permissions: ['read'] },
            ],
          },
          dataProtection: {
            atRest: 'AES-256',
            inTransit: 'TLS 1.3',
            sensitiveData: 'Encrypted at field level',
            pii: 'GDPR compliant handling',
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Defense in depth strategy');
    // Authentication
    expect(container.textContent).toContain('Method:');
    expect(container.textContent).toContain('OAuth2');
    expect(container.textContent).toContain('Standard OAuth2 flow');
    expect(container.textContent).toContain('Provider:');
    expect(container.textContent).toContain('Auth0');
    expect(container.textContent).toContain('Token Strategy:');
    expect(container.textContent).toContain('Short-lived access + refresh');
    expect(container.textContent).toContain('Session:');
    expect(container.textContent).toContain('Stateless JWT');
    // Authorization
    expect(container.textContent).toContain('RBAC');
    expect(container.textContent).toContain('Role-based access control');
    expect(container.textContent).toContain('Admin');
    expect(container.textContent).toContain('read, write, delete');
    expect(container.textContent).toContain('Viewer');
    // Data Protection
    expect(container.textContent).toContain('At Rest:');
    expect(container.textContent).toContain('AES-256');
    expect(container.textContent).toContain('In Transit:');
    expect(container.textContent).toContain('TLS 1.3');
    expect(container.textContent).toContain('Sensitive Data:');
    expect(container.textContent).toContain('Encrypted at field level');
    expect(container.textContent).toContain('PII:');
    expect(container.textContent).toContain('GDPR compliant handling');
  });

  it('renders security patterns, threats, and compliance', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        security: {
          securityPatterns: [
            { pattern: 'API Gateway', description: 'Centralized entry', implementation: 'Kong' },
          ],
          threats: [
            { threat: 'SQL Injection', category: 'OWASP', mitigation: 'Parameterized queries', status: 'mitigated' },
          ],
          compliance: [
            { standard: 'GDPR', requirements: ['Data deletion', 'Consent management'], implementation: 'Privacy module' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Security Patterns');
    expect(container.textContent).toContain('API Gateway');
    expect(container.textContent).toContain('Centralized entry');
    expect(container.textContent).toContain('(Kong)');
    expect(container.textContent).toContain('Threats (1)');
    expect(container.textContent).toContain('SQL Injection');
    expect(container.textContent).toContain('OWASP');
    expect(container.textContent).toContain('mitigated');
    expect(container.textContent).toContain('Mitigation: Parameterized queries');
    expect(container.textContent).toContain('Compliance');
    expect(container.textContent).toContain('GDPR');
    expect(container.textContent).toContain('Data deletion, Consent management');
    expect(container.textContent).toContain('(Privacy module)');
  });

  it('does not render security section when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { security: {} }))}</>
    );
    expect(container.textContent).not.toContain('Security Architecture');
  });

  // --- Scalability section ---
  it('renders scalability with all subsections', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        scalability: {
          strategy: 'Horizontal scaling with auto-scaling groups',
          horizontalScaling: {
            approach: 'Add more instances',
            triggers: ['CPU > 80%', 'Memory > 70%'],
            limitations: ['Database connections', 'Shared state'],
          },
          verticalScaling: {
            approach: 'Increase instance size',
            limits: '16 vCPU / 64GB RAM',
          },
          bottlenecks: [
            { area: 'Database', description: 'Connection pooling limit', severity: 'high' },
          ],
          mitigations: [
            { bottleneck: 'Database', mitigation: 'Read replicas', implementation: 'AWS RDS Multi-AZ' },
          ],
          capacityPlanning: {
            currentCapacity: '10k req/s',
            projectedGrowth: '3x in 12 months',
            scalingThresholds: ['5k req/s warning', '8k req/s critical'],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Horizontal scaling with auto-scaling groups');
    expect(container.textContent).toContain('Horizontal Scaling');
    expect(container.textContent).toContain('Add more instances');
    expect(container.textContent).toContain('Triggers:');
    expect(container.textContent).toContain('CPU > 80%, Memory > 70%');
    expect(container.textContent).toContain('Limitations:');
    expect(container.textContent).toContain('Database connections, Shared state');
    expect(container.textContent).toContain('Vertical Scaling');
    expect(container.textContent).toContain('Increase instance size');
    expect(container.textContent).toContain('Limits:');
    expect(container.textContent).toContain('16 vCPU / 64GB RAM');
    expect(container.textContent).toContain('Bottlenecks (1)');
    expect(container.textContent).toContain('Database');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('Connection pooling limit');
    expect(container.textContent).toContain('Mitigations');
    expect(container.textContent).toContain('Read replicas');
    expect(container.textContent).toContain('(AWS RDS Multi-AZ)');
    expect(container.textContent).toContain('Capacity Planning');
    expect(container.textContent).toContain('Current:');
    expect(container.textContent).toContain('10k req/s');
    expect(container.textContent).toContain('Projected Growth:');
    expect(container.textContent).toContain('3x in 12 months');
    expect(container.textContent).toContain('Thresholds:');
    expect(container.textContent).toContain('5k req/s warning, 8k req/s critical');
  });

  it('does not render scalability section when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { scalability: {} }))}</>
    );
    expect(container.textContent).not.toContain('Scalability');
  });

  // --- Reliability section ---
  it('renders reliability with all subsections', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        reliability: {
          availabilityTarget: '99.9% uptime',
          faultTolerance: {
            strategy: 'Multi-AZ deployment',
            failoverMechanism: 'Automatic DNS failover',
            recoveryTime: '< 5 minutes',
          },
          errorHandling: {
            strategy: 'Graceful degradation',
            retryPolicy: 'Exponential backoff',
            circuitBreaker: 'Hystrix pattern',
          },
          backupStrategy: {
            frequency: 'Daily',
            retention: '30 days',
            recoveryProcess: 'Automated restore from S3',
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Availability Target:');
    expect(container.textContent).toContain('99.9% uptime');
    expect(container.textContent).toContain('Fault Tolerance');
    expect(container.textContent).toContain('Strategy:');
    expect(container.textContent).toContain('Multi-AZ deployment');
    expect(container.textContent).toContain('Failover:');
    expect(container.textContent).toContain('Automatic DNS failover');
    expect(container.textContent).toContain('Recovery Time:');
    expect(container.textContent).toContain('< 5 minutes');
    expect(container.textContent).toContain('Error Handling');
    expect(container.textContent).toContain('Graceful degradation');
    expect(container.textContent).toContain('Retry Policy:');
    expect(container.textContent).toContain('Exponential backoff');
    expect(container.textContent).toContain('Circuit Breaker:');
    expect(container.textContent).toContain('Hystrix pattern');
    expect(container.textContent).toContain('Backup Strategy');
    expect(container.textContent).toContain('Frequency:');
    expect(container.textContent).toContain('Daily');
    expect(container.textContent).toContain('Retention:');
    expect(container.textContent).toContain('30 days');
    expect(container.textContent).toContain('Recovery Process:');
    expect(container.textContent).toContain('Automated restore from S3');
  });

  it('does not render reliability section when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { reliability: {} }))}</>
    );
    expect(container.textContent).not.toContain('Reliability');
  });

  // --- Observability section ---
  it('renders observability with all subsections', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        observability: {
          logging: {
            strategy: 'Structured JSON logging',
            format: 'JSON',
            levels: ['error', 'warn', 'info', 'debug'],
            aggregation: 'ELK Stack',
          },
          metrics: {
            strategy: 'RED method',
            keyMetrics: [
              { name: 'Request Rate', type: 'counter', threshold: '> 1000/s alert' },
            ],
          },
          tracing: {
            strategy: 'Distributed tracing',
            implementation: 'OpenTelemetry',
          },
          alerting: {
            strategy: 'Multi-channel alerting',
            channels: ['Slack', 'PagerDuty'],
            escalation: 'P1 -> on-call -> manager',
          },
        },
      }))}</>
    );
    // Logging
    expect(container.textContent).toContain('Logging');
    expect(container.textContent).toContain('Structured JSON logging');
    expect(container.textContent).toContain('Format:');
    expect(container.textContent).toContain('JSON');
    expect(container.textContent).toContain('Levels:');
    expect(container.textContent).toContain('error, warn, info, debug');
    expect(container.textContent).toContain('Aggregation:');
    expect(container.textContent).toContain('ELK Stack');
    // Metrics
    expect(container.textContent).toContain('Metrics');
    expect(container.textContent).toContain('RED method');
    expect(container.textContent).toContain('Request Rate');
    expect(container.textContent).toContain('(counter)');
    expect(container.textContent).toContain('Threshold: > 1000/s alert');
    // Tracing
    expect(container.textContent).toContain('Tracing');
    expect(container.textContent).toContain('Distributed tracing');
    expect(container.textContent).toContain('Implementation:');
    expect(container.textContent).toContain('OpenTelemetry');
    // Alerting
    expect(container.textContent).toContain('Alerting');
    expect(container.textContent).toContain('Multi-channel alerting');
    expect(container.textContent).toContain('Channels:');
    expect(container.textContent).toContain('Slack, PagerDuty');
    expect(container.textContent).toContain('Escalation:');
    expect(container.textContent).toContain('P1 -> on-call -> manager');
  });

  it('does not render observability section when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { observability: {} }))}</>
    );
    expect(container.textContent).not.toContain('Observability');
  });

  // --- Deployment section ---
  it('renders deployment with all subsections', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        deployment: {
          strategy: 'Blue-Green deployment',
          environments: [
            { name: 'Production', purpose: 'Live traffic', configuration: 'Multi-AZ' },
            { name: 'Staging', purpose: 'Pre-production testing', configuration: 'Single-AZ' },
          ],
          pipeline: {
            stages: [
              { name: 'Build', purpose: 'Compile and package', tools: ['Docker', 'npm'] },
              { name: 'Test', purpose: 'Run test suite', tools: ['Vitest'] },
            ],
            triggers: ['push to main', 'manual'],
          },
          rollback: {
            strategy: 'Automatic rollback on health check failure',
            procedure: 'Switch DNS back to previous deployment',
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Blue-Green deployment');
    expect(container.textContent).toContain('Environments (2)');
    expect(container.textContent).toContain('Production');
    expect(container.textContent).toContain('Live traffic');
    expect(container.textContent).toContain('(Multi-AZ)');
    expect(container.textContent).toContain('Staging');
    expect(container.textContent).toContain('Pipeline Stages');
    expect(container.textContent).toContain('Build');
    expect(container.textContent).toContain('Compile and package');
    expect(container.textContent).toContain('[Docker, npm]');
    expect(container.textContent).toContain('Test');
    expect(container.textContent).toContain('Run test suite');
    expect(container.textContent).toContain('[Vitest]');
    expect(container.textContent).toContain('Triggers:');
    expect(container.textContent).toContain('push to main, manual');
    expect(container.textContent).toContain('Rollback');
    expect(container.textContent).toContain('Automatic rollback on health check failure');
    expect(container.textContent).toContain('Procedure:');
    expect(container.textContent).toContain('Switch DNS back to previous deployment');
  });

  it('does not render deployment section when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { deployment: {} }))}</>
    );
    expect(container.textContent).not.toContain('Deployment');
  });

  // --- Integrations section ---
  it('renders integrations with all fields', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        integrations: [{
          name: 'Payment Gateway',
          type: 'API',
          protocol: 'REST',
          description: 'Handles payments',
          authentication: 'API Key',
          dataFormat: 'JSON',
          errorHandling: 'Retry with backoff',
          sla: '99.95% uptime',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Payment Gateway');
    expect(container.textContent).toContain('API');
    expect(container.textContent).toContain('REST');
    expect(container.textContent).toContain('Handles payments');
    expect(container.textContent).toContain('Auth:');
    expect(container.textContent).toContain('API Key');
    expect(container.textContent).toContain('Data Format:');
    expect(container.textContent).toContain('JSON');
    expect(container.textContent).toContain('Error Handling:');
    expect(container.textContent).toContain('Retry with backoff');
    expect(container.textContent).toContain('SLA:');
    expect(container.textContent).toContain('99.95% uptime');
  });

  it('does not render integrations section when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { integrations: [] }))}</>
    );
    expect(container.textContent).not.toContain('Integrations');
  });

  // --- Validation section ---
  it('renders validation with status, date, validators, findings', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        validation: {
          status: 'validated',
          validationDate: '2024-03-01',
          validators: ['Alice', 'Bob'],
          findings: [{
            id: 'F-1',
            type: 'issue',
            severity: 'high',
            status: 'open',
            finding: 'Missing error handling in auth flow',
            recommendation: 'Add try-catch blocks',
          }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('validated');
    expect(container.textContent).toContain('Date:');
    expect(container.textContent).toContain('2024-03-01');
    expect(container.textContent).toContain('Validators:');
    expect(container.textContent).toContain('Alice, Bob');
    expect(container.textContent).toContain('Findings (1)');
    expect(container.textContent).toContain('F-1');
    expect(container.textContent).toContain('issue');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('open');
    expect(container.textContent).toContain('Missing error handling in auth flow');
    expect(container.textContent).toContain('Recommendation:');
    expect(container.textContent).toContain('Add try-catch blocks');
  });

  it('does not render validation section when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { validation: {} }))}</>
    );
    expect(container.textContent).not.toContain('Architecture Validation');
  });

  // --- Implementation Notes section ---
  it('renders implementation notes list', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        implementationNotes: ['Use feature flags', 'Follow 12-factor app principles'],
      }))}</>
    );
    expect(container.textContent).toContain('Implementation Notes');
    expect(container.textContent).toContain('Use feature flags');
    expect(container.textContent).toContain('Follow 12-factor app principles');
  });

  it('does not render implementation notes when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { implementationNotes: [] }))}</>
    );
    expect(container.textContent).not.toContain('Implementation Notes');
  });

  // --- References section ---
  it('renders references with all fields', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        references: [
          { title: 'RFC-001', type: 'RFC', location: 'https://example.com/rfc', description: 'Initial design doc' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('References');
    expect(container.textContent).toContain('RFC-001');
    expect(container.textContent).toContain('RFC');
    expect(container.textContent).toContain('https://example.com/rfc');
    expect(container.textContent).toContain('(Initial design doc)');
  });

  it('does not render references when empty', () => {
    const { container } = render(
      <>{renderArchitectureDetails(makeProps('architecture', { references: [] }))}</>
    );
    expect(container.textContent).not.toContain('References');
  });

  // --- Edit mode tests ---
  it('renders overview edit mode with input fields', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderArchitectureDetails({
        ...makeEditProps('architecture', {
          overview: { projectName: 'MyApp', architectureStyle: 'Monolithic', summary: 'Summary', vision: 'Vision' },
        }),
        handleFieldChange,
      })}</>
    );
    const projectInput = container.querySelector('input[placeholder="Project name"]') as HTMLInputElement;
    expect(projectInput.value).toBe('MyApp');
    fireEvent.change(projectInput, { target: { value: 'NewApp' } });
    expect(handleFieldChange).toHaveBeenCalledWith('overview', expect.objectContaining({ projectName: 'NewApp' }));
  });

  it('renders overview principles edit mode with add/remove', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderArchitectureDetails({
        ...makeEditProps('architecture', {
          overview: { principles: [{ name: 'DRY', description: 'Desc', rationale: 'Rat' }] },
        }),
        handleFieldChange,
      })}</>
    );
    const nameInput = container.querySelector('input[placeholder="Principle name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('DRY');

    // Add principle
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Principle'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(handleFieldChange).toHaveBeenCalledWith('overview', expect.objectContaining({
      principles: expect.arrayContaining([expect.objectContaining({ name: '', description: '', rationale: '' })]),
    }));
  });

  it('renders context edit mode with assumptions and constraints', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderArchitectureDetails({
        ...makeEditProps('architecture', {
          context: {
            businessContext: 'Biz ctx',
            technicalContext: 'Tech ctx',
            assumptions: [{ assumption: 'A1', impact: 'I1', validatedBy: 'V1' }],
            constraints: [{ constraint: 'C1', type: 'T1', rationale: 'R1' }],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const bizTextarea = container.querySelector('textarea[placeholder="Business context and drivers..."]') as HTMLTextAreaElement;
    expect(bizTextarea.value).toBe('Biz ctx');

    // Add assumption button
    const addAssumption = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Assumption'));
    expect(addAssumption).toBeTruthy();
    fireEvent.click(addAssumption!);
    expect(handleFieldChange).toHaveBeenCalledWith('context', expect.objectContaining({
      assumptions: expect.arrayContaining([expect.objectContaining({ assumption: '', impact: '', validatedBy: '' })]),
    }));
  });

  it('renders ADR edit mode with updateArrayItem and addToArray', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const removeFromArray = vi.fn();
    const { container } = render(
      <>{renderArchitectureDetails({
        ...makeEditProps('architecture', {
          decisions: [{ id: 'ADR-1', title: 'Use React', status: 'proposed', context: 'Ctx', decision: 'Dec', rationale: 'Rat' }],
        }),
        updateArrayItem,
        addToArray,
        removeFromArray,
      })}</>
    );
    const titleInput = container.querySelector('input[placeholder="Decision title"]') as HTMLInputElement;
    expect(titleInput.value).toBe('Use React');
    fireEvent.change(titleInput, { target: { value: 'Use Vue' } });
    expect(updateArrayItem).toHaveBeenCalledWith('decisions', 0, expect.objectContaining({ title: 'Use Vue' }));

    // Add decision
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Decision'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('decisions', expect.objectContaining({ id: '', title: '', status: 'proposed' }));
  });

  it('renders tech stack edit mode with nested fields', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderArchitectureDetails({
        ...makeEditProps('architecture', {
          techStack: {
            frontend: { framework: 'React', language: 'TS' },
            database: { primary: 'PG' },
          },
        }),
        handleFieldChange,
      })}</>
    );
    const frameworkInput = container.querySelector('input[placeholder="e.g., React, Vue, Angular"]') as HTMLInputElement;
    expect(frameworkInput.value).toBe('React');
    fireEvent.change(frameworkInput, { target: { value: 'Vue' } });
    expect(handleFieldChange).toHaveBeenCalledWith('techStack', expect.objectContaining({
      frontend: expect.objectContaining({ framework: 'Vue' }),
    }));
  });

  it('renders deployment edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderArchitectureDetails({
        ...makeEditProps('architecture', {
          deployment: {
            strategy: 'Rolling',
            environments: [{ name: 'Prod', purpose: 'Live', configuration: 'HA' }],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const strategyTextarea = container.querySelector('textarea[placeholder*="Deployment strategy"]') as HTMLTextAreaElement;
    expect(strategyTextarea.value).toBe('Rolling');

    const addEnv = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Environment'));
    expect(addEnv).toBeTruthy();
    fireEvent.click(addEnv!);
    expect(handleFieldChange).toHaveBeenCalledWith('deployment', expect.objectContaining({
      environments: expect.arrayContaining([expect.objectContaining({ name: '', purpose: '', configuration: '' })]),
    }));
  });

  it('renders security edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderArchitectureDetails({
        ...makeEditProps('architecture', {
          security: {
            overview: 'Secure by design',
            authentication: { method: 'JWT', provider: 'Custom' },
          },
        }),
        handleFieldChange,
      })}</>
    );
    const overviewTextarea = container.querySelector('textarea[placeholder="Security architecture overview..."]') as HTMLTextAreaElement;
    expect(overviewTextarea.value).toBe('Secure by design');

    const methodInput = container.querySelector('input[placeholder="e.g., JWT, OAuth2, Session"]') as HTMLInputElement;
    expect(methodInput.value).toBe('JWT');
  });

  it('renders scalability edit mode', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderArchitectureDetails({
        ...makeEditProps('architecture', {
          scalability: {
            strategy: 'Auto-scale',
            horizontalScaling: { approach: 'More pods' },
          },
        }),
        handleFieldChange,
      })}</>
    );
    const strategyTextarea = container.querySelector('textarea[placeholder="Scalability strategy overview..."]') as HTMLTextAreaElement;
    expect(strategyTextarea.value).toBe('Auto-scale');
  });

  it('renders implementation notes edit mode', () => {
    const handleFieldChange = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderArchitectureDetails({
        ...makeEditProps('architecture', {
          implementationNotes: ['Note 1', 'Note 2'],
        }),
        handleFieldChange,
        addToArray,
      })}</>
    );
    const inputs = container.querySelectorAll('input[placeholder="Implementation note..."]');
    expect(inputs.length).toBe(2);
    expect((inputs[0] as HTMLInputElement).value).toBe('Note 1');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Note'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('implementationNotes', '');
  });

  it('renders references edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderArchitectureDetails({
        ...makeEditProps('architecture', {
          references: [{ title: 'Doc', type: 'RFC', location: 'http://x', description: 'Desc' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const titleInput = container.querySelector('input[placeholder="Title"]') as HTMLInputElement;
    expect(titleInput.value).toBe('Doc');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Reference'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('references', expect.objectContaining({ title: '', type: '', location: '', description: '' }));
  });

  // --- Smoke: renders without crashing with all sections populated ---
  it('renders full architecture without crashing', () => {
    expect(() => render(
      <>{renderArchitectureDetails(makeProps('architecture', {
        overview: { projectName: 'P', architectureStyle: 'S', summary: 'Sum', vision: 'V', principles: [{ name: 'N' }] },
        context: { businessContext: 'B', technicalContext: 'T', assumptions: ['A'], constraints: ['C'], qualityAttributes: [{ attribute: 'QA' }], stakeholders: [{ role: 'R', concerns: ['C'] }] },
        techStack: { frontend: { framework: 'F' }, backend: { framework: 'B' }, database: { primary: 'D' }, infrastructure: { hosting: 'H' }, devTools: { ide: 'I' } },
        decisions: [{ id: 'A', title: 'T', status: 'accepted', decision: 'D' }],
        patterns: [{ pattern: 'P', category: 'C' }],
        systemComponents: [{ name: 'N', type: 'T' }],
        projectStructure: { description: 'D', structure: [{ path: 'P' }], namingConventions: [{ type: 'T', convention: 'C' }] },
        dataFlow: { description: 'D', flows: [{ name: 'F', source: 'S', destination: 'D' }], diagrams: [{ name: 'Diag' }] },
        security: { overview: 'O', authentication: { method: 'M' }, authorization: { method: 'M', roles: [{ role: 'R' }] }, dataProtection: { atRest: 'A' }, securityPatterns: [{ pattern: 'P' }], threats: [{ threat: 'T' }], compliance: [{ standard: 'S' }] },
        scalability: { strategy: 'S', horizontalScaling: { approach: 'A' }, verticalScaling: { approach: 'A' }, bottlenecks: [{ area: 'A' }], mitigations: [{ bottleneck: 'B', mitigation: 'M' }], capacityPlanning: { currentCapacity: 'C' } },
        reliability: { availabilityTarget: 'A', faultTolerance: { strategy: 'S' }, errorHandling: { strategy: 'S' }, backupStrategy: { frequency: 'F' } },
        observability: { logging: { strategy: 'S' }, metrics: { strategy: 'S', keyMetrics: [{ name: 'M' }] }, tracing: { strategy: 'S' }, alerting: { strategy: 'S', channels: ['C'] } },
        deployment: { strategy: 'S', environments: [{ name: 'E' }], pipeline: { stages: [{ name: 'S' }], triggers: ['T'] }, rollback: { strategy: 'S' } },
        integrations: [{ name: 'I', type: 'T', protocol: 'P', description: 'D' }],
        validation: { status: 'validated', validationDate: 'D', validators: ['V'], findings: [{ finding: 'F' }] },
        implementationNotes: ['N'],
        references: [{ title: 'T' }],
      }))}</>
    )).not.toThrow();
  });
});

// ── renderProductBriefDetails deep tests ────────────────────────────────────

describe('renderProductBriefDetails deep', () => {
  // --- Product Info section ---
  it('renders product name and tagline', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        productName: 'BMAD Platform',
        tagline: 'Build better software',
      }))}</>
    );
    expect(container.textContent).toContain('BMAD Platform');
    expect(container.textContent).toContain('"Build better software"');
  });

  it('falls back to artifact.title when no productName', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {}))}</>
    );
    expect(container.textContent).toContain('Test product-brief');
  });

  it('does not render tagline when absent', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        productName: 'MyApp',
      }))}</>
    );
    expect(container.textContent).toContain('MyApp');
    expect(container.textContent).not.toContain('"');
  });

  // --- Vision section ---
  it('renders vision with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        vision: {
          statement: 'Empower developers everywhere',
          mission: 'Make testing easy',
          problemStatement: 'Testing is hard',
          proposedSolution: 'Automated testing platform',
          uniqueValueProposition: 'One-click test generation',
        },
      }))}</>
    );
    expect(container.textContent).toContain('Vision:');
    expect(container.textContent).toContain('Empower developers everywhere');
    expect(container.textContent).toContain('Mission:');
    expect(container.textContent).toContain('Make testing easy');
    expect(container.textContent).toContain('Problem:');
    expect(container.textContent).toContain('Testing is hard');
    expect(container.textContent).toContain('Solution:');
    expect(container.textContent).toContain('Automated testing platform');
    expect(container.textContent).toContain('Value:');
    expect(container.textContent).toContain('One-click test generation');
  });

  it('renders vision differentiators', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        vision: {
          statement: 'V',
          differentiators: [
            { differentiator: 'AI-powered', competitiveAdvantage: 'No competitor has this' },
            { differentiator: 'Free tier' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Differentiators:');
    expect(container.textContent).toContain('AI-powered');
    expect(container.textContent).toContain('No competitor has this');
    expect(container.textContent).toContain('Free tier');
  });

  it('renders vision problem details with impact', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        vision: {
          statement: 'V',
          problemDetails: [
            { problem: 'Slow builds', impact: 'Developer frustration' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Problem Details:');
    expect(container.textContent).toContain('Slow builds');
    expect(container.textContent).toContain('(Impact: Developer frustration)');
  });

  it('renders vision solution approach with rationale', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        vision: {
          statement: 'V',
          solutionApproach: [
            { aspect: 'Caching', description: 'Use distributed cache', rationale: 'Reduces latency' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Solution Approach:');
    expect(container.textContent).toContain('Caching:');
    expect(container.textContent).toContain('Use distributed cache');
    expect(container.textContent).toContain('Reduces latency');
  });

  it('shows "No vision defined" when no statement and no problemStatement', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        vision: { mission: 'Some mission' },
      }))}</>
    );
    expect(container.textContent).toContain('No vision defined');
  });

  // --- Target Users section ---
  it('renders target users with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        targetUsers: [{
          persona: 'Frontend Developer',
          description: 'Builds UI components',
          technicalProficiency: 'high',
          goals: [{ goal: 'Ship faster' }, { goal: 'Fewer bugs' }],
          painPoints: [{ painPoint: 'Manual testing' }, { painPoint: 'Flaky CI' }],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Frontend Developer');
    expect(container.textContent).toContain('Tech Level:');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('Goals:');
    expect(container.textContent).toContain('Ship faster, Fewer bugs');
    expect(container.textContent).toContain('Pain Points:');
    expect(container.textContent).toContain('Manual testing, Flaky CI');
  });

  it('normalizes string target users to { persona: string }', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        targetUsers: ['Developer', 'Designer'],
      }))}</>
    );
    expect(container.textContent).toContain('Developer');
    expect(container.textContent).toContain('Designer');
  });

  it('normalizes "role" field to "persona"', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        targetUsers: [{ role: 'QA Engineer', description: 'Tests software' }],
      }))}</>
    );
    expect(container.textContent).toContain('QA Engineer');
  });

  it('renders string goals and painPoints', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        targetUsers: [{
          persona: 'User',
          goals: ['Fast loading', 'Easy navigation'],
          painPoints: ['Slow', 'Confusing'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Goals:');
    expect(container.textContent).toContain('Fast loading, Easy navigation');
    expect(container.textContent).toContain('Pain Points:');
    expect(container.textContent).toContain('Slow, Confusing');
  });

  it('shows "No target users defined" when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { targetUsers: [] }))}</>
    );
    expect(container.textContent).toContain('No target users defined');
  });

  // --- Market Context section ---
  it('renders market context with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        marketContext: {
          overview: 'Growing market',
          currentLandscape: 'Fragmented',
          opportunity: 'Consolidation play',
          targetMarket: 'Enterprise SaaS',
          marketSize: { tam: '$50B', sam: '$10B', som: '$1B' },
          competitiveLandscape: 'Many small players',
          competitors: [
            { name: 'CompetitorA', description: 'Market leader', strengths: 'Brand', weaknesses: 'Slow' },
          ],
          trends: [
            { trend: 'AI adoption', impact: 'High growth' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Growing market');
    expect(container.textContent).toContain('Landscape:');
    expect(container.textContent).toContain('Fragmented');
    expect(container.textContent).toContain('Opportunity:');
    expect(container.textContent).toContain('Consolidation play');
    expect(container.textContent).toContain('Target Market:');
    expect(container.textContent).toContain('Enterprise SaaS');
    expect(container.textContent).toContain('Market Size:');
    expect(container.textContent).toContain('TAM: $50B');
    expect(container.textContent).toContain('SAM: $10B');
    expect(container.textContent).toContain('SOM: $1B');
    expect(container.textContent).toContain('Competitive Landscape:');
    expect(container.textContent).toContain('Many small players');
    expect(container.textContent).toContain('Competitors:');
    expect(container.textContent).toContain('CompetitorA');
    expect(container.textContent).toContain('Market leader');
    expect(container.textContent).toContain('Strengths:');
    expect(container.textContent).toContain('Brand');
    expect(container.textContent).toContain('Weaknesses:');
    expect(container.textContent).toContain('Slow');
    expect(container.textContent).toContain('Trends:');
    expect(container.textContent).toContain('AI adoption');
    expect(container.textContent).toContain('Impact: High growth');
  });

  it('does not render market context when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { marketContext: {} }))}</>
    );
    expect(container.textContent).not.toContain('Market Context');
  });

  // --- Key Features section ---
  it('renders key features with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        keyFeatures: [{
          name: 'Auto-complete',
          priority: 'must-have',
          complexity: 'medium',
          description: 'AI-powered code completion',
          userBenefit: 'Faster coding',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Auto-complete');
    expect(container.textContent).toContain('must-have');
    expect(container.textContent).toContain('medium');
    expect(container.textContent).toContain('AI-powered code completion');
    expect(container.textContent).toContain('Benefit: Faster coding');
  });

  it('normalizes string key features', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        keyFeatures: ['Search', 'Filter'],
      }))}</>
    );
    expect(container.textContent).toContain('Search');
    expect(container.textContent).toContain('Filter');
  });

  it('shows "No key features defined" when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { keyFeatures: [] }))}</>
    );
    expect(container.textContent).toContain('No key features defined');
  });

  // --- Scope section ---
  it('renders scope with all subsections', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        scope: {
          overview: 'Project scope overview',
          mvpDefinition: {
            description: 'MVP includes core features',
            features: ['Login', 'Dashboard', 'Export'],
          },
          inScope: [
            { item: 'User management', priority: 'high' },
            'API development',
          ],
          outOfScope: [
            { item: 'Mobile app', reason: 'Phase 2' },
            'Custom integrations',
          ],
          futureConsiderations: [
            { item: 'ML pipeline', timeframe: 'Q3 2025' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Project scope overview');
    expect(container.textContent).toContain('MVP Definition');
    expect(container.textContent).toContain('MVP includes core features');
    expect(container.textContent).toContain('Login');
    expect(container.textContent).toContain('Dashboard');
    expect(container.textContent).toContain('Export');
    expect(container.textContent).toContain('In Scope');
    expect(container.textContent).toContain('User management');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('API development');
    expect(container.textContent).toContain('Out of Scope');
    expect(container.textContent).toContain('Mobile app');
    expect(container.textContent).toContain('Phase 2');
    expect(container.textContent).toContain('Custom integrations');
    expect(container.textContent).toContain('Future Considerations');
    expect(container.textContent).toContain('ML pipeline');
    expect(container.textContent).toContain('(Q3 2025)');
  });

  it('shows "No scope defined" when no scope data', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { scope: {} }))}</>
    );
    expect(container.textContent).toContain('No scope defined');
  });

  // --- Success Metrics section ---
  it('renders success metrics with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        successMetrics: [{
          metric: 'Monthly Active Users',
          category: 'engagement',
          target: '10,000',
          timeframe: '6 months',
          description: 'Track monthly active users',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Monthly Active Users');
    expect(container.textContent).toContain('engagement');
    expect(container.textContent).toContain('Target: 10,000');
    expect(container.textContent).toContain('(6 months)');
    expect(container.textContent).toContain('Track monthly active users');
  });

  it('shows "No success metrics defined" when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { successMetrics: [] }))}</>
    );
    expect(container.textContent).toContain('No success metrics defined');
  });

  // --- successMetrics plain-string normalization ---
  it('normalises plain-string successMetrics to objects', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        successMetrics: ['Adoption rate > 80%', '99.9% uptime'],
      }))}</>
    );
    expect(container.textContent).toContain('Adoption rate > 80%');
    expect(container.textContent).toContain('99.9% uptime');
  });

  it('handles mixed string and object successMetrics', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        successMetrics: [
          'Plain string metric',
          { metric: 'Structured metric', target: '1000', category: 'usage' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Plain string metric');
    expect(container.textContent).toContain('Structured metric');
    expect(container.textContent).toContain('Target: 1000');
  });

  // --- riskManagement.risks fallback ---
  it('renders risks from top-level risks array', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        risks: [{ risk: 'Top-level risk', probability: 'high', impact: 'medium' }],
      }))}</>
    );
    expect(container.textContent).toContain('Top-level risk');
  });

  it('falls back to riskManagement.risks when top-level risks absent', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        riskManagement: {
          risks: [
            { risk: 'Nested RM risk', probability: 'medium', impact: 'high', response: 'Mitigate', priority: 'high' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Nested RM risk');
  });

  it('prefers top-level risks over riskManagement.risks', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        risks: [{ risk: 'Top risk' }],
        riskManagement: {
          risks: [{ risk: 'Nested risk' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Top risk');
    expect(container.textContent).not.toContain('Nested risk');
  });

  it('renders riskManagement summary when present', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        riskManagement: {
          summary: 'Overall risk posture is moderate',
          risks: [{ risk: 'Some risk' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Overall risk posture is moderate');
  });

  // --- Constraints section ---
  it('renders constraints with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        constraints: [{
          constraint: 'Must use existing DB',
          type: 'technical',
          impact: 'Limits schema changes',
          mitigation: 'Use migration scripts',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('technical');
    expect(container.textContent).toContain('Must use existing DB');
    expect(container.textContent).toContain('Impact: Limits schema changes');
    expect(container.textContent).toContain('Mitigation: Use migration scripts');
  });

  it('normalizes string constraints', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        constraints: ['Budget limit', 'Timeline constraint'],
      }))}</>
    );
    expect(container.textContent).toContain('Budget limit');
    expect(container.textContent).toContain('Timeline constraint');
  });

  it('does not render constraints section when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { constraints: [] }))}</>
    );
    expect(container.textContent).not.toContain('Constraints');
  });

  // --- Assumptions section ---
  it('renders assumptions with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        assumptions: [{
          assumption: 'Users have modern browsers',
          category: 'technical',
          risk: 'IE11 users abandoned',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Users have modern browsers');
    expect(container.textContent).toContain('technical');
    expect(container.textContent).toContain('Risk if wrong: IE11 users abandoned');
  });

  it('normalizes string assumptions', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        assumptions: ['Stable API', 'Good network'],
      }))}</>
    );
    expect(container.textContent).toContain('Stable API');
    expect(container.textContent).toContain('Good network');
  });

  it('does not render assumptions section when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { assumptions: [] }))}</>
    );
    expect(container.textContent).not.toContain('Assumptions');
  });

  // --- Risks section ---
  it('renders risks with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        risks: [{
          risk: 'Key person dependency',
          probability: 'medium',
          impact: 'high',
          mitigation: 'Cross-train team members',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Key person dependency');
    expect(container.textContent).toContain('P: medium');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('Mitigation: Cross-train team members');
  });

  it('does not render risks section when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { risks: [] }))}</>
    );
    expect(container.textContent).not.toContain('Risks');
  });

  // --- Dependencies section ---
  it('renders dependencies with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        dependencies: [{
          dependency: 'Payment gateway API',
          type: 'external',
          status: 'pending',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Payment gateway API');
    expect(container.textContent).toContain('external');
    expect(container.textContent).toContain('pending');
  });

  it('does not render dependencies section when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { dependencies: [] }))}</>
    );
    expect(container.textContent).not.toContain('Dependencies');
  });

  // --- Timeline section ---
  it('renders timeline with overview, milestones, and phases', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        timeline: {
          overview: 'Q1-Q4 2025 roadmap',
          milestones: [
            { milestone: 'Alpha Release', targetDate: '2025-03-01', description: 'Internal testing' },
            { milestone: 'Beta', targetDate: '2025-06-01' },
          ],
          phases: [
            { phase: 'Discovery', duration: '4 weeks' },
            { phase: 'Development', duration: '12 weeks' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Q1-Q4 2025 roadmap');
    expect(container.textContent).toContain('Milestones');
    expect(container.textContent).toContain('Alpha Release');
    expect(container.textContent).toContain('2025-03-01');
    expect(container.textContent).toContain('Internal testing');
    expect(container.textContent).toContain('Beta');
    expect(container.textContent).toContain('2025-06-01');
    expect(container.textContent).toContain('Phases');
    expect(container.textContent).toContain('Discovery');
    expect(container.textContent).toContain('(4 weeks)');
    expect(container.textContent).toContain('Development');
    expect(container.textContent).toContain('(12 weeks)');
  });

  it('normalizes timeline milestone name→milestone and date→targetDate', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        timeline: {
          milestones: [
            { name: 'Launch', date: '2025-09-01', description: 'Public launch' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Launch');
    expect(container.textContent).toContain('2025-09-01');
    expect(container.textContent).toContain('Public launch');
  });

  it('does not render timeline when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { timeline: {} }))}</>
    );
    expect(container.textContent).not.toContain('Timeline');
  });

  // --- Stakeholders section ---
  it('renders stakeholders with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        stakeholders: [{
          role: 'Product Owner',
          name: 'Alice',
          involvement: 'decision-maker',
          responsibilities: ['Prioritize backlog', 'Accept stories'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Product Owner');
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('decision-maker');
    expect(container.textContent).toContain('Prioritize backlog, Accept stories');
  });

  it('normalizes responsibility→responsibilities[]', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        stakeholders: [{
          role: 'Tech Lead',
          name: 'Bob',
          responsibility: 'Architecture decisions',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Tech Lead');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).toContain('Architecture decisions');
  });

  it('does not render stakeholders section when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { stakeholders: [] }))}</>
    );
    expect(container.textContent).not.toContain('Stakeholders');
  });

  // --- Additional Context section ---
  it('renders additional context with all fields', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        additionalContext: {
          background: 'Legacy system replacement',
          notes: ['Started in 2024', 'Budget approved'],
          openQuestions: [
            { question: 'Which cloud provider?', status: 'open' },
            { question: 'Hire or outsource?', status: 'resolved' },
          ],
          references: [
            { title: 'RFC-001', location: 'https://docs.example.com', description: 'Architecture proposal' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Legacy system replacement');
    expect(container.textContent).toContain('Notes');
    expect(container.textContent).toContain('Started in 2024');
    expect(container.textContent).toContain('Budget approved');
    expect(container.textContent).toContain('Open Questions');
    expect(container.textContent).toContain('Which cloud provider?');
    expect(container.textContent).toContain('open');
    expect(container.textContent).toContain('Hire or outsource?');
    expect(container.textContent).toContain('resolved');
    expect(container.textContent).toContain('References');
    expect(container.textContent).toContain('RFC-001');
    expect(container.textContent).toContain('https://docs.example.com');
    expect(container.textContent).toContain('Architecture proposal');
  });

  it('normalizes string additionalContext to { background }', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        additionalContext: 'This is background information',
      }))}</>
    );
    expect(container.textContent).toContain('This is background information');
  });

  it('does not render additional context when empty', () => {
    const { container } = render(
      <>{renderProductBriefDetails(makeProps('product-brief', { additionalContext: {} }))}</>
    );
    expect(container.textContent).not.toContain('Additional Context');
  });

  // --- Edit mode tests ---
  it('renders product info edit mode with inputs', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          productName: 'MyApp',
          tagline: 'Build fast',
        }),
        handleFieldChange,
      })}</>
    );
    const nameInput = container.querySelector('input[placeholder="Product name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('MyApp');
    fireEvent.change(nameInput, { target: { value: 'NewApp' } });
    expect(handleFieldChange).toHaveBeenCalledWith('productName', 'NewApp');

    const taglineInput = container.querySelector('input[placeholder="Product tagline..."]') as HTMLInputElement;
    expect(taglineInput.value).toBe('Build fast');
  });

  it('renders vision edit mode with textareas and differentiator management', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          vision: {
            statement: 'Our vision',
            differentiators: [{ differentiator: 'AI', competitiveAdvantage: 'First mover' }],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const visionTextarea = container.querySelector('textarea[placeholder="Core vision statement"]') as HTMLTextAreaElement;
    expect(visionTextarea.value).toBe('Our vision');

    // Add differentiator
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Differentiator'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(handleFieldChange).toHaveBeenCalledWith('vision', expect.objectContaining({
      differentiators: expect.arrayContaining([expect.objectContaining({ differentiator: '', competitiveAdvantage: '' })]),
    }));
  });

  it('renders target users edit mode with updateArrayItem and addToArray', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          targetUsers: [{ persona: 'Dev', description: 'Writes code' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const personaInput = container.querySelector('input[placeholder="Persona name"]') as HTMLInputElement;
    expect(personaInput.value).toBe('Dev');
    fireEvent.change(personaInput, { target: { value: 'Designer' } });
    expect(updateArrayItem).toHaveBeenCalledWith('targetUsers', 0, expect.objectContaining({ persona: 'Designer' }));

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Target User'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('targetUsers', expect.objectContaining({ persona: '', description: '' }));
  });

  it('renders key features edit mode with priority select and add', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          keyFeatures: [{ name: 'Search', description: 'Full-text', priority: 'must-have' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const nameInput = container.querySelector('input[placeholder="Feature name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Search');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Feature'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('keyFeatures', expect.objectContaining({ name: '', description: '', priority: '' }));
  });

  it('renders scope edit mode with in-scope and out-of-scope management', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          scope: {
            overview: 'Scope overview',
            inScope: [{ item: 'Auth' }],
            outOfScope: [{ item: 'Mobile' }],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const overviewTextarea = container.querySelector('textarea[placeholder="Scope overview..."]') as HTMLTextAreaElement;
    expect(overviewTextarea.value).toBe('Scope overview');

    const addInScope = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add In-Scope Item'));
    expect(addInScope).toBeTruthy();
    fireEvent.click(addInScope!);
    expect(handleFieldChange).toHaveBeenCalledWith('scope', expect.objectContaining({
      inScope: expect.arrayContaining([expect.objectContaining({ item: '' })]),
    }));
  });

  it('renders success metrics edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          successMetrics: [{ metric: 'DAU', target: '5000', category: 'usage' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const metricInput = container.querySelector('input[placeholder="Metric name"]') as HTMLInputElement;
    expect(metricInput.value).toBe('DAU');
    fireEvent.change(metricInput, { target: { value: 'MAU' } });
    expect(updateArrayItem).toHaveBeenCalledWith('successMetrics', 0, expect.objectContaining({ metric: 'MAU' }));

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Metric'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('successMetrics', expect.objectContaining({ metric: '', target: '', category: '' }));
  });

  it('renders risks edit mode with probability and impact selects', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          risks: [{ risk: 'Data loss', probability: 'low', impact: 'critical', mitigation: 'Backups' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const riskInput = container.querySelector('input[placeholder="Risk description"]') as HTMLInputElement;
    expect(riskInput.value).toBe('Data loss');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Risk'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('risks', expect.objectContaining({ risk: '', probability: '', impact: '', mitigation: '' }));
  });

  it('renders timeline edit mode with milestones and phases', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          timeline: {
            overview: 'Timeline overview',
            milestones: [{ milestone: 'Launch', targetDate: '2025-09-01' }],
            phases: [{ phase: 'Alpha', duration: '3 months' }],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const overviewTextarea = container.querySelector('textarea[placeholder="Timeline overview..."]') as HTMLTextAreaElement;
    expect(overviewTextarea.value).toBe('Timeline overview');

    const addMilestone = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Milestone'));
    expect(addMilestone).toBeTruthy();
    fireEvent.click(addMilestone!);
    expect(handleFieldChange).toHaveBeenCalledWith('timeline', expect.objectContaining({
      milestones: expect.arrayContaining([expect.objectContaining({ milestone: '', targetDate: '' })]),
    }));

    const addPhase = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Phase'));
    expect(addPhase).toBeTruthy();
    fireEvent.click(addPhase!);
    expect(handleFieldChange).toHaveBeenCalledWith('timeline', expect.objectContaining({
      phases: expect.arrayContaining([expect.objectContaining({ phase: '', duration: '' })]),
    }));
  });

  it('renders stakeholders edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          stakeholders: [{ role: 'PM', name: 'Carol', involvement: 'sponsor', responsibilities: ['Budget'] }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const roleInput = container.querySelector('input[placeholder="Role"]') as HTMLInputElement;
    expect(roleInput.value).toBe('PM');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Stakeholder'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('stakeholders', expect.objectContaining({ role: '', name: '', involvement: '' }));
  });

  it('renders additional context edit mode with notes and open questions', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          additionalContext: {
            background: 'Some background',
            notes: ['Note 1'],
            openQuestions: [{ question: 'Q1', status: 'open' }],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const bgTextarea = container.querySelector('textarea[placeholder="Background context..."]') as HTMLTextAreaElement;
    expect(bgTextarea.value).toBe('Some background');

    const addNote = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Note'));
    expect(addNote).toBeTruthy();
    fireEvent.click(addNote!);
    expect(handleFieldChange).toHaveBeenCalledWith('additionalContext', expect.objectContaining({
      notes: expect.arrayContaining(['']),
    }));

    const addQuestion = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Question'));
    expect(addQuestion).toBeTruthy();
    fireEvent.click(addQuestion!);
    expect(handleFieldChange).toHaveBeenCalledWith('additionalContext', expect.objectContaining({
      openQuestions: expect.arrayContaining([expect.objectContaining({ question: '', status: 'open' })]),
    }));
  });

  it('renders market context edit mode with competitors and trends', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          marketContext: {
            overview: 'Market overview',
            competitors: [{ name: 'Rival', description: 'Big rival' }],
            trends: [{ trend: 'Cloud native', impact: 'Major' }],
          },
        }),
        handleFieldChange,
      })}</>
    );
    const overviewTextarea = container.querySelector('textarea[placeholder="Market overview..."]') as HTMLTextAreaElement;
    expect(overviewTextarea.value).toBe('Market overview');

    const addComp = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Competitor'));
    expect(addComp).toBeTruthy();
    fireEvent.click(addComp!);
    expect(handleFieldChange).toHaveBeenCalledWith('marketContext', expect.objectContaining({
      competitors: expect.arrayContaining([expect.objectContaining({ name: '', description: '' })]),
    }));

    const addTrend = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Trend'));
    expect(addTrend).toBeTruthy();
    fireEvent.click(addTrend!);
    expect(handleFieldChange).toHaveBeenCalledWith('marketContext', expect.objectContaining({
      trends: expect.arrayContaining([expect.objectContaining({ trend: '', impact: '' })]),
    }));
  });

  it('renders constraints edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          constraints: [{ constraint: 'Budget limit', type: 'business', impact: 'Reduced scope' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const constraintInput = container.querySelector('input[placeholder="Constraint"]') as HTMLInputElement;
    expect(constraintInput.value).toBe('Budget limit');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Constraint'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('constraints', expect.objectContaining({ constraint: '', type: '', impact: '' }));
  });

  it('renders assumptions edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          assumptions: [{ assumption: 'Stable API', category: 'technical' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const assumptionInput = container.querySelector('input[placeholder="Assumption"]') as HTMLInputElement;
    expect(assumptionInput.value).toBe('Stable API');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Assumption'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('assumptions', expect.objectContaining({ assumption: '', category: '' }));
  });

  it('renders dependencies edit mode', () => {
    const updateArrayItem = vi.fn();
    const addToArray = vi.fn();
    const { container } = render(
      <>{renderProductBriefDetails({
        ...makeEditProps('product-brief', {
          dependencies: [{ dependency: 'Auth service', type: 'internal', status: 'in-progress' }],
        }),
        updateArrayItem,
        addToArray,
      })}</>
    );
    const depInput = container.querySelector('input[placeholder="Dependency"]') as HTMLInputElement;
    expect(depInput.value).toBe('Auth service');

    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Add Dependency'));
    fireEvent.click(addBtn!);
    expect(addToArray).toHaveBeenCalledWith('dependencies', expect.objectContaining({ dependency: '', type: '', status: '' }));
  });

  // --- Smoke: renders full product brief without crashing ---
  it('renders full product brief without crashing', () => {
    expect(() => render(
      <>{renderProductBriefDetails(makeProps('product-brief', {
        productName: 'BMAD',
        tagline: 'Test',
        vision: { statement: 'V', mission: 'M', problemStatement: 'P', proposedSolution: 'S', uniqueValueProposition: 'U', differentiators: [{ differentiator: 'D' }], problemDetails: [{ problem: 'P' }], solutionApproach: [{ aspect: 'A', description: 'D' }] },
        targetUsers: [{ persona: 'Dev', description: 'D', technicalProficiency: 'high', goals: ['G'], painPoints: ['P'] }],
        marketContext: { overview: 'O', currentLandscape: 'L', opportunity: 'Op', targetMarket: 'TM', marketSize: { tam: 'T', sam: 'S', som: 'So' }, competitiveLandscape: 'CL', competitors: [{ name: 'C', description: 'D', strengths: 'S', weaknesses: 'W' }], trends: [{ trend: 'T', impact: 'I' }] },
        keyFeatures: [{ name: 'F', priority: 'must-have', complexity: 'C', description: 'D', userBenefit: 'B' }],
        scope: { overview: 'O', mvpDefinition: { description: 'D', features: ['F'] }, inScope: [{ item: 'I', priority: 'P' }], outOfScope: [{ item: 'O', reason: 'R' }], futureConsiderations: [{ item: 'FC', timeframe: 'T' }] },
        successMetrics: [{ metric: 'M', category: 'C', target: 'T', timeframe: 'TF', description: 'D' }],
        constraints: [{ constraint: 'C', type: 'T', impact: 'I', mitigation: 'M' }],
        assumptions: [{ assumption: 'A', category: 'C', risk: 'R' }],
        risks: [{ risk: 'R', probability: 'medium', impact: 'high', mitigation: 'M' }],
        dependencies: [{ dependency: 'D', type: 'T', status: 'pending' }],
        timeline: { overview: 'O', milestones: [{ milestone: 'M', targetDate: 'D', description: 'Desc' }], phases: [{ phase: 'P', duration: 'D' }] },
        stakeholders: [{ role: 'R', name: 'N', involvement: 'sponsor', responsibilities: ['Resp'] }],
        additionalContext: { background: 'B', notes: ['N'], openQuestions: [{ question: 'Q', status: 'open' }], references: [{ title: 'T', location: 'L', description: 'D' }] },
      }))}</>
    )).not.toThrow();
  });
});
