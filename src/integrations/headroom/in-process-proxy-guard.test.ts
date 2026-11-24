import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }) }));

import { localRequestRefusal } from './in-process-proxy';

describe('headroom proxy: local clients only', () => {
  it('accepts local CLI/SDK requests', () => {
    expect(localRequestRefusal({ host: '127.0.0.1:8787' })).toBeUndefined();
    expect(localRequestRefusal({ host: 'localhost:8787' })).toBeUndefined();
    expect(localRequestRefusal({})).toBeUndefined();
  });

  it('refuses browser requests and DNS-rebinding hosts', () => {
    expect(localRequestRefusal({ host: '127.0.0.1:8787', origin: 'https://evil.example' })).toMatch(/Browser/);
    expect(localRequestRefusal({ host: 'rebind.evil.example:8787' })).toMatch(/Unexpected Host/);
  });
});
