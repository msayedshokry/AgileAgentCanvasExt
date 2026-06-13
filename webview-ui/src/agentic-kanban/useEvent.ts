import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a stable function reference that always invokes the latest version
 * of `fn`. Useful for event handlers and effects that need a stable identity
 * (so consumers don't re-subscribe or re-render) but must read current state.
 *
 * This is the "latest ref" pattern recommended by the React team. It's a
 * smaller alternative to the ref-mirror-of-state anti-pattern, where you'd
 * otherwise need `useRef(state)` mirrors plus `useCallback(..., [])` to read
 * current state inside a stable handler.
 *
 * The ref is updated in a `useLayoutEffect` (synchronous after render, before
 * paint) so a handler invoked during a child commit always sees the latest
 * implementation.
 */
export function useEvent<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: TArgs) => ref.current(...args), []) as (...args: TArgs) => TReturn;
}
