// Port of upstream BMAD v6.12 scripts/tests/test_sprint_plan.py, run through
// the CLI entry so the JSON-only stdout contract is covered too.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse } from 'yaml';
import { runCli } from './sprint-plan-cli';
import { HEADER_COMMENT } from './sprint-plan-core';

const TEMPLATE = path.resolve(__dirname, '..', '..', 'resources', '_aac', 'skills', 'aac-sprint-planning', 'sprint-status-template.yaml');
const DATE = '08-01-2026 14:30';
const EPICS = `# Project Epics

## Epic 1: Foundation
Some prose.

### Story 1.1: User Authentication
Acceptance criteria...

### Story 1.2: Account Management

## Epic 2: Chat
### Story 2.1: Personality System
### Story 2.6a: Split Story, With Punctuation!
`;
const EXISTING = `generated: 01-01-2026 09:00
last_updated: 01-01-2026 09:00
project: My Project
project_key: NOKEY
tracking_system: file-system
story_location: impl

development_status:
  epic-1: in-progress
  1-1-user-authentication: done
  1-2-account-management: backlog
  epic-1-retrospective: optional
  9-9-ghost-story: done

action_items:
  - epic: 1
    action: "Add error-handling review; watch: quotes, commas"
    owner: "Charlie"
    status: open
`;

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-sprint-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function cli(argv: string[]): { code: number; out: Record<string, any> } {
  const lines: string[] = [];
  const code = runCli(argv, (l) => lines.push(l));
  expect(lines).toHaveLength(1);
  return { code, out: JSON.parse(lines[0]) };
}

function runGenerate(opts: { epics?: string; existing?: string; stories?: string[]; extra?: string[] } = {}) {
  const epicFile = path.join(tmp, 'epics.md');
  fs.writeFileSync(epicFile, opts.epics ?? EPICS);
  const storiesDir = path.join(tmp, 'impl');
  fs.mkdirSync(storiesDir, { recursive: true });
  const statusFile = path.join(storiesDir, 'sprint-status.yaml');
  if (opts.existing !== undefined) fs.writeFileSync(statusFile, opts.existing);
  for (const s of opts.stories ?? []) fs.writeFileSync(path.join(storiesDir, `${s}.md`), 'story');
  const res = cli(['generate', '--epic-file', epicFile, '--status-file', statusFile, '--stories-dir', storiesDir,
    '--project', 'My Project', '--date', DATE, ...(opts.extra ?? [])]);
  return { ...res, statusFile, epicFile, storiesDir };
}
const load = (f: string) => parse(fs.readFileSync(f, 'utf-8'));

