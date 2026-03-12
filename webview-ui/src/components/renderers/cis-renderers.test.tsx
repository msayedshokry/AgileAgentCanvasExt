/**
 * Smoke tests for cis-renderers.tsx
 *
 * Each exported renderer is tested with minimal props to verify it renders
 * without crashing, plus a second test with representative data.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Artifact } from '../../types';
import type { RendererProps } from './shared';
import {
  renderStorytellingDetails,
  renderProblemSolvingDetails,
  renderInnovationStrategyDetails,
  renderDesignThinkingDetails,
} from './cis-renderers';

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

describe('cis-renderers smoke tests', () => {
  // Storytelling
  it('renderStorytellingDetails — empty', () => {
    expect(() => render(<>{renderStorytellingDetails(makeProps('storytelling'))}</>)).not.toThrow();
  });

  it('renderStorytellingDetails — with data', () => {
    const { container } = render(
      <>{renderStorytellingDetails(makeProps('storytelling', {
        storyType: 'origin',
        frameworkName: "The Hero's Journey",
        storyTitle: 'Our Beginning',
        purpose: 'Inspire the team',
        targetAudience: { audienceProfile: { primary: 'Engineers' } },
        strategicContext: { businessGoals: ['Growth'] },
        structure: {
          openingHook: { text: 'Once upon a time...', technique: 'question' },
          storyBeats: [{ beat: 'Introduction', purpose: 'Set the scene' }],
          climax: 'The breakthrough moment',
          resolution: 'We shipped it',
        },
      }))}</>
    );
    expect(container.textContent).toContain('Our Beginning');
  });

  // Problem Solving
  it('renderProblemSolvingDetails — empty', () => {
    expect(() => render(<>{renderProblemSolvingDetails(makeProps('problem-solving'))}</>)).not.toThrow();
  });

  it('renderProblemSolvingDetails — with data', () => {
    const { container } = render(
      <>{renderProblemSolvingDetails(makeProps('problem-solving', {
        problemTitle: 'Slow Rendering',
        problemCategory: 'Performance',
        problemDefinition: {
          initialStatement: 'Canvas is slow',
          refinedStatement: 'Canvas rendering >60ms per frame',
          context: 'WebView environment',
          stakeholders: ['Users', 'Dev team'],
          successCriteria: ['<16ms per frame'],
        },
        diagnosis: {
          rootCauseAnalysis: 'Too many DOM nodes',
        },
        recommendedSolution: {
          title: 'Virtual rendering',
          description: 'Only render visible nodes',
          steps: ['Implement viewport culling', 'Add virtualized list'],
        },
        alternativeSolutions: [
          { title: 'Canvas API', pros: ['Fast'], cons: ['Complex'], feasibility: 'medium' },
        ],
      }))}</>
    );
    expect(container.textContent).toContain('Slow Rendering');
  });

  // Innovation Strategy
  it('renderInnovationStrategyDetails — empty', () => {
    expect(() => render(<>{renderInnovationStrategyDetails(makeProps('innovation-strategy'))}</>)).not.toThrow();
  });

  it('renderInnovationStrategyDetails — with data', () => {
    const { container } = render(
      <>{renderInnovationStrategyDetails(makeProps('innovation-strategy', {
        companyName: 'Acme Corp',
        strategicFocus: 'AI Integration',
        strategicContext: {
          currentSituation: 'Manual processes',
          strategicChallenge: 'Need automation',
          visionStatement: 'AI-first company',
          strategicObjectives: ['Automate 80% of tasks'],
        },
        marketAnalysis: {
          marketLandscape: 'Growing AI market',
          competitiveDynamics: 'First mover advantage possible',
          marketOpportunities: [{ opportunity: 'AI testing', potential: 'High' }],
        },
        recommendedStrategy: {
          name: 'AI Integration Plan',
          description: 'Phased AI adoption',
          keyInitiatives: ['Pilot project', 'Full rollout'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Acme Corp');
  });

  // Design Thinking
  it('renderDesignThinkingDetails — empty', () => {
    expect(() => render(<>{renderDesignThinkingDetails(makeProps('design-thinking'))}</>)).not.toThrow();
  });

  it('renderDesignThinkingDetails — with data', () => {
    const { container } = render(
      <>{renderDesignThinkingDetails(makeProps('design-thinking', {
        projectName: 'BMAD Redesign',
        designChallenge: 'How might we make artifact management intuitive?',
        empathize: {
          researchMethods: ['Interviews', 'Observation'],
          userProfiles: [{ name: 'Developer Dan', role: 'Engineer', goals: ['Ship fast'] }],
          userInsights: ['Users want visual feedback'],
        },
        define: {
          problemStatement: 'Users struggle to see dependencies',
          hmwQuestions: ['HMW make dependencies visible?'],
        },
        ideate: {
          ideas: [{ id: 'I1', name: 'Dependency arrows', description: 'Visual arrows between cards' }],
          selectedIdeas: ['I1'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('BMAD Redesign');
  });
});

// ── Edit mode smoke tests ──────────────────────────────────────────────────

describe('cis-renderers edit mode', () => {
  it('renderStorytellingDetails in edit mode', () => {
    expect(() => render(<>{renderStorytellingDetails(makeEditProps('storytelling'))}</>)).not.toThrow();
  });

  it('renderProblemSolvingDetails in edit mode', () => {
    expect(() => render(<>{renderProblemSolvingDetails(makeEditProps('problem-solving'))}</>)).not.toThrow();
  });

  it('renderInnovationStrategyDetails in edit mode', () => {
    expect(() => render(<>{renderInnovationStrategyDetails(makeEditProps('innovation-strategy'))}</>)).not.toThrow();
  });

  it('renderDesignThinkingDetails in edit mode', () => {
    expect(() => render(<>{renderDesignThinkingDetails(makeEditProps('design-thinking'))}</>)).not.toThrow();
  });
});

// ── Deep tests: Storytelling ───────────────────────────────────────────────

describe('renderStorytellingDetails deep', () => {
  it('renders Story Overview with story type and framework', () => {
    const { container } = render(
      <>{renderStorytellingDetails(makeProps('storytelling', {
        storyType: 'brand',
        frameworkName: 'Pixar Framework',
        storyTitle: 'Company Origins',
      }))}</>
    );
    expect(container.textContent).toContain('Company Origins');
    expect(container.textContent).toContain('brand');
    expect(container.textContent).toContain('Pixar Framework');
  });

  it('renders Complete Story section', () => {
    const { container } = render(
      <>{renderStorytellingDetails(makeProps('storytelling', {
        storyTitle: 'Test',
        completeStory: 'Once upon a time, a startup changed the world.',
      }))}</>
    );
    expect(container.textContent).toContain('Once upon a time');
  });

  it('renders Characters items', () => {
    const { container } = render(
      <>{renderStorytellingDetails(makeProps('storytelling', {
        storyTitle: 'Test',
        elements: {
          characters: [
            { name: 'Alice', role: 'Protagonist', description: 'A brave engineer' },
            { name: 'Bob', role: 'Mentor', description: 'The wise CTO' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Protagonist');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).toContain('Mentor');
  });

  it('renders Key Messages items', () => {
    const { container } = render(
      <>{renderStorytellingDetails(makeProps('storytelling', {
        storyTitle: 'Test',
        elements: {
          keyMessages: [
            { message: 'Innovation drives growth', howConveyed: 'Through anecdotes' },
            { message: 'Teamwork matters', howConveyed: 'Via dialogue' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Innovation drives growth');
    expect(container.textContent).toContain('Teamwork matters');
  });

  it('renders Story Variations section', () => {
    const { container } = render(
      <>{renderStorytellingDetails(makeProps('storytelling', {
        storyTitle: 'Test',
        variations: {
          elevator: { text: 'A 30-second pitch about our product' },
          short: { text: 'A 2-minute version for meetings' },
        },
      }))}</>
    );
    expect(container.textContent).toContain('30-second pitch');
    expect(container.textContent).toContain('2-minute version');
  });
});

// ── Deep tests: Problem Solving ────────────────────────────────────────────

describe('renderProblemSolvingDetails deep', () => {
  it('renders Problem Overview with title and category', () => {
    const { container } = render(
      <>{renderProblemSolvingDetails(makeProps('problem-solving', {
        problemTitle: 'Memory Leak in Worker',
        problemCategory: 'Performance',
      }))}</>
    );
    expect(container.textContent).toContain('Memory Leak in Worker');
    expect(container.textContent).toContain('Performance');
  });

  it('renders Problem Definition with refined statement', () => {
    const { container } = render(
      <>{renderProblemSolvingDetails(makeProps('problem-solving', {
        problemTitle: 'Test',
        problemDefinition: {
          initialStatement: 'App is slow',
          refinedStatement: 'Worker thread leaks 50MB per hour under load',
          context: 'Production environment',
          stakeholders: ['DevOps', 'Backend team'],
          successCriteria: ['Memory stable over 24h'],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Worker thread leaks 50MB per hour');
  });

  it('renders Root Cause Analysis', () => {
    const { container } = render(
      <>{renderProblemSolvingDetails(makeProps('problem-solving', {
        problemTitle: 'Test',
        diagnosis: {
          rootCauseAnalysis: {
            analysis: 'Event listeners not cleaned up on disconnect',
            rootCauses: [{ cause: 'Missing cleanup in useEffect', evidence: 'Heap snapshot' }],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Event listeners not cleaned up');
  });

  it('renders Generated Solutions items', () => {
    const { container } = render(
      <>{renderProblemSolvingDetails(makeProps('problem-solving', {
        problemTitle: 'Test',
        solutionGeneration: {
          generatedSolutions: [
            { title: 'WeakRef pattern', description: 'Use WeakRef for listeners' },
            { title: 'AbortController', description: 'Use AbortController for cleanup' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('WeakRef pattern');
    expect(container.textContent).toContain('AbortController');
  });

  it('renders Recommended Solution', () => {
    const { container } = render(
      <>{renderProblemSolvingDetails(makeProps('problem-solving', {
        problemTitle: 'Test',
        recommendedSolution: {
          title: 'AbortController cleanup',
          description: 'Implement AbortController in all WebSocket handlers',
        },
      }))}</>
    );
    expect(container.textContent).toContain('AbortController cleanup');
  });

  it('renders Implementation Plan', () => {
    const { container } = render(
      <>{renderProblemSolvingDetails(makeProps('problem-solving', {
        problemTitle: 'Test',
        implementationPlan: {
          approach: 'Phased rollout over 2 sprints',
          phases: [{ name: 'Phase 1', description: 'Audit all listeners' }],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Phased rollout');
  });
});

// ── Deep tests: Innovation Strategy ────────────────────────────────────────

describe('renderInnovationStrategyDetails deep', () => {
  it('renders Strategy Overview with company and focus', () => {
    const { container } = render(
      <>{renderInnovationStrategyDetails(makeProps('innovation-strategy', {
        companyName: 'TechCo',
        strategicFocus: 'AI-first products',
      }))}</>
    );
    expect(container.textContent).toContain('TechCo');
    expect(container.textContent).toContain('AI-first products');
  });

  it('renders Market Landscape section', () => {
    const { container } = render(
      <>{renderInnovationStrategyDetails(makeProps('innovation-strategy', {
        companyName: 'Test',
        marketAnalysis: {
          marketLandscape: {
            overview: 'Rapidly growing AI market worth $200B',
            keyTrends: [{ trend: 'LLM adoption', impact: 'Transformative' }],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Rapidly growing AI market');
  });

  it('renders SWOT Analysis section', () => {
    const { container } = render(
      <>{renderInnovationStrategyDetails(makeProps('innovation-strategy', {
        companyName: 'Test',
        marketAnalysis: {
          swotAnalysis: {
            strengths: [{ strength: 'Strong engineering team' }],
            weaknesses: [{ weakness: 'Limited market presence' }],
            opportunities: [{ opportunity: 'Emerging markets' }],
            threats: [{ threat: 'Competitor innovation' }],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('Strong engineering team');
    expect(container.textContent).toContain('Limited market presence');
    expect(container.textContent).toContain('Emerging markets');
    expect(container.textContent).toContain('Competitor innovation');
  });

  it('renders Business Model section', () => {
    const { container } = render(
      <>{renderInnovationStrategyDetails(makeProps('innovation-strategy', {
        companyName: 'Test',
        businessModelAnalysis: {
          currentBusinessModel: 'SaaS subscription model',
        },
      }))}</>
    );
    expect(container.textContent).toContain('SaaS subscription model');
  });

  it('renders Innovation Initiatives items', () => {
    const { container } = render(
      <>{renderInnovationStrategyDetails(makeProps('innovation-strategy', {
        companyName: 'Test',
        innovationOpportunities: {
          innovationInitiatives: [
            { name: 'AI Copilot', description: 'Build an AI coding assistant' },
            { name: 'Edge Computing', description: 'Deploy ML models at edge' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('AI Copilot');
    expect(container.textContent).toContain('Edge Computing');
  });
});

// ── Deep tests: Design Thinking ────────────────────────────────────────────

describe('renderDesignThinkingDetails deep', () => {
  it('renders Design Challenge with project name', () => {
    const { container } = render(
      <>{renderDesignThinkingDetails(makeProps('design-thinking', {
        projectName: 'Dashboard Redesign',
        designChallenge: 'How might we simplify the analytics dashboard?',
      }))}</>
    );
    expect(container.textContent).toContain('Dashboard Redesign');
    expect(container.textContent).toContain('simplify the analytics dashboard');
  });

  it('renders Empathy Map Says section', () => {
    const { container } = render(
      <>{renderDesignThinkingDetails(makeProps('design-thinking', {
        projectName: 'Test',
        empathize: {
          empathyMap: {
            targetUser: 'Product Manager',
            says: [{ quote: 'I need faster insights', context: 'Weekly review' }],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('I need faster insights');
    expect(container.textContent).toContain('Product Manager');
  });

  it('renders Empathy Map Thinks and Feels sections', () => {
    const { container } = render(
      <>{renderDesignThinkingDetails(makeProps('design-thinking', {
        projectName: 'Test',
        empathize: {
          empathyMap: {
            thinks: [{ thought: 'This is too complex', evidence: 'Survey results' }],
            feels: [{ emotion: 'Frustrated', intensity: 'high', trigger: 'Slow load times' }],
          },
        },
      }))}</>
    );
    expect(container.textContent).toContain('This is too complex');
    expect(container.textContent).toContain('Frustrated');
  });

  it('renders Define POV Statement and HMW Questions', () => {
    const { container } = render(
      <>{renderDesignThinkingDetails(makeProps('design-thinking', {
        projectName: 'Test',
        define: {
          povStatement: 'Product managers need quick data access because time is scarce',
          howMightWeQuestions: [
            { question: 'HMW reduce dashboard load time?', priority: 'high', rationale: 'Top complaint' },
            { question: 'HMW auto-surface key metrics?', priority: 'medium' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Product managers need quick data access');
    expect(container.textContent).toContain('HMW reduce dashboard load time?');
    expect(container.textContent).toContain('HMW auto-surface key metrics?');
  });

  it('renders Ideate Generated Ideas', () => {
    const { container } = render(
      <>{renderDesignThinkingDetails(makeProps('design-thinking', {
        projectName: 'Test',
        ideate: {
          generatedIdeas: [
            { title: 'Smart Widget', description: 'AI-powered metric widget', category: 'AI', votes: 8 },
            { title: 'Quick Filters', description: 'One-click data filters', category: 'UX', votes: 12 },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Smart Widget');
    expect(container.textContent).toContain('Quick Filters');
    expect(container.textContent).toContain('8 votes');
    expect(container.textContent).toContain('12 votes');
  });

  it('renders Prototype section', () => {
    const { container } = render(
      <>{renderDesignThinkingDetails(makeProps('design-thinking', {
        projectName: 'Test',
        prototype: {
          prototypeApproach: 'Rapid lo-fi prototyping in Figma',
          prototypeType: 'digital-lo-fi',
          prototypes: [
            { name: 'Dashboard v1', fidelity: 'low', description: 'Basic wireframe layout' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Rapid lo-fi prototyping');
    expect(container.textContent).toContain('Dashboard v1');
    expect(container.textContent).toContain('low fidelity');
  });

  it('renders Test User Feedback items with sentiment', () => {
    const { container } = render(
      <>{renderDesignThinkingDetails(makeProps('design-thinking', {
        projectName: 'Test',
        test: {
          userFeedback: [
            { feedback: 'Love the new layout', sentiment: 'positive', user: 'PM-1', feature: 'Dashboard' },
            { feedback: 'Colors are confusing', sentiment: 'negative', user: 'PM-2', feature: 'Charts' },
          ],
        },
      }))}</>
    );
    expect(container.textContent).toContain('Love the new layout');
    expect(container.textContent).toContain('positive');
    expect(container.textContent).toContain('Colors are confusing');
    expect(container.textContent).toContain('negative');
  });
});
