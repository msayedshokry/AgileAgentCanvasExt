// Regression guards for the bundled BMAD resources under resources/_aac.
// Each of these broke silently once: a stale path that no test noticed.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { clearPersonaCache, loadAgentPersona } from './agent-personas';

const BMAD_PATH = path.resolve(__dirname, '..', '..', 'resources', '_aac');
const SKILLS = path.join(BMAD_PATH, 'skills');
const RESOURCES = path.dirname(BMAD_PATH);

/** Minimal CSV row splitter that honours double-quoted fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { cells.push(cell); cell = ''; }
      else cell += ch;
    }
    cells.push(cell);
    rows.push(cells);
  }
  return rows;
}

describe('CIS agent personas', () => {
  it.each([
    ['aac-cis-agent-brainstorming', 'Carson'],
    ['aac-cis-agent-design-thinking', 'Maya'],
    ['aac-cis-agent-innovation', 'Victor'],
    ['aac-cis-agent-problem-solver', 'Dr. Quinn'],
    ['aac-cis-agent-presentation', 'Caravaggio'],
    ['aac-cis-agent-storyteller', 'Sophia'],
  ])('%s loads as %s', (skill, name) => {
    clearPersonaCache();
    expect(loadAgentPersona(BMAD_PATH, skill)?.name).toBe(name);
  });
});

describe('TEA knowledge index', () => {
  const index = path.join(SKILLS, 'aac-agent-tea', 'testarch', 'tea-index.csv');

  it('lists only fragments that exist, with unique ids', () => {
    const [header, ...rows] = parseCsv(fs.readFileSync(index, 'utf-8'));
    const fileCol = header.indexOf('fragment_file');
    const ids = rows.map((r) => r[0]);
    expect(new Set(ids).size).toBe(ids.length);
    const missing = rows.map((r) => r[fileCol]).filter((f) => !fs.existsSync(path.join(path.dirname(index), f)));
    expect(missing).toEqual([]);
  });

  it('is the path every TEA step points at', () => {
    expect(staleBmadPathRefs('aac-tea-')).toEqual([]);
  });
});

describe('CIS workflows', () => {
  it('reference only bundled files that exist', () => {
    expect(staleBmadPathRefs('aac-cis-')).toEqual([]);
  });
});

/** `{bmad-path}/...` references in a skill family's step files that resolve to nothing. */
function staleBmadPathRefs(prefix: string): string[] {
    const stale: string[] = [];
    for (const dir of fs.readdirSync(SKILLS).filter((d) => d.startsWith(prefix))) {
      const walk = (p: string): void => {
        for (const e of fs.readdirSync(p, { withFileTypes: true })) {
          const full = path.join(p, e.name);
          if (e.isDirectory()) walk(full);
          // legacy-agent.md files are pre-v6 references that nothing loads.
          else if (/\.(md|ya?ml)$/.test(e.name) && e.name !== 'legacy-agent.md') {
            for (const ref of fs.readFileSync(full, 'utf-8').match(/\{bmad-path\}\/[^\s`'")<]+/g) ?? []) {
              if (!fs.existsSync(path.join(BMAD_PATH, ref.slice('{bmad-path}/'.length)))) stale.push(`${full}: ${ref}`);
            }
          }
        }
      };
      walk(path.join(SKILLS, dir));
    }
    return stale;
}

describe('aac-help catalog', () => {
  it('points every row at a bundled skill that exists', () => {
    const [header, ...rows] = parseCsv(fs.readFileSync(path.join(BMAD_PATH, '_config', 'aac-help.csv'), 'utf-8'));
    const fileCol = header.indexOf('workflow-file');
    const cmdCol = header.indexOf('command');
    const broken = rows
      .filter((r) => !fs.existsSync(path.join(RESOURCES, r[fileCol])) || !fs.existsSync(path.join(SKILLS, r[cmdCol])))
      .map((r) => `${r[2]} → ${r[cmdCol]}`);
    expect(broken).toEqual([]);
  });
});
