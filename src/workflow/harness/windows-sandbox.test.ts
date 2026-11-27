import { describe, it, expect } from 'vitest';
import { pathWithoutWindowsApps, supportsTestIsolation, shouldRunNodeTestsInProcess } from './windows-sandbox';

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

describe('pathWithoutWindowsApps', () => {
  const WINDOWS_APPS = String.raw`C:\Users\me\AppData\Local\Microsoft\WindowsApps`;
  const SYSTEM32 = String.raw`C:\Windows\System32`;
  const NODEJS = String.raw`C:\Program Files\nodejs`;

  it('drops the Store app-alias folder, which the sandbox cannot launch from', () => {
    const env = { Path: [SYSTEM32, WINDOWS_APPS, NODEJS].join(';') };
    expect(pathWithoutWindowsApps(env)).toEqual({ Path: `${SYSTEM32};${NODEJS}` });
  });

  it('keeps the variable name the environment uses', () => {
    expect(pathWithoutWindowsApps({ PATH: `${WINDOWS_APPS.toLowerCase()};${NODEJS}` })).toEqual({ PATH: NODEJS });
  });

  it('returns undefined when there is nothing to drop', () => {
    expect(pathWithoutWindowsApps({ Path: SYSTEM32 })).toBeUndefined();
    expect(pathWithoutWindowsApps({})).toBeUndefined();
  });
});
