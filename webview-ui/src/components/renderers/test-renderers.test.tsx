/**
 * Smoke tests for test-renderers.tsx
 *
 * Each exported renderer is tested with minimal props to verify it renders
 * without crashing, plus a second test with representative data.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Artifact } from '../../types';
import type { RendererProps } from './shared';
import {
  renderTestDesignDetails,
  renderTestReviewDetails,
  renderTestFrameworkDetails,
  renderTestSummaryDetails,
  renderTestCoverageDetails,
} from './test-renderers';

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

describe('test-renderers smoke tests', () => {
  // Test Design
  it('renderTestDesignDetails — empty', () => {
    const { container } = render(<>{renderTestDesignDetails(makeProps('test-design'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestDesignDetails — with data', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        epicInfo: { epicId: 'E1', epicTitle: 'Auth Epic', storyCount: 5 },
        summary: {
          scope: 'Authentication flows',
          objectives: ['Verify login', 'Verify logout'],
          riskSummary: 'Medium risk in token handling',
          approach: 'BDD-first',
        },
        riskAssessment: {
          overview: 'Moderate risk',
          highPriority: [{ riskId: 'R1', description: 'Token expiry', probability: 'high', impact: 'high' }],
        },
        coveragePlan: {
          overview: 'Target 90% coverage',
          coverageGoals: { codeStatement: '90%', codeBranch: '85%' },
        },
        qualityGateCriteria: [{ criterion: 'All tests pass', threshold: '100%', mandatory: true }],
      }))}</>
    );
    expect(container.textContent).toContain('Authentication flows');
  });

  // Test Review
  it('renderTestReviewDetails — empty', () => {
    const { container } = render(<>{renderTestReviewDetails(makeProps('test-review'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestReviewDetails — with data', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        reviewInfo: { qualityScore: 85, scope: 'Sprint 3 tests', reviewer: 'Alice' },
        executiveSummary: {
          assessment: 'Good overall quality',
          recommendation: 'Proceed with minor fixes',
          strengths: [{ strength: 'Good coverage', impact: 'Fewer bugs' }],
          weaknesses: [{ weakness: 'Missing edge cases', remediation: 'Add negative tests' }],
        },
        qualityAssessment: {
          criteria: [{ criterion: 'BDD format', score: 8, weight: 10, findings: 'Mostly compliant' }],
        },
        qualityScoreBreakdown: {
          totalScore: 85,
          maxScore: 100,
          passThreshold: 70,
          passed: true,
          categories: [{ category: 'Coverage', score: 90, weight: 40 }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Good overall quality');
  });

  // Test Framework
  it('renderTestFrameworkDetails — empty', () => {
    const { container } = render(<>{renderTestFrameworkDetails(makeProps('test-framework'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestFrameworkDetails — with data', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        framework: { name: 'Vitest', version: '4.0', selectionRationale: 'Fast and modern' },
        configuration: {
          configFile: 'vitest.config.ts',
          typescript: true,
          testMatch: ['**/*.test.ts'],
          reporters: ['default', 'json'],
        },
        directoryStructure: {
          rootDir: 'src/',
          directories: [{ path: 'src/test', purpose: 'Test utilities' }],
        },
        fixtures: [{ name: 'mockArtifact', purpose: 'Test artifact data' }],
        helpers: [{ name: 'renderWithProviders', purpose: 'Wrapped render' }],
        dependencies: {
          dev: [{ name: 'vitest', version: '4.0.18', purpose: 'Test runner' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Vitest');
  });

  // Test Summary
  it('renderTestSummaryDetails — empty', () => {
    const { container } = render(<>{renderTestSummaryDetails(makeProps('test-summary'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestSummaryDetails — with data', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        summary: {
          frameworkUsed: 'Vitest',
          totalTestsGenerated: 459,
          totalFilesCreated: 12,
          scope: 'All tests passing for Sprint 3',
          testingApproach: 'BDD-first',
        },
      }))}</>
    );
    expect(container.textContent).toContain('All tests passing');
  });

  // Test Coverage
  it('renderTestCoverageDetails — empty', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        testCases: [],
        totalCount: 0,
        passCount: 0,
        failCount: 0,
        draftCount: 0,
      }))}</>
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestCoverageDetails — with test cases', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        storyId: 'S-1',
        testCases: [
          { id: 'TC1', title: 'Login test', status: 'passed', type: 'e2e', description: 'Verify login flow' },
          { id: 'TC2', title: 'Logout test', status: 'draft', type: 'e2e' },
        ],
        totalCount: 2,
        passCount: 1,
        failCount: 0,
        draftCount: 1,
      }))}</>
    );
    expect(container.textContent).toContain('Login test');
  });
});

// ── Edit mode smoke tests ──────────────────────────────────────────────────

