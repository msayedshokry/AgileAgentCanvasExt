import { describe, it, expect } from 'vitest';
import { buildCommandLine, detectShellKind, quoteArg } from './shell-command';

describe('detectShellKind', () => {
  it.each([
    ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'powershell'],
    ['C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'powershell'],
    ['/usr/local/bin/pwsh', 'powershell'],
    ['C:\\Windows\\System32\\cmd.exe', 'cmd'],
    ['C:\\Program Files\\Git\\bin\\bash.exe', 'posix'],
    ['/bin/zsh', 'posix'],
  ] as const)('classifies %s as %s', (shell, kind) => {
    expect(detectShellKind(shell, 'win32')).toBe(kind);
  });

  it('falls back to PowerShell on Windows and POSIX elsewhere when the shell is unknown', () => {
    expect(detectShellKind('', 'win32')).toBe('powershell');
    expect(detectShellKind(undefined, 'linux')).toBe('posix');
  });
});

describe('quoteArg', () => {
  it('passes safe flags through untouched in every shell', () => {
    for (const kind of ['posix', 'powershell', 'cmd'] as const) {
      expect(quoteArg('--approval-mode', kind)).toBe('--approval-mode');
      expect(quoteArg('--allow-tool=write', kind)).toBe('--allow-tool=write');
    }
  });

  it('quotes comma lists so PowerShell does not split them into an array', () => {
    expect(quoteArg('read,write,edit', 'powershell')).toBe("'read,write,edit'");
  });

  it('uses fully-literal single quotes for PowerShell, doubling embedded quotes', () => {
    expect(quoteArg("it's $HOME `x`", 'powershell')).toBe("'it''s $HOME `x`'");
  });

  it('uses POSIX single-quote escaping', () => {
    expect(quoteArg("it's", 'posix')).toBe("'it'\\''s'");
  });

  it('refuses values cmd.exe cannot quote safely', () => {
    expect(() => quoteArg('100%', 'cmd')).toThrow(/cmd\.exe/);
    expect(() => quoteArg('a"b', 'cmd')).toThrow(/cmd\.exe/);
    expect(quoteArg('a b', 'cmd')).toBe('"a b"');
  });
});

describe('buildCommandLine', () => {
  const spec = { args: ['claude', '-p'], stdinFile: 'C:\\ws\\.ctx\\_terminal-output\\prompts\\S-1.md' };

  it('POSIX: redirects stdin from the quoted file with forward slashes', () => {
    expect(buildCommandLine(spec, 'posix')).toBe('claude -p < C:/ws/.ctx/_terminal-output/prompts/S-1.md');
  });

  it('cmd: redirects stdin from a double-quoted file', () => {
    expect(buildCommandLine({ ...spec, stdinFile: 'C:\\my ws\\p.md' }, 'cmd')).toBe('claude -p < "C:/my ws/p.md"');
  });

  it('PowerShell: pipes Get-Content with UTF-8 pinned inside a script block', () => {
    const line = buildCommandLine(spec, 'powershell');
    expect(line.startsWith('& { $OutputEncoding=[System.Text.UTF8Encoding]::new(); Get-Content -Raw -Encoding UTF8 ')).toBe(true);
    expect(line.endsWith('| claude -p }')).toBe(true);
  });

  it('never puts prompt text on the line for pointer delivery beyond the quoted pointer', () => {
    const line = buildCommandLine({ args: ['gemini', '-p', 'Read the file C:/x y/p.md now.'] }, 'powershell');
    expect(line).toBe("gemini -p 'Read the file C:/x y/p.md now.'");
  });

  it('rejects an empty argv', () => {
    expect(() => buildCommandLine({ args: [] }, 'posix')).toThrow();
  });
});
