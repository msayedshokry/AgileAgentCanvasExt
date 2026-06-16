// ─── Unit tests: wrapStreamForProgress Proxy (reviewer nit #2 for #32) ──────
// Focused lock-in for the chat-stream Proxy. Locks in:
//   1. Whitelisted streaming methods tick the tracker (markdown,
//      markdownWithVulnerabilities, anchor, filetree, progress).
//   2. Non-streaming methods (push, reference, button) pass through
//      WITHOUT ticking the tracker.
//   3. Return values flow through unchanged so async semantics
//      (e.g. progress() resolves to a stream) survive the wrap.
//   4. Tracker count grows monotonically with streaming calls only.
//
// The Proxy works on any object shape — we use a plain object here
// instead of vscode.ChatResponseStream because markdownWithVulnerabilities
// / filetree are NOT in the public VS Code typings. The Proxy logic
// inspects property names at runtime, so the surface is type-agnostic.

import { describe, it, expect, vi } from 'vitest';
import { ChatProgressTracker } from './terminal-health-checks';
import { wrapStreamForProgress } from './kanban-orchestrator';

/** Build a plain-object spy stream that the Proxy can wrap. */
function makeSpyStream(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    markdown: vi.fn((s: string) => `md:${s}`),
    markdownWithVulnerabilities: vi.fn((s: string) => `vuln:${s}`),
    anchor: vi.fn((uri: unknown, title?: string) =>
      `anchor:${String(uri)}:${title ?? ''}`,
    ),
    filetree: vi.fn((value: unknown) => `tree:${String(value)}`),
    progress: vi.fn((_label: string) =>
      Promise.resolve('progress-ready'),
    ),
    push: vi.fn((part: unknown) => `pushed:${String(part)}`),
    reference: vi.fn(() => 'ref-added'),
    button: vi.fn(() => 'btn-added'),
  };
}

describe('wrapStreamForProgress Proxy', () => {
  it('ticks tracker on markdown call', () => {
    const tracker = new ChatProgressTracker();
    const stream = makeSpyStream();
    // cast to any: the Proxy target shape is runtime-decided; only
    // property names matter to the whitelist.
    const proxied = wrapStreamForProgress(stream as any, tracker);
    (proxied as any).markdown('hello');
    expect(tracker.getActivityCount()).toBe(1);
    expect(stream.markdown).toHaveBeenCalledWith('hello');
  });

  it('ticks tracker on markdownWithVulnerabilities call (#32 nit)', () => {
    const tracker = new ChatProgressTracker();
    const stream = makeSpyStream();
    const proxied = wrapStreamForProgress(stream as any, tracker);
    (proxied as any).markdownWithVulnerabilities('security warning');
    expect(tracker.getActivityCount()).toBe(1);
    expect(stream.markdownWithVulnerabilities).toHaveBeenCalledWith(
      'security warning',
    );
  });

  it('ticks tracker on anchor / filetree / progress calls', () => {
    const tracker = new ChatProgressTracker();
    const stream = makeSpyStream();
    const proxied = wrapStreamForProgress(stream as any, tracker);
    (proxied as any).anchor('vscode://file/x.ts', 'x.ts');
    (proxied as any).filetree('node_modules/');
    (proxied as any).progress('running');
    expect(tracker.getActivityCount()).toBe(3);
  });

  it('does NOT tick tracker on push / reference / button (non-streaming)', () => {
    const tracker = new ChatProgressTracker();
    const stream = makeSpyStream();
    const proxied = wrapStreamForProgress(stream as any, tracker);
    (proxied as any).push({ kind: 'meta', value: 42 });
    (proxied as any).reference();
    (proxied as any).button();
    expect(tracker.getActivityCount()).toBe(0);
  });

  it('forwards return value from non-streaming method unchanged', () => {
    const tracker = new ChatProgressTracker();
    const stream = makeSpyStream();
    const proxied = wrapStreamForProgress(stream as any, tracker);
    expect((proxied as any).push({ kind: 'meta' })).toBe(
      'pushed:[object Object]',
    );
    expect((proxied as any).reference()).toBe('ref-added');
    expect((proxied as any).button()).toBe('btn-added');
    expect(tracker.getActivityCount()).toBe(0);
  });

  it('forwards return value from streaming method unchanged', () => {
    const tracker = new ChatProgressTracker();
    const stream = makeSpyStream();
    const proxied = wrapStreamForProgress(stream as any, tracker);
    expect((proxied as any).markdown('chunk')).toBe('md:chunk');
    expect(tracker.getActivityCount()).toBe(1);
  });

  it('forwards progress() Promise so awaited semantics survive the wrap', async () => {
    const tracker = new ChatProgressTracker();
    const stream = makeSpyStream();
    const proxied = wrapStreamForProgress(stream as any, tracker);
    const result = (proxied as any).progress('loading');
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe('progress-ready');
    expect(tracker.getActivityCount()).toBe(1);
  });

  it('mixed workload: 5 streaming + 4 non-streaming → 5 ticks', () => {
    const tracker = new ChatProgressTracker();
    const stream = makeSpyStream();
    const proxied = wrapStreamForProgress(stream as any, tracker);
    (proxied as any).markdown('a');
    (proxied as any).push('meta-1');
    (proxied as any).markdownWithVulnerabilities('b');
    (proxied as any).reference();
    (proxied as any).filetree('tree');
    (proxied as any).button();
    (proxied as any).anchor('uri', 't');
    (proxied as any).push('meta-2');
    (proxied as any).progress('p');
    expect(tracker.getActivityCount()).toBe(5);
  });
});