describe('test-renderers edit mode', () => {
  it('renderTestDesignDetails in edit mode', () => {
    const { container } = render(<>{renderTestDesignDetails(makeEditProps('test-design'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestReviewDetails in edit mode', () => {
    const { container } = render(<>{renderTestReviewDetails(makeEditProps('test-review'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestFrameworkDetails in edit mode', () => {
    const { container } = render(<>{renderTestFrameworkDetails(makeEditProps('test-framework'))}</>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renderTestCoverageDetails in edit mode', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeEditProps('test-coverage', {
        testCases: [{ id: 'TC1', title: 'Test', status: 'draft' }],
        totalCount: 1,
        passCount: 0,
        failCount: 0,
        draftCount: 1,
      }))}</>
    );
    expect(container.firstChild).toBeTruthy();
  });
});

// ── Deep tests: Test Design ────────────────────────────────────────────────

describe('renderTestDesignDetails deep', () => {
  it('renders Summary section with scope and approach', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        summary: {
          scope: 'E2E authentication flows',
          approach: 'BDD with Gherkin',
          objectives: ['Verify login', 'Verify MFA'],
          riskSummary: 'Token handling is high risk',
        },
      }))}</>
    );
    expect(container.textContent).toContain('E2E authentication flows');
    expect(container.textContent).toContain('BDD with Gherkin');
  });

  it('renders Coverage Plan P0 items', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        coveragePlan: {
          p0: [
            { id: 'CP-1', requirement: 'Login must work', testLevel: 'e2e', testType: 'functional' },
            { id: 'CP-2', requirement: 'MFA validation', testLevel: 'integration' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('CP-1');
    expect(container.textContent).toContain('Login must work');
    expect(container.textContent).toContain('CP-2');
    expect(container.textContent).toContain('MFA validation');
  });

  it('renders Coverage Plan across multiple priorities', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        coveragePlan: {
          p0: [{ id: 'P0-1', requirement: 'Critical path' }],
          p1: [{ id: 'P1-1', requirement: 'High priority item' }],
          p2: [{ id: 'P2-1', requirement: 'Medium item' }],
          p3: [{ id: 'P3-1', requirement: 'Low priority' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('P0-1');
    expect(container.textContent).toContain('P1-1');
    expect(container.textContent).toContain('P2-1');
    expect(container.textContent).toContain('P3-1');
  });

  it('renders Test Cases with IDs and titles', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        testCases: [
          { id: 'TC-001', title: 'Valid login flow', type: 'e2e', description: 'End to end login test' },
          { id: 'TC-002', title: 'Invalid password', type: 'negative', description: 'Wrong password test' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('TC-001');
    expect(container.textContent).toContain('Valid login flow');
    expect(container.textContent).toContain('TC-002');
    expect(container.textContent).toContain('Invalid password');
  });

  it('renders Risk Assessment with high priority items', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        riskAssessment: {
          overview: 'Two high-risk areas identified',
          highPriority: [
            { riskId: 'R-1', description: 'Token expiry handling', probability: 'high', impact: 'high' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Two high-risk areas');
    expect(container.textContent).toContain('Token expiry handling');
  });

  it('renders Quality Gate Criteria', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        qualityGateCriteria: [
          { criterion: 'All P0 tests pass', threshold: '100%', mandatory: true },
          { criterion: 'Code coverage', threshold: '80%', mandatory: false },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('All P0 tests pass');
    expect(container.textContent).toContain('100%');
    expect(container.textContent).toContain('Code coverage');
    expect(container.textContent).toContain('80%');
  });
});

// ── Deep tests: Test Review ────────────────────────────────────────────────

describe('renderTestReviewDetails deep', () => {
  it('renders review info with quality score', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        reviewInfo: { qualityScore: 92, scope: 'Sprint 5 tests', reviewer: 'Alice' },
      }))}</>
    );
    expect(container.textContent).toContain('92');
    expect(container.textContent).toContain('Alice');
  });

  it('renders Critical Issues items', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        criticalIssues: [
          { issue: 'Missing error boundary test', severity: 'high', recommendation: 'Add immediately' },
          { issue: 'Flaky network test', severity: 'medium', recommendation: 'Add retry logic' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Missing error boundary test');
    expect(container.textContent).toContain('Flaky network test');
  });

  it('renders Recommendations items', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        recommendations: [
          { recommendation: 'Add snapshot tests', priority: 'medium', category: 'Coverage' },
          { recommendation: 'Implement visual regression', priority: 'low', category: 'Quality' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Add snapshot tests');
    expect(container.textContent).toContain('Implement visual regression');
  });

  it('renders Decision with verdict', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        decision: {
          verdict: 'Approved with conditions',
          conditions: ['Fix flaky tests', 'Add missing edge cases'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Approved with conditions');
  });
});

// ── Deep tests: Test Framework ─────────────────────────────────────────────

describe('renderTestFrameworkDetails deep', () => {
  it('renders framework name and type', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        framework: { name: 'Playwright', type: 'E2E', version: '1.40.0' },
      }))}</>
    );
    expect(container.textContent).toContain('Playwright');
    expect(container.textContent).toContain('E2E');
    expect(container.textContent).toContain('1.40.0');
  });

  it('renders Configuration section with key-value pairs', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        configuration: {
          configFile: 'playwright.config.ts',
          typescript: true,
          baseUrl: 'http://localhost:3000',
        },
      }))}</>
    );
    expect(container.textContent).toContain('playwright.config.ts');
    expect(container.textContent).toContain('Yes');
    expect(container.textContent).toContain('http://localhost:3000');
  });

  it('renders Dependencies section with production and dev deps', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        dependencies: {
          production: [{ name: 'playwright', version: '1.40.0', purpose: 'E2E testing' }],
          development: [{ name: 'typescript', version: '5.3.0', purpose: 'Type checking' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('playwright');
    expect(container.textContent).toContain('1.40.0');
    expect(container.textContent).toContain('typescript');
  });

  it('renders Best Practices items', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        bestPractices: [
          { practice: 'Use page objects', implementation: 'Create POM classes for each page' },
          { practice: 'Parallel execution', implementation: 'Configure workers in config' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Use page objects');
    expect(container.textContent).toContain('Create POM classes');
    expect(container.textContent).toContain('Parallel execution');
  });
});

// ── Deep tests: Test Summary ───────────────────────────────────────────────

describe('renderTestSummaryDetails deep', () => {
  it('renders summary stats with framework and total tests', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        summary: {
          frameworkUsed: 'Jest',
          totalTestsGenerated: 350,
          totalFilesCreated: 25,
          scope: 'Complete API test suite',
        },
      }))}</>
    );
    expect(container.textContent).toContain('Jest');
    expect(container.textContent).toContain('350');
    expect(container.textContent).toContain('25');
    expect(container.textContent).toContain('Complete API test suite');
  });

  it('renders Coverage Analysis section', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        coverageAnalysis: {
          priorCoverage: { statement: '45%', branch: '40%' },
          targetCoverage: { statement: '80%', branch: '75%' },
          gapsIdentified: [
            { area: 'Error handling', priority: 'high', description: 'No tests for 500 errors' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('45%');
    expect(container.textContent).toContain('80%');
    expect(container.textContent).toContain('Error handling');
  });

  it('renders Generated Tests items', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        generatedTests: [
          { filePath: 'tests/auth.spec.ts', testCount: 15, testType: 'e2e' },
          { filePath: 'tests/api.spec.ts', testCount: 30, testType: 'integration' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('tests/auth.spec.ts');
    expect(container.textContent).toContain('15');
    expect(container.textContent).toContain('tests/api.spec.ts');
    expect(container.textContent).toContain('30');
  });

  it('renders Recommendations', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        recommendations: [
          { area: 'Performance', recommendation: 'Add load tests', priority: 'high', effort: 'medium' },
          { area: 'Security', recommendation: 'Add pen tests', priority: 'medium', effort: 'high' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Performance');
    expect(container.textContent).toContain('Add load tests');
    expect(container.textContent).toContain('Security');
  });
});

// ── Deep tests: Test Coverage ──────────────────────────────────────────────

describe('renderTestCoverageDetails deep', () => {
  it('renders Coverage Summary with pass/fail counts', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 50,
        passCount: 42,
        failCount: 5,
        draftCount: 3,
        testCases: [],
      }))}</>
    );
    expect(container.textContent).toContain('50 total');
    expect(container.textContent).toContain('42 pass');
    expect(container.textContent).toContain('5 fail');
    expect(container.textContent).toContain('3 draft');
  });

  it('renders Pass Rate percentage correctly', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 10,
        passCount: 8,
        failCount: 2,
        draftCount: 0,
        testCases: [],
      }))}</>
    );
    expect(container.textContent).toContain('80%');
  });

  it('renders 0% pass rate when totalCount is 0', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 0,
        passCount: 0,
        failCount: 0,
        draftCount: 0,
        testCases: [],
      }))}</>
    );
    expect(container.textContent).toContain('0%');
  });

  it('renders Test Cases with IDs and titles', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 3,
        passCount: 2,
        failCount: 1,
        draftCount: 0,
        testCases: [
          { id: 'TC-1', title: 'Login test', status: 'passed', type: 'e2e' },
          { id: 'TC-2', title: 'Logout test', status: 'passed', type: 'e2e' },
          { id: 'TC-3', title: 'Error test', status: 'failed', type: 'negative' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('TC-1');
    expect(container.textContent).toContain('Login test');
    expect(container.textContent).toContain('TC-2');
    expect(container.textContent).toContain('TC-3');
    expect(container.textContent).toContain('Error test');
  });

  it('renders test case status badges', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 2,
        passCount: 1,
        failCount: 1,
        draftCount: 0,
        testCases: [
          { id: 'TC-1', title: 'Pass test', status: 'passed', type: 'unit' },
          { id: 'TC-2', title: 'Fail test', status: 'failed', type: 'unit' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('passed');
    expect(container.textContent).toContain('failed');
  });

  it('renders story and epic ID when present', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        storyId: 'US-99',
        epicId: 'EP-7',
        totalCount: 1,
        passCount: 1,
        failCount: 0,
        draftCount: 0,
        testCases: [{ id: 'TC-1', title: 'Test', status: 'passed' }],
      }))}</>
    );
    expect(container.textContent).toContain('US-99');
    expect(container.textContent).toContain('EP-7');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DEEP TESTS: renderTestDesignDetails — untested sections
// ════════════════════════════════════════════════════════════════════════════

