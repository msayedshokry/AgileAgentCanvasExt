import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listSkills, materializeSkills, parseSkillFrontMatter } from './skill-catalog';

let tmp: string;
const skill = (root: string, id: string, name: string, description: string, extra?: Record<string, string>) => {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: "${description}"\n---\n\n# ${name}\n`);
  for (const [file, body] of Object.entries(extra ?? {})) fs.writeFileSync(path.join(dir, file), body);
};

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('parseSkillFrontMatter', () => {
  it('reads name and description, quoted or not', () => {
    expect(parseSkillFrontMatter('---\nname: aac-dev\ndescription: \'Implements stories\'\n---\nbody')).toEqual({ name: 'aac-dev', description: 'Implements stories' });
    expect(parseSkillFrontMatter('no front matter')).toEqual({});
  });
});

describe('listSkills', () => {
  it('lists bundled and workspace skills, the workspace winning on the same id', () => {
    const bundled = path.join(tmp, 'bundled');
    const ws = path.join(tmp, 'ws');
    skill(bundled, 'aac-dev', 'Dev', 'Bundled dev');
    skill(bundled, 'aac-qa', 'QA', 'Bundled QA');
    skill(path.join(ws, '.claude', 'skills'), 'aac-dev', 'Dev', 'Our dev rules');
    fs.mkdirSync(path.join(bundled, 'not-a-skill'));
    expect(listSkills(ws, bundled).map((s) => [s.id, s.description, s.source])).toEqual([
      ['aac-dev', 'Our dev rules', 'workspace'],
      ['aac-qa', 'Bundled QA', 'bundled'],
    ]);
  });

  it('is empty when nothing is there', () => {
    expect(listSkills(undefined, path.join(tmp, 'missing'))).toEqual([]);
  });
});

describe('materializeSkills', () => {
  it('copies the chosen skills into the workspace and returns workspace-relative paths', () => {
    const bundled = path.join(tmp, 'bundled');
    skill(bundled, 'aac-dev', 'Dev', 'Dev rules', { 'checklist.md': '- [ ] tests' });
    const catalog = listSkills(undefined, bundled);
    const ws = path.join(tmp, 'ws');
    const { skills, missing } = materializeSkills(['aac-dev', 'gone'], catalog, path.join(ws, 'out', 'skills'), ws);
    expect(missing).toEqual(['gone']);
    expect(skills.map((s) => s.path)).toEqual(['out/skills/aac-dev/SKILL.md']);
    expect(fs.readFileSync(path.join(ws, 'out', 'skills', 'aac-dev', 'checklist.md'), 'utf-8')).toBe('- [ ] tests');
  });
});