describe('generate', () => {
  it('orders entries and applies defaults on a fresh file', () => {
    const { out, statusFile } = runGenerate();
    const data = load(statusFile);
    expect(Object.keys(data.development_status)).toEqual([
      'epic-1', '1-1-user-authentication', '1-2-account-management', 'epic-1-retrospective',
      'epic-2', '2-1-personality-system', '2-6a-split-story-with-punctuation', 'epic-2-retrospective',
    ]);
    expect(data.development_status['epic-1']).toBe('backlog');
    expect(data.development_status['epic-1-retrospective']).toBe('optional');
    expect(data.project).toBe('My Project');
    expect([data.generated, data.last_updated]).toEqual([DATE, DATE]);
    expect(out).toMatchObject({ ok: true, epics: 2, stories: 4 });
    const text = fs.readFileSync(statusFile, 'utf-8');
    expect(text).toContain('STATUS DEFINITIONS');
    expect(text).toContain('\n\n  epic-2:');
  });

  it('keeps the header comment identical to the template', () => {
    const lines = fs.readFileSync(TEMPLATE, 'utf-8').split(/\r?\n/);
    const block: string[] = [];
    for (const line of lines.slice(lines.indexOf('# STATUS DEFINITIONS:'))) {
      if (!line.startsWith('#')) break;
      block.push(line.startsWith('# ') ? line.slice(2) : line.slice(1));
    }
    expect(block.join('\n') + '\n').toBe(HEADER_COMMENT);
  });

  it('preserves statuses, never downgrades, and reports orphans', () => {
    const { out, statusFile } = runGenerate({ existing: EXISTING });
    const data = load(statusFile);
    expect(data.development_status['epic-1']).toBe('in-progress');
    expect(data.development_status['1-1-user-authentication']).toBe('done');
    expect(data.generated).toBe('01-01-2026 09:00');
    expect(data.last_updated).toBe(DATE);
    expect(out.dropped_orphans).toEqual([{ key: '9-9-ghost-story', status: 'done' }]);
    expect(data.development_status['9-9-ghost-story']).toBeUndefined();
  });

  it('merges legacy statuses by meaning instead of resetting them', () => {
    const existing = EXISTING.replace('1-2-account-management: backlog', '1-2-account-management: drafted')
      .replace('epic-1: in-progress', 'epic-1: contexted');
    const { out, statusFile } = runGenerate({ existing });
    const data = load(statusFile);
    expect(data.development_status['1-2-account-management']).toBe('ready-for-dev');
    expect(data.development_status['epic-1']).toBe('in-progress');
    expect(out.legacy_mapped).toContainEqual({ key: '1-2-account-management', from: 'drafted', to: 'ready-for-dev' });
    expect(out.illegal).toEqual([]);
  });

  it('preserves metadata when flags are omitted', () => {
    const existing = EXISTING.replace('project_key: NOKEY', 'project_key: JIRA-PROJ')
      .replace('tracking_system: file-system', 'tracking_system: jira').replace('story_location: impl', 'story_location: /custom/stories');
    const data = load(runGenerate({ existing }).statusFile);
    expect([data.project_key, data.tracking_system, data.story_location]).toEqual(['JIRA-PROJ', 'jira', '/custom/stories']);
  });

  it('keeps unknown keys and comments', () => {
    const { statusFile } = runGenerate({ existing: `${EXISTING}\n# my own note\nsprint_goal: Ship the beta\n` });
    expect(load(statusFile).sprint_goal).toBe('Ship the beta');
    expect(fs.readFileSync(statusFile, 'utf-8')).toContain('# my own note');
  });

  it('--fresh ignores existing statuses but carries action items', () => {
    const { out, statusFile } = runGenerate({ existing: EXISTING, extra: ['--fresh'] });
    const data = load(statusFile);
    expect(data.development_status['1-1-user-authentication']).toBe('backlog');
    expect(data.development_status['epic-1']).toBe('backlog');
    expect(out.fresh).toBe(true);
    expect(data.action_items[0].status).toBe('open');
  });

  it('--set applies explicit statuses, even downgrades', () => {
    const { out, statusFile } = runGenerate({
      existing: EXISTING, extra: ['--fresh', '--set', '1-1-user-authentication=in-progress', '--set', 'epic-1=in-progress'],
    });
    const data = load(statusFile);
    expect(data.development_status['1-1-user-authentication']).toBe('in-progress');
    expect(data.development_status['epic-1']).toBe('in-progress');
    expect(out.explicit_set).toContain('1-1-user-authentication=in-progress');
  });

  it('--set rejects unknown keys and illegal statuses', () => {
    expect(runGenerate({ extra: ['--set', '9-9-nope=done'] })).toMatchObject({ code: 1, out: { ok: false } });
    expect(runGenerate({ extra: ['--set', 'epic-1=review'] })).toMatchObject({ code: 1, out: { ok: false } });
  });

  it('carries action items verbatim', () => {
    const data = load(runGenerate({ existing: EXISTING }).statusFile);
    expect(data.action_items[0]).toMatchObject({ action: 'Add error-handling review; watch: quotes, commas', status: 'open' });
  });

  it('floors stories with a file on disk at ready-for-dev, never downgrading done', () => {
    const { out, statusFile } = runGenerate({ stories: ['1-2-account-management'] });
    expect(load(statusFile).development_status['1-2-account-management']).toBe('ready-for-dev');
    expect(load(statusFile).development_status['1-1-user-authentication']).toBe('backlog');
    expect(out.upgraded_from_disk).toEqual(['1-2-account-management']);
    const again = runGenerate({ existing: EXISTING, stories: ['1-1-user-authentication'] });
    expect(load(again.statusFile).development_status['1-1-user-authentication']).toBe('done');
  });

  it('warns on and resets an illegal existing status', () => {
    const { out, statusFile } = runGenerate({ existing: EXISTING.replace('1-2-account-management: backlog', '1-2-account-management: shipped') });
    expect(load(statusFile).development_status['1-2-account-management']).toBe('backlog');
    expect(out.warnings.some((w: string) => w.includes("illegal status 'shipped'"))).toBe(true);
    expect(out.illegal).toContainEqual({ key: '1-2-account-management', status: 'shipped' });
  });

  it('ignores headings inside fenced code blocks', () => {
    const { out, statusFile } = runGenerate({ epics: `${EPICS}\n\`\`\`\n## Epic 9: Example Format\n### Story 9.1: Sample\n\`\`\`\n` });
    expect(load(statusFile).development_status['epic-9']).toBeUndefined();
    expect(out.epics).toBe(2);
  });

  it('keeps distinct keys for non-ASCII titles', () => {
    const keys = Object.keys(load(runGenerate({ epics: '## Epic 1: 基础\n### Story 1.1: 用户认证\n### Story 1.2: 账户管理\n' }).statusFile).development_status);
    expect(keys).toEqual(expect.arrayContaining(['1-1-用户认证', '1-2-账户管理']));
  });

  it('reports suspect headings', () => {
    const { out } = runGenerate({ epics: `${EPICS}\n### Story Two point one: Bad Format\n` });
    expect(out.warnings.some((w: string) => w.includes('unparsed Epic/Story-like heading'))).toBe(true);
  });

  it('--dry-run writes nothing and reports drift', () => {
    const epicFile = path.join(tmp, 'epics.md');
    fs.writeFileSync(epicFile, EPICS);
    const statusFile = path.join(tmp, 'sprint-status.yaml');
    fs.writeFileSync(statusFile, EXISTING);
    const { out } = cli(['generate', '--epic-file', epicFile, '--status-file', statusFile, '--stories-dir', tmp, '--project', 'P', '--date', DATE, '--dry-run']);
    expect(out).toMatchObject({ ok: true, dry_run: true, in_sync: false, dropped_orphans: [{ key: '9-9-ghost-story', status: 'done' }] });
    expect(out.new_entries).toContain('epic-2');
    expect(fs.readFileSync(statusFile, 'utf-8')).toBe(EXISTING);
  });

  it('--dry-run reports in sync right after a generate', () => {
    const first = runGenerate();
    const { out } = cli(['generate', '--epic-file', first.epicFile, '--status-file', first.statusFile, '--stories-dir', first.storiesDir,
      '--project', 'My Project', '--date', DATE, '--dry-run']);
    expect(out).toMatchObject({ in_sync: true, new_entries: [], dropped_orphans: [], illegal: [] });
  });

  it('fails with JSON when no epics parse or the file is not a mapping', () => {
    expect(runGenerate({ epics: 'just prose, no epics' })).toMatchObject({ code: 1, out: { ok: false } });
    const res = runGenerate({ existing: '- just\n- a\n- list\n' });
    expect(res.code).toBe(1);
    expect(res.out.error).toContain('not a mapping');
    expect(cli(['status', '--status-file', res.statusFile]).out.error).toContain('not a mapping');
  });

  it('emits JSON for argument errors', () => {
    expect(cli(['generate'])).toMatchObject({ code: 2, out: { ok: false } });
    expect(cli(['-h'])).toMatchObject({ code: 2, out: { ok: false } });
  });
});