describe('renderTestDesignDetails deep — additional sections', () => {
  // ── Epic Info view-mode fields ──
  it('renders epicInfo with epicTitle, epicGoal, prdReference, architectureReference', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        epicInfo: {
          epicId: 'EP-42',
          epicTitle: 'Payment Processing',
          epicGoal: 'Enable credit card payments',
          storyCount: 8,
          prdReference: 'PRD-12',
          architectureReference: 'ARCH-5',
        },
      }))}</>
    );
    expect(container.textContent).toContain('EP-42');
    expect(container.textContent).toContain('Payment Processing');
    expect(container.textContent).toContain('Enable credit card payments');
    expect(container.textContent).toContain('8');
    expect(container.textContent).toContain('PRD-12');
    expect(container.textContent).toContain('ARCH-5');
  });

  // ── Feature Info (QA variant) ──
  it('renders featureInfo with featureId, featureName, featureScope', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        featureInfo: {
          featureId: 'FEAT-7',
          featureName: 'User Registration',
          featureScope: 'Covers email and SSO registration flows',
        },
      }))}</>
    );
    expect(container.textContent).toContain('FEAT-7');
    expect(container.textContent).toContain('User Registration');
    expect(container.textContent).toContain('Covers email and SSO registration flows');
  });

  // ── Summary objectives, keyDecisions, testLevels, coverageSummary ──
  it('renders summary with objectives and keyDecisions', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        summary: {
          scope: 'Full regression suite',
          objectives: ['Validate auth flows', 'Test payment pipeline'],
          keyDecisions: ['Use mocks for external APIs', 'BDD-first approach'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Validate auth flows');
    expect(container.textContent).toContain('Test payment pipeline');
    expect(container.textContent).toContain('Use mocks for external APIs');
    expect(container.textContent).toContain('BDD-first approach');
  });

  it('renders summary testLevels with level/purpose/coverage', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        summary: {
          scope: 'Unit and integration',
          testLevels: [
            { level: 'unit', purpose: 'Test individual functions', coverage: '85%' },
            { level: 'integration', purpose: 'Test API interactions', coverage: '60%' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('unit');
    expect(container.textContent).toContain('Test individual functions');
    expect(container.textContent).toContain('85%');
    expect(container.textContent).toContain('integration');
    expect(container.textContent).toContain('60%');
  });

  it('renders summary testLevels as strings', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        summary: {
          scope: 'Multi-level',
          testLevels: ['unit', 'integration', 'e2e'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('unit');
    expect(container.textContent).toContain('integration');
    expect(container.textContent).toContain('e2e');
  });

  it('renders summary coverageSummary', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        summary: { coverageSummary: 'Overall coverage is at 78% with gaps in error handling' },
      }))}</>
    );
    expect(container.textContent).toContain('Overall coverage is at 78%');
  });

  // ── Coverage Plan overview and coverageGoals ──
  it('renders coveragePlan overview text', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        coveragePlan: {
          overview: 'Target 90% code coverage across all modules',
          p0: [{ id: 'CP-1', requirement: 'Login' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Target 90% code coverage');
  });

  it('renders coveragePlan coverageGoals with all 4 fields', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        coveragePlan: {
          coverageGoals: {
            codeStatement: '90%',
            codeBranch: '85%',
            requirementCoverage: '100%',
            riskCoverage: '95%',
          },
          p0: [{ id: 'CP-1', requirement: 'Critical path' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('90%');
    expect(container.textContent).toContain('85%');
    expect(container.textContent).toContain('100%');
    expect(container.textContent).toContain('95%');
  });

  // ── Coverage item extra fields ──
  it('renders coverage item with requirementId, riskLink, testApproach, testCount, owner', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        coveragePlan: {
          p0: [{
            id: 'CP-7',
            requirement: 'Password reset',
            requirementId: 'REQ-42',
            riskLink: 'RISK-3',
            testApproach: 'BDD with mocks',
            testCount: 5,
            owner: 'Alice',
            automatable: true,
          }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('CP-7');
    expect(container.textContent).toContain('Password reset');
    expect(container.textContent).toContain('REQ-42');
    expect(container.textContent).toContain('RISK-3');
    expect(container.textContent).toContain('BDD with mocks');
    expect(container.textContent).toContain('5');
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Automatable');
  });

  it('renders coverage item with automatable=false as Manual', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        coveragePlan: {
          p0: [{ id: 'CP-8', requirement: 'Exploratory', automatable: false }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Manual');
  });

  // ── Coverage Plan with alternate keys (p0Critical, p1High, etc.) ──
  it('renders coveragePlan with p0Critical and p1High keys', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        coveragePlan: {
          p0Critical: [{ id: 'ALT-1', requirement: 'Critical alt path' }],
          p1High: [{ id: 'ALT-2', requirement: 'High alt path' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('ALT-1');
    expect(container.textContent).toContain('Critical alt path');
    expect(container.textContent).toContain('ALT-2');
    expect(container.textContent).toContain('High alt path');
  });

  // ── Test Cases preconditions, steps (string), steps (BDD), expectedResult ──
  it('renders test case preconditions', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        testCases: [{
          id: 'TC-10',
          title: 'Login with MFA',
          preconditions: ['User has MFA enabled', 'Valid credentials exist'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('User has MFA enabled');
    expect(container.textContent).toContain('Valid credentials exist');
  });

  it('renders test case steps as strings', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        testCases: [{
          id: 'TC-11',
          title: 'Checkout flow',
          steps: ['Navigate to checkout', 'Enter payment info', 'Click submit'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Navigate to checkout');
    expect(container.textContent).toContain('Enter payment info');
    expect(container.textContent).toContain('Click submit');
  });

  it('renders test case steps in BDD format (given/when/then)', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        testCases: [{
          id: 'TC-12',
          title: 'BDD Login',
          steps: [
            { given: 'user is on login page', when: 'user enters credentials', then: 'user sees dashboard' },
          ],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Given user is on login page');
    expect(container.textContent).toContain('When user enters credentials');
    expect(container.textContent).toContain('Then user sees dashboard');
  });

  it('renders test case steps with action format and expectedResult on step', () => {
    // When step has action but no BDD fields, renderer uses BDD template which yields empty string
    // (action is consumed by || operator, BDD fields are all undefined → empty)
    // Only expectedResult on the step renders via the muted div
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        testCases: [{
          id: 'TC-13',
          title: 'Action step test',
          steps: [
            { action: 'Click the login button', expectedResult: 'Redirected to dashboard' },
          ],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Steps');
    expect(container.textContent).toContain('Expected: Redirected to dashboard');
  });

  it('renders test case expectedResult', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        testCases: [{
          id: 'TC-14',
          title: 'With expected result',
          expectedResult: 'User is redirected to the home page',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('User is redirected to the home page');
  });

  // ── Risk Assessment medium and low priority ──
  it('renders medium priority risks', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        riskAssessment: {
          overview: 'Mixed risks',
          highPriority: [{ riskId: 'R-1', description: 'Token expiry' }],
          mediumPriority: [
            { riskId: 'R-2', description: 'Slow API responses', probability: 'medium', impact: 'medium', mitigation: 'Add timeouts' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Medium Priority Risks');
    expect(container.textContent).toContain('Slow API responses');
    expect(container.textContent).toContain('Mitigation: Add timeouts');
  });

  it('renders low priority risks', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        riskAssessment: {
          overview: 'Some risks',
          highPriority: [{ riskId: 'R-1', description: 'Critical bug' }],
          lowPriority: [
            { riskId: 'R-3', description: 'Minor UI glitch', probability: 'low', impact: 'low', mitigation: 'Defer to next sprint' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Low Priority Risks');
    expect(container.textContent).toContain('Minor UI glitch');
    expect(container.textContent).toContain('Mitigation: Defer to next sprint');
  });

  it('renders risk with category, testStrategy, owner fields', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        riskAssessment: {
          highPriority: [{
            riskId: 'R-5',
            description: 'Data corruption',
            probability: 'high',
            impact: 'high',
            category: 'Data Integrity',
            mitigation: 'Add checksums',
            testStrategy: 'Run data validation suite',
            owner: 'Bob',
          }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Data Integrity');
    expect(container.textContent).toContain('Test Strategy: Run data validation suite');
    expect(container.textContent).toContain('Owner: Bob');
  });

  // ── Execution Order — legacy array format ──
  it('renders executionOrder as legacy flat array of strings', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        executionOrder: ['Smoke tests', 'Unit tests', 'Integration tests', 'E2E tests'],
      }))}</>
    );
    expect(container.textContent).toContain('Smoke tests');
    expect(container.textContent).toContain('Unit tests');
    expect(container.textContent).toContain('Integration tests');
    expect(container.textContent).toContain('E2E tests');
  });

  it('renders executionOrder as legacy array of objects with phase/name', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        executionOrder: [
          { phase: 'Phase 1: Smoke' },
          { name: 'Phase 2: Regression' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Phase 1: Smoke');
    expect(container.textContent).toContain('Phase 2: Regression');
  });

  // ── Execution Order — object format with smoke/p0/p1/p2p3/parallelization ──
  it('renders executionOrder object with overview, smoke, p0, p1, p2p3', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        executionOrder: {
          overview: 'Execute in priority order',
          smoke: [
            { testId: 'SM-1', description: 'App starts successfully' },
            'Basic health check',
          ],
          p0: ['Critical login test', 'Critical payment test'],
          p1: ['High priority profile test'],
          p2p3: ['Low priority tooltip test'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Execute in priority order');
    expect(container.textContent).toContain('[SM-1] App starts successfully');
    expect(container.textContent).toContain('Basic health check');
    expect(container.textContent).toContain('Critical login test');
    expect(container.textContent).toContain('Critical payment test');
    expect(container.textContent).toContain('High priority profile test');
    expect(container.textContent).toContain('Low priority tooltip test');
  });

  it('renders executionOrder parallelization with strategy, maxParallel, constraints', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        executionOrder: {
          overview: 'Parallel execution',
          parallelization: {
            strategy: 'Split by feature',
            maxParallel: 4,
            constraints: ['No shared database state', 'Isolated test users'],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Split by feature');
    expect(container.textContent).toContain('4');
    expect(container.textContent).toContain('No shared database state');
    expect(container.textContent).toContain('Isolated test users');
  });

  // ── Execution Strategy (QA variant) ──
  it('renders executionStrategy with approach, environments, tools', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        executionStrategy: {
          approach: 'CI/CD pipeline with parallel runs',
          environments: ['staging', 'production-mirror'],
          tools: ['Playwright', { name: 'k6' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('CI/CD pipeline with parallel runs');
    expect(container.textContent).toContain('staging');
    expect(container.textContent).toContain('production-mirror');
    expect(container.textContent).toContain('Playwright');
    expect(container.textContent).toContain('k6');
  });

  // ── Testability Assessment (Architecture variant) ──
  it('renders testabilityAssessment with score, strengths, weaknesses, recommendations', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        testabilityAssessment: {
          score: '8/10',
          strengths: ['Clean separation of concerns', 'Dependency injection'],
          weaknesses: ['Tight coupling in auth module', 'No test doubles for DB'],
          recommendations: ['Add DI container', 'Create mock DB layer'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('8/10');
    expect(container.textContent).toContain('Clean separation of concerns');
    expect(container.textContent).toContain('Dependency injection');
    expect(container.textContent).toContain('Tight coupling in auth module');
    expect(container.textContent).toContain('No test doubles for DB');
    expect(container.textContent).toContain('Add DI container');
    expect(container.textContent).toContain('Create mock DB layer');
  });

  // ── Architecture Overview (Architecture variant) ──
  it('renders architectureOverview with patterns and components', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        architectureOverview: {
          patterns: ['MVC', 'Repository', 'Observer'],
          components: ['AuthService', 'PaymentGateway', { name: 'NotificationHub' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('MVC');
    expect(container.textContent).toContain('Repository');
    expect(container.textContent).toContain('Observer');
    expect(container.textContent).toContain('AuthService');
    expect(container.textContent).toContain('PaymentGateway');
    expect(container.textContent).toContain('NotificationHub');
  });

  // ── Not In Scope ──
  it('renders notInScope with string and object items', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        notInScope: [
          'Performance testing',
          { item: 'Security pen testing', reason: 'Done by external team', riskAccepted: true },
          { item: 'Load testing', reason: 'Separate initiative', riskAccepted: false },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Performance testing');
    expect(container.textContent).toContain('Security pen testing');
    expect(container.textContent).toContain('Done by external team');
    expect(container.textContent).toContain('Risk Accepted');
    expect(container.textContent).toContain('Load testing');
    expect(container.textContent).toContain('Risk Not Accepted');
  });

  // ── Entry/Exit Criteria ──
  it('renders entryExitCriteria with entry, exit, suspension, resumption', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        entryExitCriteria: {
          entry: [
            { criterion: 'Build passes', mandatory: true, verification: 'CI check' },
            'Code review approved',
          ],
          exit: [
            { criterion: '95% test pass rate', mandatory: true, threshold: '95%', measurement: 'Test runner report' },
            'No P0 defects open',
          ],
          suspensionCriteria: ['More than 3 P0 defects found', 'Environment outage'],
          resumptionCriteria: ['All P0 defects fixed', 'Environment restored'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Build passes');
    expect(container.textContent).toContain('Mandatory');
    expect(container.textContent).toContain('Verification: CI check');
    expect(container.textContent).toContain('Code review approved');
    expect(container.textContent).toContain('95% test pass rate');
    expect(container.textContent).toContain('Threshold: 95%');
    expect(container.textContent).toContain('Measurement: Test runner report');
    expect(container.textContent).toContain('More than 3 P0 defects found');
    expect(container.textContent).toContain('Environment outage');
    expect(container.textContent).toContain('All P0 defects fixed');
    expect(container.textContent).toContain('Environment restored');
  });

  // ── Project Team ──
  it('renders projectTeam with name, role, availability, responsibilities, skills', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        projectTeam: [
          { name: 'Alice', role: 'QA Lead', availability: 'Full-time', responsibilities: 'Owns test strategy', skills: ['Playwright', 'API testing'] },
          { name: 'Bob', role: 'Developer', skills: ['React', 'TypeScript'] },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('QA Lead');
    expect(container.textContent).toContain('Full-time');
    expect(container.textContent).toContain('Owns test strategy');
    expect(container.textContent).toContain('Playwright');
    expect(container.textContent).toContain('API testing');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).toContain('Developer');
  });

  // ── Test Environment ──
  it('renders testEnvironment with environments, testData, tools', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        testEnvironment: {
          environments: [
            { name: 'Staging', purpose: 'Integration testing', configuration: 'Docker Compose', dataRequirements: 'Seeded DB' },
          ],
          testData: {
            strategy: 'Factory-based generation',
            refreshStrategy: 'Reset between suites',
            sources: ['faker.js', 'fixtures'],
          },
          tools: [
            { tool: 'Playwright', purpose: 'E2E tests', version: '1.40.0' },
            'Jest',
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Staging');
    expect(container.textContent).toContain('Integration testing');
    expect(container.textContent).toContain('Config: Docker Compose');
    expect(container.textContent).toContain('Data: Seeded DB');
    expect(container.textContent).toContain('Factory-based generation');
    expect(container.textContent).toContain('Reset between suites');
    expect(container.textContent).toContain('faker.js');
    expect(container.textContent).toContain('fixtures');
    expect(container.textContent).toContain('Playwright');
    expect(container.textContent).toContain('E2E tests');
    expect(container.textContent).toContain('1.40.0');
    expect(container.textContent).toContain('Jest');
  });

  // ── Resource Estimates ──
  it('renders resourceEstimates with totalEffort, breakdown, timeline', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        resourceEstimates: {
          totalEffort: '120 person-hours',
          breakdown: [
            { activity: 'Test case writing', effort: '40h', resources: 2, duration: '2 weeks' },
            { activity: 'Automation', effort: '60h', resources: 3 },
          ],
          timeline: [
            { phase: 'Design', startDate: '2025-01-01', endDate: '2025-01-15', deliverables: ['Test plan', 'Coverage matrix'] },
            { phase: 'Execution', startDate: '2025-01-16', endDate: '2025-02-01' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('120 person-hours');
    expect(container.textContent).toContain('Test case writing');
    expect(container.textContent).toContain('40h');
    expect(container.textContent).toContain('2 resources');
    expect(container.textContent).toContain('2 weeks');
    expect(container.textContent).toContain('Automation');
    expect(container.textContent).toContain('60h');
    expect(container.textContent).toContain('Design');
    expect(container.textContent).toContain('2025-01-01');
    expect(container.textContent).toContain('Test plan');
    expect(container.textContent).toContain('Coverage matrix');
    expect(container.textContent).toContain('Execution');
  });

  // ── Mitigation Plans ──
  it('renders mitigationPlans with riskId, risk, plan, contingency, triggers, owner', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        mitigationPlans: [
          {
            riskId: 'R-1',
            risk: 'Token expiry failure',
            plan: 'Implement retry with backoff',
            contingency: 'Fall back to session auth',
            owner: 'Alice',
            triggers: ['3 consecutive failures', 'Timeout > 5s'],
          },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('R-1');
    expect(container.textContent).toContain('Token expiry failure');
    expect(container.textContent).toContain('Implement retry with backoff');
    expect(container.textContent).toContain('Contingency: Fall back to session auth');
    expect(container.textContent).toContain('Owner: Alice');
    expect(container.textContent).toContain('3 consecutive failures');
    expect(container.textContent).toContain('Timeout > 5s');
  });

  // ── Assumptions & Dependencies ──
  it('renders assumptionsAndDependencies with assumptions and dependencies', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        assumptionsAndDependencies: {
          assumptions: [
            'API is stable',
            { assumption: 'Test data is seeded', risk: 'May not match production', validation: 'Manual verification' },
          ],
          dependencies: [
            'Auth service is deployed',
            { dependency: 'Payment gateway sandbox', type: 'external', status: 'available', owner: 'DevOps' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('API is stable');
    expect(container.textContent).toContain('Test data is seeded');
    expect(container.textContent).toContain('Risk: May not match production');
    expect(container.textContent).toContain('Validation: Manual verification');
    expect(container.textContent).toContain('Auth service is deployed');
    expect(container.textContent).toContain('Payment gateway sandbox');
    expect(container.textContent).toContain('external');
    expect(container.textContent).toContain('available');
    expect(container.textContent).toContain('Owner: DevOps');
  });

  // ── Defect Management ──
  it('renders defectManagement with process, severityDefinitions, escalationPath', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        defectManagement: {
          process: 'Triage daily, fix within SLA',
          severityDefinitions: [
            { severity: 'Critical', definition: 'System down', sla: '4h' },
            { severity: 'Major', definition: 'Feature broken', sla: '24h' },
          ],
          escalationPath: 'QA Lead -> Engineering Manager -> VP',
        },
      }))}</>
    );
    expect(container.textContent).toContain('Triage daily, fix within SLA');
    expect(container.textContent).toContain('Critical');
    expect(container.textContent).toContain('System down');
    expect(container.textContent).toContain('4h');
    expect(container.textContent).toContain('Major');
    expect(container.textContent).toContain('Feature broken');
    expect(container.textContent).toContain('24h');
    expect(container.textContent).toContain('QA Lead -> Engineering Manager -> VP');
  });

  // ── Approval ──
  it('renders approval with approvers including name, role, status, date', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        approval: {
          approvers: [
            { name: 'Alice Smith', role: 'QA Lead', status: 'approved', date: '2025-01-15' },
            { name: 'Bob Jones', role: 'Engineering Manager', status: 'pending' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Alice Smith');
    expect(container.textContent).toContain('QA Lead');
    expect(container.textContent).toContain('approved');
    expect(container.textContent).toContain('2025-01-15');
    expect(container.textContent).toContain('Bob Jones');
    expect(container.textContent).toContain('Engineering Manager');
    expect(container.textContent).toContain('pending');
  });

  // ── Appendices ──
  it('renders appendices with title and content', () => {
    const { container } = render(
      <>{renderTestDesignDetails(makeProps('test-design', {
        appendices: [
          { title: 'Glossary', content: 'BDD: Behavior-Driven Development' },
          { title: 'References', content: 'See project wiki for details' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Glossary');
    expect(container.textContent).toContain('BDD: Behavior-Driven Development');
    expect(container.textContent).toContain('References');
    expect(container.textContent).toContain('See project wiki for details');
  });

  // ── Description fallback when no summary ──
  it('renders description fallback when no summary scope', () => {
    const props = makeProps('test-design', {});
    // Set artifact description
    props.artifact.description = 'This is a fallback description for the test design';
    const { container } = render(<>{renderTestDesignDetails(props)}</>);
    expect(container.textContent).toContain('This is a fallback description');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DEEP TESTS: renderTestReviewDetails — untested sections
// ════════════════════════════════════════════════════════════════════════════

describe('renderTestReviewDetails deep — additional sections', () => {
  // ── Executive Summary strengths/weaknesses with string and object formats ──
  it('renders executive summary strengths and weaknesses', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        executiveSummary: {
          assessment: 'Good quality with minor gaps',
          recommendation: 'approve-with-comments',
          riskLevel: 'medium',
          strengths: [
            { strength: 'Comprehensive BDD coverage', impact: 'Fewer regressions' },
            'Good test isolation',
          ],
          weaknesses: [
            { weakness: 'Missing edge cases', remediation: 'Add negative path tests' },
            'No performance tests',
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('approve-with-comments');
    expect(container.textContent).toContain('medium');
    expect(container.textContent).toContain('Comprehensive BDD coverage');
    expect(container.textContent).toContain('Good test isolation');
    expect(container.textContent).toContain('Missing edge cases');
    expect(container.textContent).toContain('Fix: Add negative path tests');
    expect(container.textContent).toContain('No performance tests');
  });

  // ── Quality Score Breakdown ──
  it('renders qualityScoreBreakdown with score, weight, contribution', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        qualityScoreBreakdown: {
          testCoverage: { score: 8, weight: 30, contribution: 24 },
          codeQuality: { score: 7, weight: 20 },
          documentation: { score: 9, weight: 10, contribution: 9 },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Test Coverage');
    expect(container.textContent).toContain('8/10');
    expect(container.textContent).toContain('w:30');
    expect(container.textContent).toContain('24');
    expect(container.textContent).toContain('Code Quality');
    expect(container.textContent).toContain('7/10');
    expect(container.textContent).toContain('Documentation');
    expect(container.textContent).toContain('9/10');
  });

  // ── Quality Criteria with evidence and recommendations ──
  it('renders quality criteria with evidence and sub-recommendations', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        qualityAssessment: {
          criteria: [{
            criterion: 'BDD Format Compliance',
            score: 8,
            findings: 'Mostly compliant with minor issues',
            evidence: [
              { type: 'positive', description: 'All tests use Given/When/Then', location: 'auth.spec.ts' },
              { type: 'negative', description: 'Missing And steps', location: 'checkout.spec.ts' },
            ],
            recommendations: ['Add And steps for multi-step scenarios', 'Use Scenario Outline for data-driven tests'],
          }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('BDD Format Compliance');
    expect(container.textContent).toContain('8/10');
    expect(container.textContent).toContain('All tests use Given/When/Then');
    expect(container.textContent).toContain('auth.spec.ts');
    expect(container.textContent).toContain('Missing And steps');
    expect(container.textContent).toContain('checkout.spec.ts');
    expect(container.textContent).toContain('Add And steps for multi-step scenarios');
  });

  // ── Legacy Quality Scores (flat object, when criteria is empty) ──
  it('renders legacy quality scores when criteria array is empty', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        qualityAssessment: {
          scores: { bddFormat: 8, testIds: 9, priorityMarkers: 7 },
          criteria: [],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Bdd Format');
    expect(container.textContent).toContain('8');
    expect(container.textContent).toContain('Test Ids');
    expect(container.textContent).toContain('9');
  });

  // ── Coverage Analysis with overallCoverage and uncoveredAreas ──
  it('renders coverageAnalysis with overallCoverage percentages and uncoveredAreas', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        coverageAnalysis: {
          overallCoverage: { statements: 85, branches: 72, functions: 90, lines: 88 },
          uncoveredAreas: [
            { area: 'Error handling in auth module', risk: 'high', recommendation: 'Add negative tests' },
            { area: 'Edge cases in payment flow', risk: 'medium' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('85%');
    expect(container.textContent).toContain('72%');
    expect(container.textContent).toContain('90%');
    expect(container.textContent).toContain('88%');
    expect(container.textContent).toContain('Error handling in auth module');
    expect(container.textContent).toContain('Risk: high');
    expect(container.textContent).toContain('Fix: Add negative tests');
    expect(container.textContent).toContain('Edge cases in payment flow');
  });

  // ── Decision conditions, blockers, followUp ──
  it('renders decision with conditions and blockers', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        decision: {
          verdict: 'approve-with-comments',
          conditions: ['Fix flaky tests in auth module', 'Add missing edge case coverage'],
          blockers: ['Critical bug in payment flow', 'Missing test data setup'],
          comments: 'Overall good but needs improvements',
          followUpRequired: true,
          followUpDate: '2025-02-01',
        },
      }))}</>
    );
    expect(container.textContent).toContain('approve-with-comments');
    expect(container.textContent).toContain('Fix flaky tests in auth module');
    expect(container.textContent).toContain('Add missing edge case coverage');
    expect(container.textContent).toContain('Critical bug in payment flow');
    expect(container.textContent).toContain('Missing test data setup');
    expect(container.textContent).toContain('Overall good but needs improvements');
    expect(container.textContent).toContain('Required');
    expect(container.textContent).toContain('2025-02-01');
  });

  // ── Next Steps ──
  it('renders nextSteps with step, priority, timeline, owner', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        nextSteps: [
          { step: 'Fix flaky auth tests', priority: 1, timeline: '1 week', owner: 'Alice' },
          { step: 'Add performance benchmarks', priority: 2, timeline: '2 weeks', owner: 'Bob' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('#1 Fix flaky auth tests');
    expect(container.textContent).toContain('1 week');
    expect(container.textContent).toContain('Owner: Alice');
    expect(container.textContent).toContain('#2 Add performance benchmarks');
    expect(container.textContent).toContain('2 weeks');
    expect(container.textContent).toContain('Owner: Bob');
  });

  // ── Detailed Quality Sub-Assessments ──
  it('renders detailed quality sub-assessments (bddFormat, determinism, etc.)', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        qualityAssessment: {
          criteria: [],
          bddFormat: {
            score: 8,
            notes: 'Good BDD adoption',
            coverage: '92%',
            distribution: { given: 45, when: 40, then: 50 },
            examples: [
              { type: 'good', location: 'auth.spec.ts', comment: 'Well-structured scenario' },
              { type: 'bad', location: 'payment.spec.ts', comment: 'Missing Then step', code: 'it("should pay")' },
            ],
          },
          determinism: {
            score: 6,
            notes: 'Some flakiness detected',
            flakyTests: [
              { test: 'Login timeout test', reason: 'Network dependency', recommendation: 'Use mock server' },
            ],
            nondeterministicPatterns: ['Date.now() usage', 'Math.random() in tests'],
            orderDependencies: ['Test B depends on Test A state'],
          },
          isolation: {
            score: 7,
            notes: 'Mostly isolated',
            sharedStateIssues: [
              { issue: 'Shared DB connection', location: 'db.spec.ts', impact: 'Test pollution', fix: 'Use per-test connection' },
            ],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('BDD Format');
    expect(container.textContent).toContain('8/10');
    expect(container.textContent).toContain('Good BDD adoption');
    expect(container.textContent).toContain('92%');
    expect(container.textContent).toContain('GIVEN');
    expect(container.textContent).toContain('45');
    expect(container.textContent).toContain('Well-structured scenario');
    expect(container.textContent).toContain('Missing Then step');
    expect(container.textContent).toContain('Determinism');
    expect(container.textContent).toContain('6/10');
    expect(container.textContent).toContain('Login timeout test');
    expect(container.textContent).toContain('Use mock server');
    expect(container.textContent).toContain('Date.now() usage');
    expect(container.textContent).toContain('Test B depends on Test A state');
    expect(container.textContent).toContain('Isolation');
    expect(container.textContent).toContain('7/10');
    expect(container.textContent).toContain('Shared DB connection');
    expect(container.textContent).toContain('Use per-test connection');
  });

  // ── Sub-assessment with hardWaits instances ──
  it('renders hardWaits sub-assessment with instances', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        qualityAssessment: {
          criteria: [],
          hardWaits: {
            score: 4,
            notes: 'Multiple hard waits found',
            instances: [
              { location: 'checkout.spec.ts:42', duration: '3000ms', recommendation: 'Use waitForSelector instead' },
            ],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Hard Waits');
    expect(container.textContent).toContain('4/10');
    expect(container.textContent).toContain('checkout.spec.ts:42');
    expect(container.textContent).toContain('3000ms');
    expect(container.textContent).toContain('Use waitForSelector instead');
  });

  // ── Sub-assessment with fixturePatterns goodPatterns and antiPatterns ──
  it('renders fixturePatterns with goodPatterns and antiPatterns', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        qualityAssessment: {
          criteria: [],
          fixturePatterns: {
            score: 7,
            goodPatterns: ['Factory functions for test data', 'Shared fixtures via beforeAll'],
            antiPatterns: [
              { pattern: 'Hardcoded test data', location: 'user.spec.ts', recommendation: 'Use factory' },
              'Global mutable state',
            ],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Fixture Patterns');
    expect(container.textContent).toContain('Factory functions for test data');
    expect(container.textContent).toContain('Shared fixtures via beforeAll');
    expect(container.textContent).toContain('Hardcoded test data');
    expect(container.textContent).toContain('user.spec.ts');
    expect(container.textContent).toContain('Global mutable state');
  });

  // ── Sub-assessment with assertions issues ──
  it('renders assertions sub-assessment with issues', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        qualityAssessment: {
          criteria: [],
          assertions: {
            score: 5,
            notes: 'Weak assertions',
            issues: [
              { issue: 'Using toBeTruthy instead of specific matchers', location: 'app.spec.ts', recommendation: 'Use toEqual or toContain' },
              'Missing assertions in some tests',
            ],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Assertions');
    expect(container.textContent).toContain('5/10');
    expect(container.textContent).toContain('Using toBeTruthy instead of specific matchers');
    expect(container.textContent).toContain('app.spec.ts');
    expect(container.textContent).toContain('Missing assertions in some tests');
  });

  // ── Best Practices Found ──
  it('renders bestPracticesFound with practice, location, recommendation', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        bestPracticesFound: [
          { practice: 'Page Object Model usage', location: 'pages/', recommendation: 'Extend to all pages' },
          'Proper test isolation with beforeEach',
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Page Object Model usage');
    expect(container.textContent).toContain('pages/');
    expect(container.textContent).toContain('Extend to all pages');
    expect(container.textContent).toContain('Proper test isolation with beforeEach');
  });

  // ── Test File Analysis ──
  it('renders testFileAnalysis with file, score, testsCount, LOC, issues, strengths, recommendations', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        testFileAnalysis: [
          {
            file: 'auth.spec.ts',
            score: 85,
            testsCount: 25,
            linesOfCode: 450,
            issues: [
              { severity: 'critical', issue: 'Missing error handling test', line: 42 },
              { severity: 'major', issue: 'Flaky network test' },
            ],
            strengths: ['Good BDD format', 'Comprehensive assertions'],
            recommendations: ['Add retry logic for network tests'],
          },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('auth.spec.ts');
    expect(container.textContent).toContain('85');
    expect(container.textContent).toContain('25');
    expect(container.textContent).toContain('450');
    expect(container.textContent).toContain('Missing error handling test');
    expect(container.textContent).toContain('L42');
    expect(container.textContent).toContain('Good BDD format');
    expect(container.textContent).toContain('Add retry logic for network tests');
  });

  // ── Context & Integration ──
  it('renders contextAndIntegration with CI, pipeline health, and other fields', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        contextAndIntegration: {
          integrationWithCI: 'GitHub Actions pipeline',
          ciPipelineHealth: {
            averageDuration: '12 min',
            failureRate: '5%',
            flakinessRate: '2%',
          },
          testDataManagement: 'Factory-based with seeders',
          environmentHandling: 'Docker containers per test suite',
          parallelization: '4 workers with sharding',
          reporting: 'HTML + JSON reports',
        },
      }))}</>
    );
    expect(container.textContent).toContain('GitHub Actions pipeline');
    expect(container.textContent).toContain('12 min');
    expect(container.textContent).toContain('5%');
    expect(container.textContent).toContain('2%');
    expect(container.textContent).toContain('Factory-based with seeders');
    expect(container.textContent).toContain('Docker containers per test suite');
    expect(container.textContent).toContain('4 workers with sharding');
    expect(container.textContent).toContain('HTML + JSON reports');
  });

  // ── Knowledge Base References ──
  it('renders knowledgeBaseReferences with reference, relevance, findingsRelated', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        knowledgeBaseReferences: [
          { reference: 'Testing Best Practices Guide', relevance: 'Used as baseline for review', findingsRelated: ['F-1', 'F-3'] },
          'OWASP Testing Guidelines',
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Testing Best Practices Guide');
    expect(container.textContent).toContain('Used as baseline for review');
    expect(container.textContent).toContain('F-1');
    expect(container.textContent).toContain('F-3');
    expect(container.textContent).toContain('OWASP Testing Guidelines');
  });

  // ── Appendix with codeExamples and toolOutput ──
  it('renders appendix with codeExamples and toolOutput', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        appendix: {
          codeExamples: [
            { title: 'Improved Auth Test', context: 'Refactored for better isolation', before: 'test("old login")', after: 'test("new login")' },
          ],
          toolOutput: [
            { tool: 'ESLint', output: '0 errors, 2 warnings' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Improved Auth Test');
    expect(container.textContent).toContain('Refactored for better isolation');
    expect(container.textContent).toContain('test("old login")');
    expect(container.textContent).toContain('test("new login")');
    expect(container.textContent).toContain('ESLint');
    expect(container.textContent).toContain('0 errors, 2 warnings');
  });

  // ── Legacy Overall Assessment (when no executiveSummary.assessment) ──
  it('renders legacy overall assessment when executiveSummary has no assessment', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        qualityAssessment: {
          overallRating: 'Good',
          summary: 'Overall test quality is acceptable with minor improvements needed',
          criteria: [],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Good');
    expect(container.textContent).toContain('Overall test quality is acceptable');
  });

  // ── Legacy Findings (when criticalIssues empty) ──
  it('renders legacy findings when no criticalIssues', () => {
    // Renderer uses f.id || f.title || `Finding N` — so when id is present, title is NOT rendered
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        findings: [
          { id: 'F-1', title: 'Missing error tests', severity: 'high', description: 'No tests for 500 errors', recommendation: 'Add error boundary tests' },
        ],
        criticalIssues: [],
      }))}</>
    );
    expect(container.textContent).toContain('F-1');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('No tests for 500 errors');
    expect(container.textContent).toContain('Recommendation: Add error boundary tests');
  });

  // ── Critical Issues with all fields ──
  it('renders critical issues with id, impact, effort, location', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        criticalIssues: [{
          id: 'CI-1',
          issue: 'No auth error handling',
          severity: 'high',
          priority: 'immediate',
          effort: '4h',
          location: 'auth.spec.ts:35',
          impact: 'Could miss auth failures in production',
          recommendation: 'Add comprehensive error handling tests',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('CI-1');
    expect(container.textContent).toContain('No auth error handling');
    expect(container.textContent).toContain('immediate');
    expect(container.textContent).toContain('4h');
    expect(container.textContent).toContain('auth.spec.ts:35');
    expect(container.textContent).toContain('Could miss auth failures in production');
    expect(container.textContent).toContain('Add comprehensive error handling tests');
  });

  // ── Review Info additional fields ──
  it('renders reviewInfo with reviewDate, reviewType, previousScore, targetScore', () => {
    const { container } = render(
      <>{renderTestReviewDetails(makeProps('test-review', {
        reviewInfo: {
          qualityScore: 78,
          reviewer: 'Alice',
          reviewDate: '2025-03-01',
          reviewType: 'regression',
          previousScore: 65,
          targetScore: 85,
          scope: 'Sprint 5 regression review',
        },
      }))}</>
    );
    expect(container.textContent).toContain('78/100');
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('2025-03-01');
    expect(container.textContent).toContain('regression');
    expect(container.textContent).toContain('65/100');
    expect(container.textContent).toContain('85/100');
    expect(container.textContent).toContain('Sprint 5 regression review');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DEEP TESTS: renderTestFrameworkDetails — untested sections
// ════════════════════════════════════════════════════════════════════════════

describe('renderTestFrameworkDetails deep — additional sections', () => {
  // ── Directory Structure ──
  it('renders directoryStructure with rootDir and directories', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        directoryStructure: {
          rootDir: 'src/',
          directories: [
            { path: 'src/tests/unit', purpose: 'Unit test files' },
            { path: 'src/tests/e2e', purpose: 'End-to-end tests' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('src/');
    expect(container.textContent).toContain('src/tests/unit');
    expect(container.textContent).toContain('Unit test files');
    expect(container.textContent).toContain('src/tests/e2e');
    expect(container.textContent).toContain('End-to-end tests');
  });

  // ── Fixtures with scope and filePath ──
  it('renders fixtures with name, scope, purpose, filePath', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        fixtures: [
          { name: 'authFixture', scope: 'suite', purpose: 'Sets up authenticated user', filePath: 'fixtures/auth.ts' },
          { name: 'dbFixture', scope: 'test', purpose: 'Seeds test database' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('authFixture');
    expect(container.textContent).toContain('suite');
    expect(container.textContent).toContain('Sets up authenticated user');
    expect(container.textContent).toContain('fixtures/auth.ts');
    expect(container.textContent).toContain('dbFixture');
    expect(container.textContent).toContain('test');
    expect(container.textContent).toContain('Seeds test database');
  });

  // ── Helpers with functions ──
  it('renders helpers with functions array', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        helpers: [
          {
            name: 'testUtils',
            filePath: 'src/test/utils.ts',
            purpose: 'Common test utilities',
            functions: [
              { signature: 'renderWithProviders(component, options)', description: 'Renders component with all providers' },
              { name: 'mockApiResponse', description: 'Creates mock API response' },
            ],
          },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('testUtils');
    expect(container.textContent).toContain('src/test/utils.ts');
    expect(container.textContent).toContain('Common test utilities');
    expect(container.textContent).toContain('renderWithProviders(component, options)');
    expect(container.textContent).toContain('Renders component with all providers');
    expect(container.textContent).toContain('mockApiResponse');
    expect(container.textContent).toContain('Creates mock API response');
  });

  // ── Page Objects ──
  it('renders pageObjects with name, page, filePath, elements, actions', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        pageObjects: [
          {
            name: 'LoginPage',
            page: '/login',
            filePath: 'pages/login.page.ts',
            elements: ['usernameInput', 'passwordInput', 'submitButton'],
            actions: ['login', 'clearForm'],
          },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('LoginPage');
    expect(container.textContent).toContain('/login');
    expect(container.textContent).toContain('pages/login.page.ts');
    expect(container.textContent).toContain('usernameInput, passwordInput, submitButton');
    expect(container.textContent).toContain('login, clearForm');
  });

  // ── Mocking ──
  it('renders mocking with strategy and libraries', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        mocking: {
          strategy: 'Mock service worker for API calls',
          libraries: ['msw', 'vitest-mock-extended', 'nock'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Mock service worker for API calls');
    expect(container.textContent).toContain('msw');
    expect(container.textContent).toContain('vitest-mock-extended');
    expect(container.textContent).toContain('nock');
  });

  // ── Scripts ──
  it('renders scripts with name, command, purpose', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        scripts: [
          { name: 'test', command: 'vitest run', purpose: 'Run all tests' },
          { name: 'test:watch', command: 'vitest', purpose: 'Run tests in watch mode' },
          { name: 'test:e2e', command: 'playwright test', purpose: 'Run E2E tests' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('test: vitest run');
    expect(container.textContent).toContain('Run all tests');
    expect(container.textContent).toContain('test:watch: vitest');
    expect(container.textContent).toContain('test:e2e: playwright test');
    expect(container.textContent).toContain('Run E2E tests');
  });

  // ── Legacy flat dependencies ──
  it('renders legacy flat dependencies on framework object', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        framework: {
          name: 'Jest',
          version: '29.0',
          dependencies: ['ts-jest', 'babel-jest', '@testing-library/react'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('ts-jest');
    expect(container.textContent).toContain('babel-jest');
    expect(container.textContent).toContain('@testing-library/react');
  });

  // ── Setup Instructions with prerequisites, installationSteps, runCommands ──
  it('renders setupInstructions with prerequisites, installationSteps, runCommands', () => {
    const { container } = render(
      <>{renderTestFrameworkDetails(makeProps('test-framework', {
        setupInstructions: {
          prerequisites: ['Node.js 18+', 'Docker installed'],
          installationSteps: ['npm install', 'npx playwright install'],
          runCommands: [
            { command: 'npm test', description: 'Run unit tests' },
            { command: 'npm run test:e2e', description: 'Run E2E tests' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Node.js 18+');
    expect(container.textContent).toContain('Docker installed');
    expect(container.textContent).toContain('npm install');
    expect(container.textContent).toContain('npx playwright install');
    expect(container.textContent).toContain('npm test');
    expect(container.textContent).toContain('Run unit tests');
    expect(container.textContent).toContain('npm run test:e2e');
    expect(container.textContent).toContain('Run E2E tests');
  });

  // ── Description fallback when no framework name ──
  it('renders description fallback when framework.name is empty', () => {
    const props = makeProps('test-framework', {});
    props.artifact.description = 'Fallback framework description content';
    const { container } = render(<>{renderTestFrameworkDetails(props)}</>);
    expect(container.textContent).toContain('Fallback framework description content');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DEEP TESTS: renderTestSummaryDetails — untested sections
// ════════════════════════════════════════════════════════════════════════════

describe('renderTestSummaryDetails deep — additional sections', () => {
  // ── Summary targetFeatures ──
  it('renders summary with targetFeatures', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        summary: {
          frameworkUsed: 'Vitest',
          totalTestsGenerated: 200,
          scope: 'Full coverage push',
          targetFeatures: ['Authentication', 'Payment Processing', 'User Profile'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Authentication');
    expect(container.textContent).toContain('Payment Processing');
    expect(container.textContent).toContain('User Profile');
  });

  // ── Summary testingApproach ──
  it('renders summary with testingApproach', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        summary: {
          scope: 'Sprint tests',
          testingApproach: 'BDD-first with property-based testing for edge cases',
        },
      }))}</>
    );
    expect(container.textContent).toContain('BDD-first with property-based testing');
  });

  // ── Test Patterns ──
  it('renders testPatterns with pattern, usageCount, description', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        testPatterns: [
          { pattern: 'Arrange-Act-Assert', usageCount: 150, description: 'Standard test structure' },
          { pattern: 'Page Object Model', usageCount: 30, description: 'E2E test abstraction' },
          { pattern: 'Factory Pattern', description: 'Test data generation' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Arrange-Act-Assert');
    expect(container.textContent).toContain('Used 150x');
    expect(container.textContent).toContain('Standard test structure');
    expect(container.textContent).toContain('Page Object Model');
    expect(container.textContent).toContain('Used 30x');
    expect(container.textContent).toContain('Factory Pattern');
    expect(container.textContent).toContain('Test data generation');
  });

  // ── Execution Notes ──
  it('renders executionNotes with runCommand, prerequisites, knownIssues', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        executionNotes: {
          runCommand: 'npx vitest run --coverage',
          prerequisites: ['Node.js 18+ installed', 'Docker running'],
          knownIssues: ['Flaky timeout on CI', 'Mock server port conflict'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('npx vitest run --coverage');
    expect(container.textContent).toContain('Node.js 18+ installed');
    expect(container.textContent).toContain('Docker running');
    expect(container.textContent).toContain('Flaky timeout on CI');
    expect(container.textContent).toContain('Mock server port conflict');
  });

  // ── Generated Tests with testCases and patternsUsed ──
  it('renders generatedTests with nested testCases and patternsUsed', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        generatedTests: [{
          filePath: 'tests/auth.spec.ts',
          targetFile: 'src/auth.ts',
          testType: 'unit',
          testCount: 15,
          description: 'Auth module unit tests',
          testCases: [
            { name: 'should login successfully', category: 'happy-path', description: 'Valid credentials test' },
            { name: 'should reject invalid password', category: 'negative' },
          ],
          patternsUsed: ['AAA', 'Factory'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('tests/auth.spec.ts');
    expect(container.textContent).toContain('src/auth.ts');
    expect(container.textContent).toContain('unit');
    expect(container.textContent).toContain('should login successfully');
    expect(container.textContent).toContain('happy-path');
    expect(container.textContent).toContain('Valid credentials test');
    expect(container.textContent).toContain('should reject invalid password');
    expect(container.textContent).toContain('AAA');
    expect(container.textContent).toContain('Factory');
  });

  // ── Generated Tests with legacy file and status fields ──
  it('renders generatedTests with legacy file and status fields', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        generatedTests: [{
          filePath: 'tests/legacy.spec.ts',
          testCount: 5,
          file: 'src/legacy.ts',
          status: 'passing',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('src/legacy.ts');
    expect(container.textContent).toContain('passing');
  });

  // ── Recommendations with area/recommendation as title ──
  it('renders recommendations with area as title and recommendation as body', () => {
    const { container } = render(
      <>{renderTestSummaryDetails(makeProps('test-summary', {
        recommendations: [
          { area: 'Coverage', recommendation: 'Add tests for error handlers', priority: 'high', effort: 'low' },
          { recommendation: 'Refactor flaky tests', priority: 'medium' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Coverage');
    expect(container.textContent).toContain('Add tests for error handlers');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('low');
    expect(container.textContent).toContain('Refactor flaky tests');
    expect(container.textContent).toContain('medium');
  });

  // ── Description fallback when no summary scope ──
  it('renders description fallback when no summary scope', () => {
    const props = makeProps('test-summary', { summary: {} });
    props.artifact.description = 'Fallback test summary description';
    const { container } = render(<>{renderTestSummaryDetails(props)}</>);
    expect(container.textContent).toContain('Fallback test summary description');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DEEP TESTS: renderTestCoverageDetails — untested sections
// ════════════════════════════════════════════════════════════════════════════

describe('renderTestCoverageDetails deep — additional sections', () => {
  // ── Test case preconditions as string ──
  it('renders test case with string preconditions', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 1, failCount: 0, draftCount: 0,
        testCases: [{
          id: 'TC-20',
          title: 'Precondition string test',
          status: 'passed',
          preconditions: 'User must be logged in and have admin role',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('User must be logged in and have admin role');
  });

  // ── Test case preconditions as array ──
  it('renders test case with array preconditions', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 1, failCount: 0, draftCount: 0,
        testCases: [{
          id: 'TC-21',
          title: 'Precondition array test',
          status: 'passed',
          preconditions: ['Logged in as admin', 'Feature flag enabled'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Logged in as admin');
    expect(container.textContent).toContain('Feature flag enabled');
  });

  // ── Test case steps as strings ──
  it('renders test case with string steps', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 1, failCount: 0, draftCount: 0,
        testCases: [{
          id: 'TC-22',
          title: 'String steps test',
          status: 'passed',
          steps: ['Navigate to settings', 'Click profile tab', 'Update name'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Navigate to settings');
    expect(container.textContent).toContain('Click profile tab');
    expect(container.textContent).toContain('Update name');
  });

  // ── Test case steps as BDD objects (action/description) ──
  it('renders test case with object steps (action and description)', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 0, failCount: 1, draftCount: 0,
        testCases: [{
          id: 'TC-23',
          title: 'Object steps test',
          status: 'failed',
          steps: [
            { action: 'Click submit button' },
            { description: 'Verify error message appears' },
          ],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('Click submit button');
    expect(container.textContent).toContain('Verify error message appears');
  });

  // ── Test case expectedResult ──
  it('renders test case with expectedResult', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 1, failCount: 0, draftCount: 0,
        testCases: [{
          id: 'TC-24',
          title: 'Expected result test',
          status: 'passed',
          expectedResult: 'User is redirected to the dashboard with success toast',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('User is redirected to the dashboard with success toast');
  });

  // ── Test case tags ──
  it('renders test case with tags', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 1, failCount: 0, draftCount: 0,
        testCases: [{
          id: 'TC-25',
          title: 'Tags test',
          status: 'passed',
          tags: ['smoke', 'auth', 'p0'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('smoke');
    expect(container.textContent).toContain('auth');
    expect(container.textContent).toContain('p0');
  });

  // ── Test case relatedRequirements ──
  it('renders test case with relatedRequirements', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 1, failCount: 0, draftCount: 0,
        testCases: [{
          id: 'TC-26',
          title: 'Related reqs test',
          status: 'passed',
          relatedRequirements: ['REQ-1', 'REQ-5', 'REQ-12'],
        }],
      }))}</>
    );
    expect(container.textContent).toContain('REQ-1');
    expect(container.textContent).toContain('REQ-5');
    expect(container.textContent).toContain('REQ-12');
  });

  // ── Test case with type and priority badges ──
  it('renders test case with type and priority', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 0, failCount: 0, draftCount: 1,
        testCases: [{
          id: 'TC-27',
          title: 'Typed test',
          status: 'draft',
          type: 'integration',
          priority: 'P0',
          description: 'Integration test for auth module',
        }],
      }))}</>
    );
    expect(container.textContent).toContain('integration');
    expect(container.textContent).toContain('P0');
    expect(container.textContent).toContain('Integration test for auth module');
  });

  // ── Various status color mappings ──
  it('renders test case status with in-progress color', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 0, failCount: 0, draftCount: 0,
        testCases: [{ id: 'TC-28', title: 'In progress', status: 'in-progress' }],
      }))}</>
    );
    expect(container.textContent).toContain('in-progress');
  });

  it('renders test case with blocked status', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 0, failCount: 0, draftCount: 0,
        testCases: [{ id: 'TC-29', title: 'Blocked test', status: 'blocked' }],
      }))}</>
    );
    expect(container.textContent).toContain('blocked');
  });

  it('renders test case with completed status', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 0, failCount: 0, draftCount: 0,
        testCases: [{ id: 'TC-30', title: 'Completed test', status: 'completed' }],
      }))}</>
    );
    expect(container.textContent).toContain('completed');
  });

  // ── TC fallback title ──
  it('renders TC-N fallback when test case has no id', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 0, failCount: 0, draftCount: 1,
        testCases: [{ title: 'No ID test', status: 'draft' }],
      }))}</>
    );
    expect(container.textContent).toContain('TC-1');
    expect(container.textContent).toContain('No ID test');
  });

  // ── Untitled fallback ──
  it('renders Untitled fallback when test case has no title', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        totalCount: 1, passCount: 0, failCount: 0, draftCount: 1,
        testCases: [{ id: 'TC-31', status: 'draft' }],
      }))}</>
    );
    expect(container.textContent).toContain('TC-31');
    expect(container.textContent).toContain('Untitled');
  });

  // ── Edit mode: coverage summary fields ──
  it('renders edit mode with coverage summary fields (totalCount, passCount, failCount, draftCount, storyId, epicId)', () => {
    const handleFieldChange = vi.fn();
    const { container } = render(
      <>{renderTestCoverageDetails(makeEditProps('test-coverage', {
        totalCount: 10,
        passCount: 8,
        failCount: 1,
        draftCount: 1,
        storyId: 'US-50',
        epicId: 'EP-10',
        testCases: [],
      }))}</>
    );
    // Should have input fields with labels
    expect(container.textContent).toContain('Total');
    expect(container.textContent).toContain('Pass');
    expect(container.textContent).toContain('Fail');
    expect(container.textContent).toContain('Draft');
    expect(container.textContent).toContain('Story ID');
    expect(container.textContent).toContain('Epic ID');
    // Verify inputs are present
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThan(0);
  });

  // ── Edit mode: test case fields ──
  it('renders edit mode test case with ID, Title, Status, Type, Priority, Description fields', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeEditProps('test-coverage', {
        totalCount: 1, passCount: 0, failCount: 0, draftCount: 1,
        testCases: [{ id: 'TC-E1', title: 'Edit test', status: 'draft', type: 'unit', description: 'A draft test' }],
      }))}</>
    );
    expect(container.textContent).toContain('ID');
    expect(container.textContent).toContain('Title');
    expect(container.textContent).toContain('Status');
    expect(container.textContent).toContain('Type');
    expect(container.textContent).toContain('Description');
  });

  // ── Edit mode: Add Test Case button ──
  it('renders Add Test Case button in edit mode', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeEditProps('test-coverage', {
        totalCount: 0, passCount: 0, failCount: 0, draftCount: 0,
        testCases: [],
      }))}</>
    );
    expect(container.textContent).toContain('+ Add Test Case');
  });

  // ── totalCount defaults to testCases.length when not provided ──
  it('defaults totalCount to testCases.length when totalCount not provided', () => {
    const { container } = render(
      <>{renderTestCoverageDetails(makeProps('test-coverage', {
        testCases: [
          { id: 'TC-A', title: 'A', status: 'passed' },
          { id: 'TC-B', title: 'B', status: 'draft' },
          { id: 'TC-C', title: 'C', status: 'failed' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('3 total');
  });
});
