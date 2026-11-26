// ─── Skills an agent can be given ───────────────────────────────────────────
// (docs/plans/2026-11-26-agent-board-live.md, L4.) A skill is a folder with a
// SKILL.md whose front matter names and describes it. Skills come from the
// extension's bundled `resources/_aac/skills` and from the workspace's own
// `.claude/skills` and `.agents/skills`; a workspace skill with the same id
// wins. Before a run, the agent's skills are copied into the run's output
// folder, inside the workspace, so even a sandboxed agent can read them; the
// brief lists their names, descriptions and those paths.

import * as fs from 'fs';
import * as path from 'path';

export interface SkillEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Folder holding SKILL.md. */
  readonly dir: string;
  readonly source: 'bundled' | 'workspace';
}

export const SKILL_ID = /^[A-Za-z0-9][\w.-]{0,79}$/;
export const MAX_SKILLS_PER_AGENT = 20;
const MAX_SKILL_BYTES = 512 * 1024;
const MAX_DESCRIPTION = 300;

let bundledRoot: string | undefined;

/** Called once on activation with `<extension>/resources/_aac/skills`. */
export function setBundledSkillsRoot(root: string): void {
  bundledRoot = root;
}

export function workspaceSkillRoots(workspaceDir: string | undefined): string[] {
  return workspaceDir ? [path.join(workspaceDir, '.claude', 'skills'), path.join(workspaceDir, '.agents', 'skills')] : [];
}

/** `name:` and `description:` from YAML front matter; tolerant of quotes. Pure. */
export function parseSkillFrontMatter(text: string): { name?: string; description?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const field = (key: string) => {
    const line = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(match[1]);
    return line ? line[1].trim().replace(/^(['"])(.*)\1$/, '$2') : undefined;
  };
  return { name: field('name'), description: field('description') };
}

function readRoot(root: string, source: SkillEntry['source']): SkillEntry[] {
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return []; // no such folder
  }
  return names.flatMap((id) => {
    if (!SKILL_ID.test(id)) return [];
    const dir = path.join(root, id);
    try {
      const meta = parseSkillFrontMatter(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf-8'));
      const description = (meta.description ?? '').slice(0, MAX_DESCRIPTION);
      return [{ id, name: meta.name ?? id, description, dir, source }];
    } catch {
      return []; // not a skill folder
    }
  });
}

/** Every skill available to agents in this workspace, workspace skills overriding bundled ones. */
export function listSkills(workspaceDir: string | undefined, bundled = bundledRoot): SkillEntry[] {
  const byId = new Map<string, SkillEntry>();
  if (bundled) for (const s of readRoot(bundled, 'bundled')) byId.set(s.id, s);
  for (const root of workspaceSkillRoots(workspaceDir)) for (const s of readRoot(root, 'workspace')) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function copyFolder(from: string, to: string, budget: { bytes: number }): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyFolder(src, dest, budget);
    else if (entry.isFile()) {
      const size = fs.statSync(src).size;
      if (size > budget.bytes) continue; // keep each copied skill under MAX_SKILL_BYTES
      budget.bytes -= size;
      fs.copyFileSync(src, dest);
    }
  }
}

/**
 * Copy the chosen skills under `destRoot` and return them with the path of
 * their SKILL.md relative to `relativeTo` (the workspace). Unknown ids are
 * returned in `missing`.
 */
export function materializeSkills(
  ids: readonly string[],
  catalog: readonly SkillEntry[],
  destRoot: string,
  relativeTo: string,
): { skills: Array<SkillEntry & { path: string }>; missing: string[] } {
  const skills: Array<SkillEntry & { path: string }> = [];
  const missing: string[] = [];
  for (const id of ids.slice(0, MAX_SKILLS_PER_AGENT)) {
    const entry = catalog.find((s) => s.id === id);
    if (!entry) { missing.push(id); continue; }
    const dest = path.join(destRoot, id);
    try {
      fs.rmSync(dest, { recursive: true, force: true });
      // SKILL.md first, so the budget can never squeeze it out.
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(path.join(entry.dir, 'SKILL.md'), path.join(dest, 'SKILL.md'));
      copyFolder(entry.dir, dest, { bytes: MAX_SKILL_BYTES });
      skills.push({ ...entry, path: path.relative(relativeTo, path.join(dest, 'SKILL.md')).replace(/\\/g, '/') });
    } catch {
      missing.push(id);
    }
  }
  return { skills, missing };
}
