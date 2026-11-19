import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  detectProjectCommands, ensureProjectContext, readProjectContext, renderProjectContext, verifyCommandFromContext,
} from './project-context';

let root: string;
const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-ctx-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('detectProjectCommands', () => {
  it('reads npm scripts, preferring the package manager in use', () => {
    write('package.json', JSON.stringify({ scripts: { test: 'vitest', compile: 'tsc', lint: 'eslint .', 'check-types': 'tsc --noEmit' } }));
    write('pnpm-lock.yaml', '');
    write('AGENTS.md', '# rules');
    const d = detectProjectCommands(root);
    expect(d.ecosystem).toEqual(['node']);
    expect(d.commands).toEqual({ install: 'pnpm install', test: 'pnpm test', build: 'pnpm compile', lint: 'pnpm lint', typecheck: 'pnpm check-types' });
    expect(d.conventionFiles).toEqual(['AGENTS.md']);
  });

  it('ignores the npm placeholder test script', () => {
    write('package.json', JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
    expect(detectProjectCommands(root).commands.test).toBeUndefined();
  });

  it.each([
    ['Cargo.toml', 'cargo test'],
    ['go.mod', 'go test ./...'],
    ['pyproject.toml', 'python -m pytest'],
  ])('%s → %s', (file, test) => {
    write(file, '');
    expect(detectProjectCommands(root).commands.test).toBe(test);
  });
});

describe('context file', () => {
  it('is created once, kept when edited, and its test command is read back', () => {
    write('package.json', JSON.stringify({ scripts: { test: 'jest' } }));
    const out = path.join(root, '.ctx');
    const file = ensureProjectContext(root, out);
    expect(readProjectContext(out)).toContain('- **test:** `npm test`');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('`npm test`', '`npm run test:unit`'));
    ensureProjectContext(root, out);
    expect(verifyCommandFromContext(out)).toBe('npm run test:unit');
    ensureProjectContext(root, out, true);
    expect(verifyCommandFromContext(out)).toBe('npm test');
  });

  it('renders a usable stub when nothing is detected', () => {
    expect(renderProjectContext({ ecosystem: [], commands: {}, conventionFiles: [] })).toMatch(/None detected/);
  });
});
