// ─── Sprint plan CLI ─────────────────────────────────────────────────────────
// Bundled to dist/sprint-plan.js so any harness can run it with plain `node`.
// Contract (same as upstream sprint_plan.py): stdout carries ONLY one JSON
// object. Exit 0 on success, 1 on a reported failure, 2 on an argument error.
//
//   node dist/sprint-plan.js generate --epic-file F [--epic-file F2] --status-file S
//        --stories-dir D --project P --date DATE [--project-key K] [--tracking-system T]
//        [--story-location L] [--dry-run] [--fresh] [--set key=status ...]
//   node dist/sprint-plan.js status --status-file S [--date DATE] [--stale-days N]
//   node dist/sprint-plan.js validate --status-file S

import { SprintPlanError, generate, status, validate } from './sprint-plan';
import { STALE_DAYS_DEFAULT } from './sprint-plan-core';

class ArgError extends Error {}

const SPEC: Record<string, { values: string[]; flags: string[]; repeat: string[]; required: string[] }> = {
  generate: {
    values: ['epic-file', 'status-file', 'stories-dir', 'project', 'date', 'project-key', 'tracking-system', 'story-location', 'set'],
    flags: ['dry-run', 'fresh'],
    repeat: ['epic-file', 'set'],
    required: ['epic-file', 'status-file', 'stories-dir', 'project', 'date'],
  },
  status: { values: ['status-file', 'date', 'stale-days'], flags: [], repeat: [], required: ['status-file'] },
  validate: { values: ['status-file'], flags: [], repeat: [], required: ['status-file'] },
};

type Parsed = Record<string, string | string[] | boolean>;

function parseArgs(argv: readonly string[]): { command: string; args: Parsed } {
  const [command, ...rest] = argv;
  const spec = command ? SPEC[command] : undefined;
  if (!spec) throw new ArgError(`expected a command: ${Object.keys(SPEC).join(', ')}`);
  const args: Parsed = {};
  for (let i = 0; i < rest.length; i++) {
    const name = rest[i].startsWith('--') ? rest[i].slice(2) : '';
    if (spec.flags.includes(name)) { args[name] = true; continue; }
    if (!spec.values.includes(name)) throw new ArgError(`unrecognized argument: ${rest[i]}`);
    const value = rest[++i];
    if (value === undefined) throw new ArgError(`argument --${name}: expected a value`);
    if (spec.repeat.includes(name)) args[name] = [...((args[name] as string[] | undefined) ?? []), value];
    else args[name] = value;
  }
  const missing = spec.required.filter((r) => args[r] === undefined);
  if (missing.length) throw new ArgError(`the following arguments are required: ${missing.map((m) => `--${m}`).join(', ')}`);
  return { command, args };
}

function dispatch(command: string, a: Parsed): Record<string, unknown> {
  const str = (k: string) => a[k] as string | undefined;
  if (command === 'generate') {
    return generate({
      epicFiles: a['epic-file'] as string[], statusFile: str('status-file')!, storiesDir: str('stories-dir')!,
      project: str('project')!, date: str('date')!, projectKey: str('project-key'),
      trackingSystem: str('tracking-system'), storyLocation: str('story-location'),
      dryRun: !!a['dry-run'], fresh: !!a.fresh, set: a.set as string[] | undefined,
    });
  }
  if (command === 'status') {
    const stale = str('stale-days');
    const staleDays = stale === undefined ? STALE_DAYS_DEFAULT : Number(stale);
    if (!Number.isInteger(staleDays)) throw new ArgError(`argument --stale-days: invalid int value: '${stale}'`);
    return status(str('status-file')!, str('date'), staleDays);
  }
  return validate(str('status-file')!);
}

/** Run the CLI; returns the exit code and writes exactly one JSON line via `write`. */
export function runCli(argv: readonly string[], write: (line: string) => void): number {
  try {
    const { command, args } = parseArgs(argv);
    write(JSON.stringify(dispatch(command, args)));
    return 0;
  } catch (err) {
    if (err instanceof ArgError) {
      write(JSON.stringify({ ok: false, error: `argument error: ${err.message}` }));
      return 2;
    }
    const extra = err instanceof SprintPlanError ? err.extra : {};
    write(JSON.stringify({ ok: false, error: (err as Error).message, ...extra }));
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runCli(process.argv.slice(2), (line) => process.stdout.write(`${line}\n`));
}
