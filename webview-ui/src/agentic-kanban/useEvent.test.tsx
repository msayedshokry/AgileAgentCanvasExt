/**
 * useEvent Hook Tests
 * Verifies the "latest ref" pattern: stable function identity, latest closure.
 * This is the foundation that lets the AgenticKanbanApp refactor drop
 * 4 ref-of-state mirrors.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useEvent } from './useEvent';

describe('useEvent', () => {
  it('returns a function', () => {
    const { result } = renderHook(() => useEvent(() => 42));
    expect(typeof result.current).toBe('function');
  });

  it('returns a stable identity across re-renders', () => {
    const { result, rerender } = renderHook(() => useEvent(() => 'a'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('always invokes the latest closure (reads current state)', () => {
    const { result, rerender } = renderHook(() => {
      const [count, setCount] = useState(0);
      const handler = useEvent(() => count);
      return { count, setCount, handler };
    });

    expect(result.current.handler()).toBe(0);

    act(() => {
      result.current.setCount(5);
    });
    rerender();

    // The handler still has its original identity, but it reads the latest count.
    expect(result.current.handler()).toBe(5);
  });

  it('forwards arguments correctly', () => {
    const { result } = renderHook(() =>
      useEvent((a: number, b: number) => a + b),
    );
    expect(result.current(2, 3)).toBe(5);
  });

  it('preserves the return value', () => {
    const { result } = renderHook(() => useEvent(() => ({ ok: true })));
    expect(result.current()).toEqual({ ok: true });
  });

  it('does not invoke the function during render', () => {
    const fn = vi.fn(() => 1);
    renderHook(() => useEvent(fn));
    expect(fn).not.toHaveBeenCalled();
  });

  it('survives multiple re-renders without losing latest closure', () => {
    const { result, rerender } = renderHook(() => {
      const [value, setValue] = useState('first');
      const handler = useEvent(() => value);
      return { setValue, handler };
    });

    expect(result.current.handler()).toBe('first');

    act(() => result.current.setValue('second'));
    rerender();
    expect(result.current.handler()).toBe('second');

    act(() => result.current.setValue('third'));
    rerender();
    expect(result.current.handler()).toBe('third');
  });
});
