import { describe, it, expect } from 'vitest';
import { supportsTestIsolation, shouldRunNodeTestsInProcess } from './node-test-isolation';

describe('supportsTestIsolation', () => {
  it.each([
    ['v24.11.1', true],
    ['v22.8.0', true],
    ['v23.0.0', true],
    ['v22.7.9', false],
    ['v20.18.0', false],
    ['v18.20.4', false],
    ['', false],
    ['not a version', false],
  ])('%s → %s', (version, expected) => {
    expect(supportsTestIsolation(version)).toBe(expected);
  });
});

describe('shouldRunNodeTestsInProcess', () => {
  it('only applies to the sandboxed posture on Windows with a new enough Node', () => {
    expect(shouldRunNodeTestsInProcess('win32', 'sandboxed', 'v24.11.1')).toBe(true);
    expect(shouldRunNodeTestsInProcess('win32', 'full', 'v24.11.1')).toBe(false);
    expect(shouldRunNodeTestsInProcess('linux', 'sandboxed', 'v24.11.1')).toBe(false);
    expect(shouldRunNodeTestsInProcess('win32', 'sandboxed', 'v20.18.0')).toBe(false);
    expect(shouldRunNodeTestsInProcess('win32', 'sandboxed', undefined)).toBe(false);
  });
});
