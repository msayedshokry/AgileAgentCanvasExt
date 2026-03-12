/**
 * Smoke tests for tea-renderers.tsx
 *
 * Each exported renderer is tested with minimal props to verify it renders
 * without crashing, plus a second test with representative data.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Artifact } from '../../types';
import type { RendererProps } from './shared';
import {
  renderTraceabilityMatrixDetails,
  renderCiPipelineDetails,
  renderAutomationSummaryDetails,
  renderAtddChecklistDetails,
  renderNfrAssessmentDetails,
} from './tea-renderers';

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

describe('tea-renderers smoke tests', () => {
  // Traceability Matrix
  it('renderTraceabilityMatrixDetails — empty', () => {
    expect(() => render(<>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix'))}</>)).not.toThrow();
  });

  it('renderTraceabilityMatrixDetails — with data', () => {
    const { container } = render(
      <>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix', {
        storyInfo: { storyId: 'S-1', storyTitle: 'Login Story', epicId: 'E-1' },
        traceability: {
          overview: 'Full traceability for login',
          coverageSummary: {
            overall: { total: 10, covered: 8, percentage: 80 },
            p0: { total: 3, covered: 3, percentage: 100 },
          },
          detailedMapping: [{ criterionId: 'AC1', criterion: 'User can log in', coverage: 'Full' }],
          gapAnalysis: { summary: 'Minor gaps in P2' },
        },
        gateDecision: { decision: 'Approved', rationale: 'Sufficient coverage' },
      }))}</>
    );
    expect(container.textContent).toContain('Login Story');
  });

  // CI Pipeline
  it('renderCiPipelineDetails — empty', () => {
    expect(() => render(<>{renderCiPipelineDetails(makeProps('ci-pipeline'))}</>)).not.toThrow();
  });

  it('renderCiPipelineDetails — with data', () => {
    const { container } = render(
      <>{renderCiPipelineDetails(makeProps('ci-pipeline', {
        platform: { name: 'GitHub Actions', configFile: '.github/workflows/ci.yml' },
        pipeline: { name: 'CI', triggers: ['push', 'pull_request'] },
        jobs: [{ id: 'build', name: 'Build', steps: [{ name: 'Checkout', uses: 'actions/checkout@v4' }] }],
        qualityGates: [{ name: 'Coverage', threshold: '80%', blocking: true }],
      }))}</>
    );
    expect(container.textContent).toContain('GitHub Actions');
  });

  // Automation Summary
  it('renderAutomationSummaryDetails — empty', () => {
    expect(() => render(<>{renderAutomationSummaryDetails(makeProps('automation-summary'))}</>)).not.toThrow();
  });

  it('renderAutomationSummaryDetails — with data', () => {
    const { container } = render(
      <>{renderAutomationSummaryDetails(makeProps('automation-summary', {
        summary: { scope: 'Full project', framework: 'Vitest', totalTestsCreated: 50 },
        coverageAnalysis: { gaps: [{ area: 'Auth', priority: 'high' }] },
        testsCreated: [{ filePath: 'src/test.ts', testType: 'unit', testCount: 10 }],
      }))}</>
    );
    expect(container.textContent).toContain('Vitest');
  });

  // ATDD Checklist
  it('renderAtddChecklistDetails — empty', () => {
    expect(() => render(<>{renderAtddChecklistDetails(makeProps('atdd-checklist'))}</>)).not.toThrow();
  });

  it('renderAtddChecklistDetails — with data', () => {
    const { container } = render(
      <>{renderAtddChecklistDetails(makeProps('atdd-checklist', {
        storyInfo: { storyId: 'S-1', storyTitle: 'Login', businessValue: 'High' },
        storySummary: 'User can log in with credentials',
        acceptanceCriteria: [{ id: 'AC1', description: 'Valid login', testApproach: 'E2E' }],
        testScenarios: [{ id: 'TS1', name: 'Happy path login', type: 'e2e' }],
        completionStatus: { totalCriteria: 5, coveredCriteria: 4, coveragePercentage: '80%' },
      }))}</>
    );
    expect(container.textContent).toContain('Login');
  });

  // NFR Assessment
  it('renderNfrAssessmentDetails — empty', () => {
    expect(() => render(<>{renderNfrAssessmentDetails(makeProps('nfr-assessment'))}</>)).not.toThrow();
  });

  it('renderNfrAssessmentDetails — with data', () => {
    const { container } = render(
      <>{renderNfrAssessmentDetails(makeProps('nfr-assessment', {
        featureInfo: { featureName: 'Auth Module', overallStatus: 'Pass' },
        executiveSummary: 'All NFRs met',
        nfrRequirements: [{ id: 'NFR1', category: 'Performance', requirement: 'Response < 200ms' }],
        assessments: {
          performance: { status: 'Pass', summary: 'All targets met' },
          security: { status: 'Pass', summary: 'No vulnerabilities' },
        },
        recommendations: [{ recommendation: 'Add caching', priority: 'medium' }],
      }))}</>
    );
    expect(container.textContent).toContain('Auth Module');
  });
});

// ── Edit mode smoke tests ──────────────────────────────────────────────────

describe('tea-renderers edit mode', () => {
  it('renderTraceabilityMatrixDetails in edit mode', () => {
    expect(() => render(<>{renderTraceabilityMatrixDetails(makeEditProps('traceability-matrix'))}</>)).not.toThrow();
  });

  it('renderCiPipelineDetails in edit mode', () => {
    expect(() => render(<>{renderCiPipelineDetails(makeEditProps('ci-pipeline'))}</>)).not.toThrow();
  });

  it('renderAtddChecklistDetails in edit mode', () => {
    expect(() => render(<>{renderAtddChecklistDetails(makeEditProps('atdd-checklist'))}</>)).not.toThrow();
  });

  it('renderNfrAssessmentDetails in edit mode', () => {
    expect(() => render(<>{renderNfrAssessmentDetails(makeEditProps('nfr-assessment'))}</>)).not.toThrow();
  });
});

// ── Deep tests: Traceability Matrix ────────────────────────────────────────

describe('renderTraceabilityMatrixDetails deep', () => {
  it('renders Coverage Summary section with overall stats', () => {
    const { container } = render(
      <>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix', {
        traceability: {
          coverageSummary: {
            overall: { total: 20, covered: 16, percentage: 80 },
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('80%');
    expect(container.textContent).toContain('16');
    expect(container.textContent).toContain('20');
  });

  it('renders priority-level coverage breakdowns (P0-P3)', () => {
    const { container } = render(
      <>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix', {
        traceability: {
          coverageSummary: {
            overall: { total: 10, covered: 10, percentage: 100 },
            p0: { total: 3, covered: 3, percentage: 100, status: 'PASS' },
            p1: { total: 4, covered: 4, percentage: 100 },
            p2: { total: 2, covered: 2, percentage: 100 },
            p3: { total: 1, covered: 1, percentage: 100 },
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('P0');
    expect(container.textContent).toContain('P1');
    expect(container.textContent).toContain('P2');
    expect(container.textContent).toContain('P3');
    expect(container.textContent).toContain('PASS');
  });

  it('renders Detailed Mapping items with criterion info', () => {
    const { container } = render(
      <>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix', {
        traceability: {
          detailedMapping: [
            { criterionId: 'AC-1', criterion: 'User authentication', coverage: 'full' },
            { criterionId: 'AC-2', criterion: 'Session management', coverage: 'partial' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('AC-1');
    expect(container.textContent).toContain('User authentication');
    expect(container.textContent).toContain('AC-2');
    expect(container.textContent).toContain('Session management');
  });

  it('renders Detailed Mapping tests within a criterion', () => {
    const { container } = render(
      <>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix', {
        traceability: {
          detailedMapping: [{
            criterionId: 'AC-1',
            criterion: 'Login flow',
            coverage: 'full',
            tests: [
              { testId: 'T-1', testName: 'Login happy path', testLevel: 'e2e', status: 'passing' },
              { testId: 'T-2', testName: 'Login error', testLevel: 'unit', status: 'failing' },
            ],
          }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('T-1');
    expect(container.textContent).toContain('Login happy path');
    expect(container.textContent).toContain('T-2');
    expect(container.textContent).toContain('Login error');
  });

  it('renders Gap Analysis with summary and critical gaps', () => {
    const { container } = render(
      <>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix', {
        traceability: {
          gapAnalysis: {
            summary: 'Two critical gaps found',
            critical: [
              { gapId: 'G-1', gap: 'Missing auth tests', impact: 'High risk', recommendation: 'Add e2e tests' },
            ],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Two critical gaps found');
    expect(container.textContent).toContain('G-1');
    expect(container.textContent).toContain('Missing auth tests');
    expect(container.textContent).toContain('Add e2e tests');
  });

  it('renders Gate Decision with PASS status', () => {
    const { container } = render(
      <>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix', {
        gateDecision: {
          decision: 'PASS',
          rationale: 'All criteria met',
        },
      }))}</>
    );
    expect(container.textContent).toContain('PASS');
    expect(container.textContent).toContain('All criteria met');
  });

  it('renders Gate Decision with FAIL status', () => {
    const { container } = render(
      <>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix', {
        gateDecision: {
          decision: 'FAIL',
          rationale: 'Coverage below threshold',
        },
      }))}</>
    );
    expect(container.textContent).toContain('FAIL');
    expect(container.textContent).toContain('Coverage below threshold');
  });

  it('renders Gate Decision evidence summary', () => {
    const { container } = render(
      <>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix', {
        gateDecision: {
          decision: 'PASS',
          evidenceSummary: {
            testExecution: { passed: 48, failed: 2 },
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Passed: 48');
    expect(container.textContent).toContain('Failed: 2');
  });

  it('renders Sign Off section', () => {
    const { container } = render(
      <>{renderTraceabilityMatrixDetails(makeProps('traceability-matrix', {
        signOff: {
          signedBy: 'Jane Doe',
          date: '2025-01-15',
          role: 'QA Lead',
        },
      }))}</>
    );
    expect(container.textContent).toContain('Jane Doe');
  });
});

// ── Deep tests: CI Pipeline ────────────────────────────────────────────────

describe('renderCiPipelineDetails deep', () => {
  it('renders Platform section with name', () => {
    const { container } = render(
      <>{renderCiPipelineDetails(makeProps('ci-pipeline', {
        platform: { name: 'GitLab CI', configFile: '.gitlab-ci.yml' },
      }))}</>
    );
    expect(container.textContent).toContain('GitLab CI');
    expect(container.textContent).toContain('.gitlab-ci.yml');
  });

  it('renders Jobs section with job names', () => {
    const { container } = render(
      <>{renderCiPipelineDetails(makeProps('ci-pipeline', {
        jobs: [
          { id: 'build', name: 'Build', steps: [{ name: 'Compile', uses: 'run' }] },
          { id: 'test', name: 'Test Suite', steps: [{ name: 'Run tests', uses: 'vitest' }] },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Build');
    expect(container.textContent).toContain('Test Suite');
  });

  it('renders Quality Gates items', () => {
    const { container } = render(
      <>{renderCiPipelineDetails(makeProps('ci-pipeline', {
        qualityGates: [
          { name: 'Code Coverage', threshold: '80%', blocking: true },
          { name: 'Lint Pass', threshold: '0 errors', blocking: true },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Code Coverage');
    expect(container.textContent).toContain('80%');
    expect(container.textContent).toContain('Lint Pass');
  });

  it('renders Secrets Required items', () => {
    const { container } = render(
      <>{renderCiPipelineDetails(makeProps('ci-pipeline', {
        secrets: [
          { name: 'NPM_TOKEN', description: 'npm publish token' },
          { name: 'DEPLOY_KEY', description: 'deployment SSH key' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('NPM_TOKEN');
    expect(container.textContent).toContain('DEPLOY_KEY');
  });
});

// ── Deep tests: Automation Summary ─────────────────────────────────────────

describe('renderAutomationSummaryDetails deep', () => {
  it('renders Summary section with framework and scope', () => {
    const { container } = render(
      <>{renderAutomationSummaryDetails(makeProps('automation-summary', {
        summary: { scope: 'Full regression suite', framework: 'Playwright', totalTestsCreated: 120 },
      }))}</>
    );
    expect(container.textContent).toContain('Full regression suite');
    expect(container.textContent).toContain('Playwright');
    expect(container.textContent).toContain('120');
  });

  it('renders Coverage Analysis section', () => {
    const { container } = render(
      <>{renderAutomationSummaryDetails(makeProps('automation-summary', {
        summary: { scope: 'Tests' },
        coverageAnalysis: { baseline: { statement: '60%' }, target: { statement: '85%' } },
      }))}</>
    );
    expect(container.textContent).toContain('60%');
    expect(container.textContent).toContain('85%');
  });

  it('renders Tests Created items', () => {
    const { container } = render(
      <>{renderAutomationSummaryDetails(makeProps('automation-summary', {
        testsCreated: [
          { filePath: 'src/auth.test.ts', testType: 'unit', testCount: 15 },
          { filePath: 'src/api.test.ts', testType: 'integration', testCount: 8 },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('src/auth.test.ts');
    expect(container.textContent).toContain('src/api.test.ts');
  });

  it('renders Recommendations items', () => {
    const { container } = render(
      <>{renderAutomationSummaryDetails(makeProps('automation-summary', {
        recommendations: [
          { recommendation: 'Add snapshot tests', priority: 'medium' },
          { recommendation: 'Improve test isolation', priority: 'high' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Add snapshot tests');
    expect(container.textContent).toContain('Improve test isolation');
  });
});

// ── Deep tests: ATDD Checklist ─────────────────────────────────────────────

describe('renderAtddChecklistDetails deep', () => {
  it('renders Story Info section', () => {
    const { container } = render(
      <>{renderAtddChecklistDetails(makeProps('atdd-checklist', {
        storyInfo: { storyId: 'US-42', storyTitle: 'Password Reset', businessValue: 'High' },
      }))}</>
    );
    expect(container.textContent).toContain('US-42');
    expect(container.textContent).toContain('Password Reset');
  });

  it('renders Acceptance Criteria items', () => {
    const { container } = render(
      <>{renderAtddChecklistDetails(makeProps('atdd-checklist', {
        acceptanceCriteria: [
          { id: 'AC-1', description: 'User receives reset email', testApproach: 'E2E' },
          { id: 'AC-2', description: 'Token expires after 1 hour', testApproach: 'Unit' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('AC-1');
    expect(container.textContent).toContain('User receives reset email');
    expect(container.textContent).toContain('AC-2');
    expect(container.textContent).toContain('Token expires after 1 hour');
  });

  it('renders Implementation Checklist items', () => {
    const { container } = render(
      <>{renderAtddChecklistDetails(makeProps('atdd-checklist', {
        implementationChecklist: [
          { item: 'Create reset endpoint', completed: true },
          { item: 'Add email template', completed: false },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Create reset endpoint');
    expect(container.textContent).toContain('Add email template');
  });

  it('renders completion status badge', () => {
    const { container } = render(
      <>{renderAtddChecklistDetails(makeProps('atdd-checklist', {
        completionStatus: {
          status: 'in-progress',
          totalCriteria: 5,
          coveredCriteria: 3,
          coveragePercentage: '60%',
        },
      }))}</>
    );
    expect(container.textContent).toContain('in-progress');
  });
});

// ── Deep tests: NFR Assessment ─────────────────────────────────────────────

describe('renderNfrAssessmentDetails deep', () => {
  it('renders Feature Info section', () => {
    const { container } = render(
      <>{renderNfrAssessmentDetails(makeProps('nfr-assessment', {
        featureInfo: { featureName: 'Payment Gateway', overallStatus: 'Pass' },
      }))}</>
    );
    expect(container.textContent).toContain('Payment Gateway');
  });

  it('renders Performance assessment', () => {
    const { container } = render(
      <>{renderNfrAssessmentDetails(makeProps('nfr-assessment', {
        assessments: {
          performance: { status: 'Pass', summary: 'All latency targets met' },
        },
      }))}</>
    );
    expect(container.textContent).toContain('All latency targets met');
  });

  it('renders Security assessment', () => {
    const { container } = render(
      <>{renderNfrAssessmentDetails(makeProps('nfr-assessment', {
        assessments: {
          security: { status: 'Fail', summary: 'SQL injection vulnerability found' },
        },
      }))}</>
    );
    expect(container.textContent).toContain('SQL injection vulnerability found');
  });

  it('renders Findings Summary categories', () => {
    const { container } = render(
      <>{renderNfrAssessmentDetails(makeProps('nfr-assessment', {
        findingsSummary: {
          categories: [
            { category: 'Performance', status: 'Pass', count: 3 },
            { category: 'Security', status: 'Fail', count: 1 },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Performance');
    expect(container.textContent).toContain('Security');
  });

  it('renders Quick Wins items', () => {
    const { container } = render(
      <>{renderNfrAssessmentDetails(makeProps('nfr-assessment', {
        quickWins: [
          { improvement: 'Enable gzip compression', effort: 'Low', impact: 'Medium' },
          { improvement: 'Add rate limiting', effort: 'Medium', impact: 'High' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Enable gzip compression');
    expect(container.textContent).toContain('Add rate limiting');
  });
});