const STATUS_FIXTURE = `generated: 01-01-2026 09:00
last_updated: 07-30-2026 09:00
project: My Project
project_key: NOKEY
tracking_system: file-system
story_location: impl

development_status:
  epic-1: in-progress
  1-1-user-authentication: done
  1-2-account-management: drafted
  epic-1-retrospective: optional
  epic-2: backlog
  2-1-personality-system: backlog
  epic-2-retrospective: optional

action_items:
  - epic: 1
    action: "Tighten error handling"
    owner: "Charlie"
    status: open
  - epic: 1
    action: "Old item"
    owner: "Charlie"
    status: done
`;

function runStatus(fixture = STATUS_FIXTURE) {
  const statusFile = path.join(tmp, 'sprint-status.yaml');
  fs.writeFileSync(statusFile, fixture);
  return cli(['status', '--status-file', statusFile, '--date', DATE]).out;
}

describe('status', () => {
  it('counts by kind and recommends the next ready story', () => {
    const out = runStatus();
    expect(out.stories).toEqual({ done: 1, 'ready-for-dev': 1, backlog: 1 });
    expect(out.epics).toEqual({ 'in-progress': 1, backlog: 1 });
    expect(out.retrospectives).toEqual({ optional: 2 });
    expect(out.recommendation).toMatchObject({ skill: 'aac-dev-story', story_key: '1-2-account-management' });
    expect(out.all_done).toBe(false);
    expect(out.legacy_mapped).toContainEqual({ key: '1-2-account-management', from: 'drafted', to: 'ready-for-dev' });
  });

  it('lists open action items and flags malformed ones without dropping them', () => {
    expect(runStatus().open_action_items.map((i: any) => i.action)).toEqual(['Tighten error handling']);
    const out = runStatus(`${STATUS_FIXTURE}  - "just a string"\n  - epic: 2\n    action: "No status"\n`);
    expect(out.warnings.some((w: string) => w.includes('not a mapping'))).toBe(true);
    expect(out.warnings.some((w: string) => w.includes('missing or unknown status'))).toBe(true);
    expect(out.open_action_items).toHaveLength(1);
  });

  it('prefers review over ready, and in-progress over everything', () => {
    const review = runStatus(STATUS_FIXTURE.replace('2-1-personality-system: backlog', '2-1-personality-system: review'));
    expect(review.recommendation).toMatchObject({ skill: 'aac-code-review', story_key: '2-1-personality-system' });
    expect(review.risks.some((r: string) => r.includes('review'))).toBe(true);
    const wip = runStatus(STATUS_FIXTURE.replace('2-1-personality-system: backlog', '2-1-personality-system: in-progress'));
    expect(wip.recommendation).toEqual({ skill: 'aac-dev-story', story_key: '2-1-personality-system', reason: 'resume the in-progress story' });
  });

  it('reports staleness and orphaned stories', () => {
    const out = runStatus(STATUS_FIXTURE.replace('last_updated: 07-30-2026 09:00', 'last_updated: 01-02-2026 09:00')
      .replace('  epic-2-retrospective: optional', '  epic-2-retrospective: optional\n  5-1-ghost: backlog'));
    expect(out.risks.some((r: string) => r.includes('stale'))).toBe(true);
    expect(out.risks.some((r: string) => r.includes("orphaned story '5-1-ghost'"))).toBe(true);
  });

  it('warns instead of staying silent on an unparseable timestamp, and accepts ISO stamps', () => {
    const bad = runStatus(STATUS_FIXTURE.replace('last_updated: 07-30-2026 09:00', 'last_updated: whenever'));
    expect(bad.warnings.some((w: string) => w.includes('staleness check skipped'))).toBe(true);
    const iso = runStatus(STATUS_FIXTURE.replace('generated: 01-01-2026 09:00', 'generated: 2026-01-01').replace('last_updated: 07-30-2026 09:00', 'last_updated: 2026-01-02'));
    expect(iso).toMatchObject({ ok: true, generated: '2026-01-01' });
    expect(iso.risks.some((r: string) => r.includes('stale'))).toBe(true);
  });

  it('recommends the open retrospective once all stories are done, then nothing', () => {
    const done = STATUS_FIXTURE.replace('1-2-account-management: drafted', '1-2-account-management: done')
      .replace('2-1-personality-system: backlog', '2-1-personality-system: done');
    const out = runStatus(done);
    expect(out.recommendation.skill).toBe('aac-retrospective');
    expect(out.recommendation.reason).toContain('epic-1-retrospective');
    const allDone = runStatus(done.replace('epic-1-retrospective: optional', 'epic-1-retrospective: done').replace('epic-2-retrospective: optional', 'epic-2-retrospective: done'));
    expect(allDone).toMatchObject({ all_done: true, recommendation: null });
  });

  it('reports odd keys and illegal statuses instead of crashing', () => {
    const odd = runStatus(STATUS_FIXTURE.replace('epic-2-retrospective: optional', 'epic-2-retrospective: optional\n  epic-abc-retrospective: optional'));
    expect(odd.unrecognized).toContainEqual({ key: 'epic-abc-retrospective', status: 'optional' });
    expect(odd.risks.some((r: string) => r.includes('unrecognized key'))).toBe(true);
    const illegal = runStatus(STATUS_FIXTURE.replace('2-1-personality-system: backlog', '2-1-personality-system: shipped'));
    expect(illegal.illegal).toContainEqual({ key: '2-1-personality-system', status: 'shipped' });
  });

  it('fails with JSON when the file is missing', () => {
    expect(cli(['status', '--status-file', path.join(tmp, 'nope.yaml')])).toMatchObject({ code: 1, out: { ok: false } });
  });
});

