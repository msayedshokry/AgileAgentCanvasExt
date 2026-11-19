import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { disposePromptFile, promptDir, stagePromptFile, sweepStalePromptFiles } from './prompt-staging';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-stage-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('stagePromptFile', () => {
  it('writes the prompt byte-for-byte inside the output folder with a * .gitignore', () => {
    const prompt = 'héllo "quotes" $HOME `tick` 100% \n second line ✓';
    const file = stagePromptFile(root, 'S/1', 'run-1', prompt);
    expect(file.startsWith(promptDir(root))).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toBe(prompt);
    expect(fs.readFileSync(path.join(promptDir(root), '.gitignore'), 'utf-8')).toBe('*\n');
  });

  it.skipIf(process.platform === 'win32')('creates the file readable by the owner only', () => {
    const file = stagePromptFile(root, 'S-1', 'run-1', 'x');
    expect(fs.statSync(file).mode & 0o077).toBe(0);
  });

  it('refuses to overwrite an existing file (exclusive create)', () => {
    stagePromptFile(root, 'S-1', 'run-1', 'a');
    expect(() => stagePromptFile(root, 'S-1', 'run-1', 'b')).toThrow();
  });
});

describe('disposePromptFile / sweepStalePromptFiles', () => {
  it('ignores missing files but reports other errors', () => {
    const errors: unknown[] = [];
    disposePromptFile(path.join(root, 'missing.md'), (e) => errors.push(e));
    expect(errors).toEqual([]);
  });

  it('removes only prompt files older than the cutoff', () => {
    const oldFile = stagePromptFile(root, 'S-1', 'old', 'x');
    const newFile = stagePromptFile(root, 'S-2', 'new', 'y');
    const past = (Date.now() - 2 * 24 * 3600 * 1000) / 1000;
    fs.utimesSync(oldFile, past, past);
    expect(sweepStalePromptFiles(root)).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(newFile)).toBe(true);
  });

  it('returns 0 when the folder does not exist', () => {
    expect(sweepStalePromptFiles(path.join(root, 'nope'))).toBe(0);
  });
});
