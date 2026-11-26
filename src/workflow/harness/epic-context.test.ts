import { describe, it, expect } from 'vitest';
import { epicContextSection, readEpicContext, validateEpicContext, MAX_CONTEXT_PATHS } from './epic-context';

describe('validateEpicContext', () => {
  it('takes one path or link per line, trims, dedupes and normalises slashes', () => {
    expect(validateEpicContext({ paths: 'docs/spec.md\n  src\\auth\\ \n\ndocs/spec.md', urls: 'https://example.com/design\n', note: '  Use the v2 API  ' }))
      .toEqual({ context: { paths: ['docs/spec.md', 'src/auth/'], urls: ['https://example.com/design'], note: 'Use the v2 API' } });
  });

  it('refuses paths outside the workspace and links that are not http(s)', () => {
    expect(validateEpicContext({ paths: '/etc/passwd' })).toEqual({ error: 'Path "/etc/passwd" must be relative to the workspace' });
    expect(validateEpicContext({ paths: 'C:\\secrets' })).toEqual({ error: 'Path "C:/secrets" must be relative to the workspace' });
    expect(validateEpicContext({ paths: 'docs/../../x' })).toEqual({ error: 'Path "docs/../../x" must stay inside the workspace' });
    expect(validateEpicContext({ urls: 'file:///etc/passwd' })).toEqual({ error: 'Link "file:///etc/passwd" must start with http:// or https://' });
    expect(validateEpicContext({ urls: 'not a url' })).toEqual({ error: 'Link "not a url" is not a URL' });
    expect(validateEpicContext({ paths: Array.from({ length: MAX_CONTEXT_PATHS + 1 }, (_, i) => `f${i}`) })).toEqual({ error: `Up to ${MAX_CONTEXT_PATHS} paths` });
  });
});

describe('readEpicContext', () => {
  it('reads the lifted or metadata form, drops bad entries, and is undefined when empty', () => {
    expect(readEpicContext({ agentContext: { paths: ['a.md', '../x'], urls: ['javascript:alert(1)'], note: '' } })).toEqual({ paths: ['a.md'], urls: [] });
    expect(readEpicContext({ metadata: { agentContext: { paths: [], urls: [], note: 'hi' } } })).toEqual({ paths: [], urls: [], note: 'hi' });
    expect(readEpicContext({ agentContext: { paths: [], urls: [] } })).toBeUndefined();
    expect(readEpicContext({})).toBeUndefined();
  });
});

describe('epicContextSection', () => {
  it('lists files and links and the note, and is empty without context', () => {
    const section = epicContextSection('E-1', { paths: ['docs/spec.md'], urls: ['https://example.com'], note: 'Use v2' });
    expect(section).toContain('### Context for this epic (E-1)');
    expect(section).toContain('- `docs/spec.md`');
    expect(section).toContain('- https://example.com');
    expect(section).toContain('Note from the user:\nUse v2');
    expect(epicContextSection('E-1', undefined)).toBe('');
  });
});
