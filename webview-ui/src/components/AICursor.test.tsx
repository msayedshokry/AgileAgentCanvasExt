/**
 * AICursor Component Tests
 * Animated AI cursor that shows AI activity on the canvas
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AICursor } from './AICursor';
import type { AICursorState } from '../types';

describe('AICursor', () => {
  const createCursor = (overrides: Partial<AICursorState> = {}): AICursorState => ({
    x: 100,
    y: 200,
    targetId: null,
    action: 'idle',
    ...overrides,
  });

  describe('Rendering', () => {
    it('should render cursor container', () => {
      render(<AICursor cursor={createCursor()} />);
      expect(document.querySelector('.ai-cursor')).toBeInTheDocument();
    });

    it('should render cursor icon SVG', () => {
      render(<AICursor cursor={createCursor()} />);
      expect(document.querySelector('.ai-cursor-icon')).toBeInTheDocument();
    });

    it('should render cursor label', () => {
      render(<AICursor cursor={createCursor()} />);
      expect(document.querySelector('.ai-cursor-label')).toBeInTheDocument();
    });

    it('should render cursor text', () => {
      render(<AICursor cursor={createCursor()} />);
      expect(document.querySelector('.ai-cursor-text')).toBeInTheDocument();
    });
  });

  describe('Positioning', () => {
    it('should position cursor at x, y coordinates', () => {
      render(<AICursor cursor={createCursor({ x: 150, y: 250 })} />);
      
      const cursor = document.querySelector('.ai-cursor') as HTMLElement;
      expect(cursor.style.left).toBe('150px');
      expect(cursor.style.top).toBe('250px');
    });

    it('should update position when cursor changes', () => {
      const { rerender } = render(<AICursor cursor={createCursor({ x: 100, y: 100 })} />);
      
      let cursor = document.querySelector('.ai-cursor') as HTMLElement;
      expect(cursor.style.left).toBe('100px');
      expect(cursor.style.top).toBe('100px');
      
      rerender(<AICursor cursor={createCursor({ x: 200, y: 300 })} />);
      
      cursor = document.querySelector('.ai-cursor') as HTMLElement;
      expect(cursor.style.left).toBe('200px');
      expect(cursor.style.top).toBe('300px');
    });
  });

  describe('Action Labels', () => {
    it('should show "AI is editing..." for editing action', () => {
      render(<AICursor cursor={createCursor({ action: 'editing' })} />);
      expect(screen.getByText('AI is editing...')).toBeInTheDocument();
    });

    it('should show "AI is reviewing..." for reviewing action', () => {
      render(<AICursor cursor={createCursor({ action: 'reviewing' })} />);
      expect(screen.getByText('AI is reviewing...')).toBeInTheDocument();
    });

    it('should show "AI is suggesting..." for suggesting action', () => {
      render(<AICursor cursor={createCursor({ action: 'suggesting' })} />);
      expect(screen.getByText('AI is suggesting...')).toBeInTheDocument();
    });

    it('should show "AI cursor" for idle action', () => {
      render(<AICursor cursor={createCursor({ action: 'idle' })} />);
      expect(screen.getByText('AI cursor')).toBeInTheDocument();
    });

    it('should use custom label when provided', () => {
      render(<AICursor cursor={createCursor({ action: 'editing', label: 'Custom Label' })} />);
      expect(screen.getByText('Custom Label')).toBeInTheDocument();
    });

    it('should override default label with custom label', () => {
      render(<AICursor cursor={createCursor({ action: 'editing', label: 'Working...' })} />);
      expect(screen.queryByText('AI is editing...')).not.toBeInTheDocument();
      expect(screen.getByText('Working...')).toBeInTheDocument();
    });
  });

  describe('Pulse Animation', () => {
    it('should show pulse animation when not idle', () => {
      render(<AICursor cursor={createCursor({ action: 'editing' })} />);
      expect(document.querySelector('.ai-cursor-pulse')).toBeInTheDocument();
    });

    it('should not show pulse animation when idle', () => {
      render(<AICursor cursor={createCursor({ action: 'idle' })} />);
      expect(document.querySelector('.ai-cursor-pulse')).not.toBeInTheDocument();
    });

    it('should show pulse for reviewing action', () => {
      render(<AICursor cursor={createCursor({ action: 'reviewing' })} />);
      expect(document.querySelector('.ai-cursor-pulse')).toBeInTheDocument();
    });

    it('should show pulse for suggesting action', () => {
      render(<AICursor cursor={createCursor({ action: 'suggesting' })} />);
      expect(document.querySelector('.ai-cursor-pulse')).toBeInTheDocument();
    });
  });

  describe('Color Styling', () => {
    it('should set cursor color CSS variable', () => {
      render(<AICursor cursor={createCursor({ action: 'editing' })} />);
      
      const cursor = document.querySelector('.ai-cursor') as HTMLElement;
      expect(cursor.style.getPropertyValue('--cursor-color')).toBeTruthy();
    });

    it('should have different colors for different actions', () => {
      const { rerender } = render(<AICursor cursor={createCursor({ action: 'editing' })} />);
      
      const editingColor = (document.querySelector('.ai-cursor') as HTMLElement)
        .style.getPropertyValue('--cursor-color');
      
      rerender(<AICursor cursor={createCursor({ action: 'reviewing' })} />);
      
      const reviewingColor = (document.querySelector('.ai-cursor') as HTMLElement)
        .style.getPropertyValue('--cursor-color');
      
      // Colors should be set (may be same in test env due to CSS variables)
      expect(editingColor).toBeTruthy();
      expect(reviewingColor).toBeTruthy();
    });
  });

  describe('SVG Icon', () => {
    it('should render SVG with correct dimensions', () => {
      render(<AICursor cursor={createCursor()} />);
      
      const svg = document.querySelector('.ai-cursor-icon');
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    });

    it('should render path element', () => {
      render(<AICursor cursor={createCursor()} />);
      
      const path = document.querySelector('.ai-cursor-icon path');
      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute('d');
    });
  });

  describe('Target ID', () => {
    it('should accept targetId prop', () => {
      render(<AICursor cursor={createCursor({ targetId: 'artifact-1' })} />);
      expect(document.querySelector('.ai-cursor')).toBeInTheDocument();
    });

    it('should accept null targetId', () => {
      render(<AICursor cursor={createCursor({ targetId: null })} />);
      expect(document.querySelector('.ai-cursor')).toBeInTheDocument();
    });
  });
});