describe('validate', () => {
  const run = (content: string | null) => {
    const statusFile = path.join(tmp, 'sprint-status.yaml');
    if (content !== null) fs.writeFileSync(statusFile, content);
    return cli(['validate', '--status-file', statusFile]).out;
  };

  it('accepts a clean file', () => {
    expect(run(STATUS_FIXTURE.replace('1-2-account-management: drafted', '1-2-account-management: backlog'))).toMatchObject({ valid: true, problems: [] });
  });

  it('reports problems without crashing', () => {
    const out = run(STATUS_FIXTURE.replace('2-1-personality-system: backlog', '2-1-personality-system: shipped')
      .replace('epic-2-retrospective: optional', 'epic-2-retrospective: optional\n  weird-key: done')
      .replace('last_updated: 07-30-2026 09:00', 'last_updated: whenever'));
    expect(out.valid).toBe(false);
    expect(out.problems.some((p: string) => p.includes("illegal story status \"shipped\""))).toBe(true);
    expect(out.problems.some((p: string) => p.includes("unrecognized key 'weird-key'"))).toBe(true);
    expect(out.problems.some((p: string) => p.includes("'last_updated' timestamp"))).toBe(true);
    expect(out.legacy_mapped).toContainEqual({ key: '1-2-account-management', from: 'drafted', to: 'ready-for-dev' });
  });

  it('reports a missing file, bad YAML and a non-mapping', () => {
    expect(run(null).problems[0]).toContain('does not exist');
    expect(run('development_status: [unclosed\n').problems[0]).toContain('not valid YAML');
    expect(run('- a\n- b\n').problems.some((p: string) => p.includes('not a mapping'))).toBe(true);
  });
});

