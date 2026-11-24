// Resolve a bundled skill id sent by the webview (e.g. from the sprint health
// strip's "Next" action) to its SKILL.md. The id crosses a trust boundary, so
// only plain bundled skill names are accepted: no separators, no traversal.
import * as fs from 'fs';
import * as path from 'path';
import { BMAD_RESOURCE_DIR } from '../state/constants';

const SKILL_ID_RE = /^aac-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Absolute SKILL.md path for a bundled skill id; undefined when invalid or absent. */
export function resolveBundledSkillPath(extensionFsPath: string, skillId: unknown): string | undefined {
  if (typeof skillId !== 'string' || !SKILL_ID_RE.test(skillId)) return undefined;
  const file = path.join(extensionFsPath, 'resources', BMAD_RESOURCE_DIR, 'skills', skillId, 'SKILL.md');
  return fs.existsSync(file) ? file : undefined;
}
