import { describe, it, expect, vi } from 'vitest';
import type { TerminalBackend } from './terminal-backend';

class FakeBackend implements TerminalBackend {
  readonly supportsInput = false;
  private cbs = new Map<string, (c: string) => void>();
  attach(id: string, onData: (c: string) => void) { this.cbs.set(id, onData); return { dispose: () => this.cbs.delete(id) }; }
  getSnapshot() { return ''; }
  write() { /* no-op for output-only */ }
  async kill() { /* no-op */ }
  emit(id: string, c: string) { this.cbs.get(id)?.(c); }
}

describe('TerminalBackend contract', () => {
  it('streams data to attached listeners and detaches on dispose', () => {
    const b = new FakeBackend();
    const onData = vi.fn();
    const d = b.attach('s1', onData);
    b.emit('s1', 'hello');
    expect(onData).toHaveBeenCalledWith('hello');
    d.dispose();
    b.emit('s1', 'again');
    expect(onData).toHaveBeenCalledTimes(1);
  });
  it('exposes supportsInput so the UI can show/hide an input box', () => {
    expect(new FakeBackend().supportsInput).toBe(false);
  });
});