describe('canvas JSON epics', () => {
  const EPICS_JSON = JSON.stringify({
    metadata: { artifactType: 'epics' },
    content: {
      epics: [
        { id: 'EPIC-1', title: 'Core', status: 'in-progress', stories: [
          { id: 'S-1.1', title: 'Task CRUD API & Data Model', status: 'done' },
          { id: 'S-1.2', title: 'Board UI', status: 'draft' },
        ] },
        { id: 'EPIC-2', title: 'AI', status: 'draft', stories: [{ id: 'S-2.1', title: 'Scoring', status: 'in-progress' }] },
      ],
    },
  });

  const runJson = (existing?: string) => {
    const epicFile = path.join(tmp, 'epics.json');
    fs.writeFileSync(epicFile, EPICS_JSON);
    const statusFile = path.join(tmp, 'sprint-status.yaml');
    if (existing !== undefined) fs.writeFileSync(statusFile, existing);
    const res = cli(['generate', '--epic-file', epicFile, '--status-file', statusFile, '--stories-dir', tmp, '--project', 'P', '--date', DATE]);
    return { ...res, data: res.code === 0 ? load(statusFile) : undefined };
  };

  it('parses epics and stories from the canvas epics.json', () => {
    const { out, data } = runJson();
    expect(out).toMatchObject({ ok: true, epics: 2, stories: 3 });
    expect(Object.keys(data.development_status)).toEqual([
      'epic-1', '1-1-task-crud-api-data-model', '1-2-board-ui', 'epic-1-retrospective',
      'epic-2', '2-1-scoring', 'epic-2-retrospective',
    ]);
  });

  it('uses legal JSON statuses as a floor and ignores the rest', () => {
    const { data } = runJson();
    expect(data.development_status['epic-1']).toBe('in-progress');
    expect(data.development_status['1-1-task-crud-api-data-model']).toBe('done');
    expect(data.development_status['1-2-board-ui']).toBe('backlog');
    expect(data.development_status['epic-2']).toBe('backlog');
    expect(data.development_status['2-1-scoring']).toBe('in-progress');
  });

  it('never lets a JSON status downgrade the file', () => {
    const { data } = runJson('generated: 01-01-2026 09:00\nlast_updated: 01-01-2026 09:00\nproject: P\ndevelopment_status:\n  2-1-scoring: done\n');
    expect(data.development_status['2-1-scoring']).toBe('done');
  });

  it('reports invalid JSON as an error instead of parsing it as markdown', () => {
    const epicFile = path.join(tmp, 'epics.json');
    fs.writeFileSync(epicFile, '{ not json');
    const { code, out } = cli(['generate', '--epic-file', epicFile, '--status-file', path.join(tmp, 's.yaml'), '--stories-dir', tmp, '--project', 'P', '--date', DATE]);
    expect(code).toBe(1);
    expect(out.error).toContain('not valid JSON');
  });
});
