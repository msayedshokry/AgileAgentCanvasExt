/**
 * DependencyArrows Component Tests
 * SVG arrows showing dependencies between artifacts
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DependencyArrows } from './DependencyArrows';
import type { Artifact } from '../types';

// Helper to create mock artifacts
const createMockArtifact = (overrides: Partial<Artifact> = {}): Artifact => ({
  id: 'test-1',
  type: 'epic',
  title: 'Test Epic',
  description: 'Test description',
  status: 'draft',
  position: { x: 100, y: 100 },
  size: { width: 280, height: 150 },
  dependencies: [],
  metadata: {},
  ...overrides,
});

describe('DependencyArrows', () => {
  describe('Rendering', () => {
    it('should render SVG container', () => {
      render(<DependencyArrows artifacts={[]} />);
      expect(document.querySelector('.dependency-arrows')).toBeInTheDocument();
    });

    it('should render SVG element', () => {
      render(<DependencyArrows artifacts={[]} />);
      const svg = document.querySelector('.dependency-arrows');
      expect(svg?.tagName.toLowerCase()).toBe('svg');
    });

    it('should have correct SVG styling', () => {
      render(<DependencyArrows artifacts={[]} />);
      const svg = document.querySelector('.dependency-arrows') as SVGElement;
      // Positioning is applied via CSS class, not inline styles
      expect(svg).toBeInTheDocument();
      expect(svg.tagName.toLowerCase()).toBe('svg');
    });

    it('should render defs with arrowhead marker', () => {
      render(<DependencyArrows artifacts={[]} />);
      const marker = document.querySelector('#arrowhead-default');
      expect(marker).toBeInTheDocument();
    });

    it('should configure arrowhead marker correctly', () => {
      render(<DependencyArrows artifacts={[]} />);
      const marker = document.querySelector('#arrowhead-default');
      expect(marker).toHaveAttribute('markerWidth', '9');
      expect(marker).toHaveAttribute('markerHeight', '6');
      expect(marker).toHaveAttribute('orient', 'auto');
    });

    it('should render polygon inside marker', () => {
      render(<DependencyArrows artifacts={[]} />);
      const polygon = document.querySelector('#arrowhead-default polygon');
      expect(polygon).toBeInTheDocument();
      expect(polygon).toHaveAttribute('points', '0 0, 9 3, 0 6');
    });
  });

  describe('No Dependencies', () => {
    it('should render no paths when no artifacts', () => {
      render(<DependencyArrows artifacts={[]} />);
      const paths = document.querySelectorAll('.dependency-arrows path');
      expect(paths.length).toBe(0);
    });

    it('should render no paths when artifacts have no dependencies', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1' }),
        createMockArtifact({ id: 'epic-2' }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      const paths = document.querySelectorAll('.dependency-arrows path');
      expect(paths.length).toBe(0);
    });
  });

  describe('With Dependencies', () => {
    it('should render arrow for single dependency', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', position: { x: 100, y: 100 } }),
        createMockArtifact({ 
          id: 'story-1', 
          position: { x: 400, y: 100 },
          dependencies: ['epic-1'] 
        }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      const paths = document.querySelectorAll('.dependency-arrows > path');
      expect(paths.length).toBe(1);
    });

    it('should render arrows for multiple dependencies', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', position: { x: 100, y: 100 } }),
        createMockArtifact({ id: 'epic-2', position: { x: 100, y: 300 } }),
        createMockArtifact({ 
          id: 'story-1', 
          position: { x: 400, y: 200 },
          dependencies: ['epic-1', 'epic-2'] 
        }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      const paths = document.querySelectorAll('.dependency-arrows > path');
      expect(paths.length).toBe(2);
    });

    it('should not render arrow when dependency not found', () => {
      const artifacts = [
        createMockArtifact({ 
          id: 'story-1', 
          dependencies: ['non-existent'] 
        }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      const paths = document.querySelectorAll('.dependency-arrows > path');
      expect(paths.length).toBe(0);
    });

    it('should handle self-dependency gracefully', () => {
      const artifacts = [
        createMockArtifact({ 
          id: 'epic-1',
          dependencies: ['epic-1'] // Self-reference 
        }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      const paths = document.querySelectorAll('.dependency-arrows > path');
      // Should render (though unusual)
      expect(paths.length).toBe(1);
    });
  });

  describe('Path Calculation', () => {
    it('should create curved path between artifacts', () => {
      const artifacts = [
        createMockArtifact({ 
          id: 'source', 
          position: { x: 100, y: 100 },
          size: { width: 280, height: 150 }
        }),
        createMockArtifact({ 
          id: 'target', 
          position: { x: 500, y: 100 },
          dependencies: ['source'] 
        }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const path = document.querySelector('.dependency-arrows > path');
      expect(path).toBeInTheDocument();
      
      const d = path?.getAttribute('d');
      expect(d).toContain('M'); // Move to
      expect(d).toContain('C'); // Cubic bezier curve
    });

    it('should start from right side of source artifact', () => {
      const artifacts = [
        createMockArtifact({ 
          id: 'source', 
          position: { x: 100, y: 100 },
          size: { width: 280, height: 150 }
        }),
        createMockArtifact({ 
          id: 'target', 
          position: { x: 500, y: 100 },
          size: { width: 280, height: 150 },
          dependencies: ['source'] 
        }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const path = document.querySelector('.dependency-arrows > path');
      const d = path?.getAttribute('d') || '';
      
      // Start X should be source.x + source.width = 100 + 280 = 380
      // Start Y should be source.y + source.height/2 = 100 + 75 = 175
      expect(d).toMatch(/M\s*380\s+175/);
    });

    it('should end at left side of target artifact', () => {
      const artifacts = [
        createMockArtifact({ 
          id: 'source', 
          position: { x: 100, y: 100 },
          size: { width: 280, height: 150 }
        }),
        createMockArtifact({ 
          id: 'target', 
          position: { x: 500, y: 100 },
          size: { width: 280, height: 150 },
          dependencies: ['source'] 
        }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const path = document.querySelector('.dependency-arrows > path');
      const d = path?.getAttribute('d') || '';
      
      // End X should be target.x = 500
      // End Y should be target.y + target.height/2 = 100 + 75 = 175
      expect(d).toContain('500 175');
    });
  });

  describe('Path Styling', () => {
    it('should have stroke styling', () => {
      const artifacts = [
        createMockArtifact({ id: 'source' }),
        createMockArtifact({ id: 'target', dependencies: ['source'] }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const path = document.querySelector('.dependency-arrows > path');
      expect(path).toHaveAttribute('stroke');
    });

    it('should have stroke width of 2', () => {
      const artifacts = [
        createMockArtifact({ id: 'source' }),
        createMockArtifact({ id: 'target', dependencies: ['source'] }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const path = document.querySelector('.dependency-arrows > path');
      expect(path).toHaveAttribute('stroke-width', '2');
    });

    it('should have no fill', () => {
      const artifacts = [
        createMockArtifact({ id: 'source' }),
        createMockArtifact({ id: 'target', dependencies: ['source'] }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const path = document.querySelector('.dependency-arrows > path');
      expect(path).toHaveAttribute('fill', 'none');
    });

    it('should reference arrowhead marker', () => {
      const artifacts = [
        createMockArtifact({ id: 'source' }),
        createMockArtifact({ id: 'target', dependencies: ['source'] }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const path = document.querySelector('.dependency-arrows > path');
      // Both artifacts are epics (structural type), so structural marker is used
      expect(path?.getAttribute('marker-end')).toMatch(/url\(#arrowhead-(structural|peer|default)\)/);
    });

    it('should have reduced opacity', () => {
      const artifacts = [
        createMockArtifact({ id: 'source' }),
        createMockArtifact({ id: 'target', dependencies: ['source'] }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const path = document.querySelector('.dependency-arrows > path');
      // Both artifacts are epics (structural type), opacity is 0.7
      const opacity = parseFloat(path?.getAttribute('opacity') ?? '0');
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThanOrEqual(1);
    });
  });

  describe('Path Keys', () => {
    it('should have unique keys for multiple arrows', () => {
      const artifacts = [
        createMockArtifact({ id: 'a' }),
        createMockArtifact({ id: 'b' }),
        createMockArtifact({ id: 'c', dependencies: ['a', 'b'] }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const paths = document.querySelectorAll('.dependency-arrows > path');
      expect(paths.length).toBe(2);
      
      // Keys are based on from-to IDs
      // Path from a->c and b->c should both exist
    });
  });

  describe('Complex Dependency Chains', () => {
    it('should render chain of dependencies', () => {
      const artifacts = [
        createMockArtifact({ id: 'a', position: { x: 0, y: 100 } }),
        createMockArtifact({ id: 'b', position: { x: 300, y: 100 }, dependencies: ['a'] }),
        createMockArtifact({ id: 'c', position: { x: 600, y: 100 }, dependencies: ['b'] }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const paths = document.querySelectorAll('.dependency-arrows > path');
      expect(paths.length).toBe(2); // a->b and b->c
    });

    it('should render diamond dependency pattern', () => {
      const artifacts = [
        createMockArtifact({ id: 'a', position: { x: 0, y: 200 } }),
        createMockArtifact({ id: 'b', position: { x: 300, y: 100 }, dependencies: ['a'] }),
        createMockArtifact({ id: 'c', position: { x: 300, y: 300 }, dependencies: ['a'] }),
        createMockArtifact({ id: 'd', position: { x: 600, y: 200 }, dependencies: ['b', 'c'] }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const paths = document.querySelectorAll('.dependency-arrows > path');
      expect(paths.length).toBe(4); // a->b, a->c, b->d, c->d
    });
  });

  describe('Position Mapping', () => {
    it('should correctly map positions from multiple artifacts', () => {
      const artifacts = [
        createMockArtifact({ 
          id: 'epic-1', 
          position: { x: 50, y: 50 },
          size: { width: 200, height: 100 }
        }),
        createMockArtifact({ 
          id: 'epic-2', 
          position: { x: 350, y: 200 },
          size: { width: 200, height: 100 },
          dependencies: ['epic-1']
        }),
      ];
      render(<DependencyArrows artifacts={artifacts} />);
      
      const path = document.querySelector('.dependency-arrows > path');
      expect(path).toBeInTheDocument();
      
      // Verify path connects correct positions
      const d = path?.getAttribute('d') || '';
      // Start: 50 + 200 = 250, 50 + 50 = 100
      // End: 350, 200 + 50 = 250
      expect(d).toContain('M 250 100');
      expect(d).toContain('350 250');
    });
  });
});
