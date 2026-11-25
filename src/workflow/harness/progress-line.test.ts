import { describe, it, expect } from 'vitest';
import { latestProgressLine, ProgressThrottle } from './progress-line';

describe('latestProgressLine', () => {
  it('returns the last meaningful line with ANSI codes and extra spaces removed', () => {
    expect(latestProgressLine('Reading files\n\u001b[32m✓\u001b[0m  Editing   src/login.ts\n\n')).toBe('✓ Editing src/login.ts');
  });

  it('skips shell prompts, spinner frames, rules and the launch command', () => {
    const out = [
      'Running the test suite',
      'PS D:\\repo> ',
      '⠋',
      '────────',
      "claude -p < '.agileagentcanvas-context/_terminal-output/prompts/S-1-abc.md'",
      'user@host:~/repo$ ',
    ].join('\n');
    expect(latestProgressLine(out)).toBe('Running the test suite');
  });

  it('treats carriage-return redraws as separate lines', () => {
    expect(latestProgressLine('Installing 10%\rInstalling 55%')).toBe('Installing 55%');
  });

  it('caps long lines', () => {
    const line = latestProgressLine('x'.repeat(500))!;
    expect(line.length).toBe(140);
    expect(line.endsWith('…')).toBe(true);
  });

  it('returns undefined when nothing meaningful has been printed', () => {
    expect(latestProgressLine(undefined)).toBeUndefined();
    expect(latestProgressLine('PS C:\\> \n   \n')).toBeUndefined();
  });
});

describe('ProgressThrottle', () => {
  it('passes a new line, holds repeats, and waits out the interval per card', () => {
    const t = new ProgressThrottle(1000);
    expect(t.offer('S-1', 'a', 0)).toBe('a');
    expect(t.offer('S-1', 'a', 5000)).toBeUndefined();
    expect(t.offer('S-1', 'b', 500)).toBeUndefined();
    expect(t.offer('S-2', 'b', 500)).toBe('b');
    expect(t.offer('S-1', 'b', 1200)).toBe('b');
  });

  it('starts fresh for a card it was told to forget', () => {
    const t = new ProgressThrottle(1000);
    t.offer('S-1', 'a', 0);
    t.forget('S-1');
    expect(t.offer('S-1', 'a', 10)).toBe('a');
  });
});
