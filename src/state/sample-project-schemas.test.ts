// Every artifact in the bundled sample project must satisfy its schema: the
// sample is what new users open first, and it is hand-edited over time.
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getAvailableSchemaTypes, schemaValidator } from './schema-validator';
import { repairArtifactData } from './schema-artifact-mapper';

const RESOURCES = path.resolve(__dirname, '..', '..', 'resources');
const SAMPLE = path.join(RESOURCES, 'sample-project');

interface SampleArtifact {
  readonly rel: string;
  readonly type: string;
  readonly data: Record<string, unknown>;
}

function sampleArtifacts(): SampleArtifact[] {
  const out: SampleArtifact[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.json')) continue;
      const data = JSON.parse(fs.readFileSync(full, 'utf-8')) as Record<string, unknown>;
      const type = (data.metadata as { artifactType?: unknown } | undefined)?.artifactType;
      out.push({ rel: path.relative(SAMPLE, full).split(path.sep).join('/'), type: String(type ?? ''), data });
    }
  };
  walk(SAMPLE);
  return out;
}

const artifacts = sampleArtifacts();

beforeAll(() => {
  schemaValidator.init(path.join(RESOURCES, '_aac'));
});

describe('sample project artifacts', () => {
  it('each declares an artifact type that has a schema', () => {
    const known = new Set(getAvailableSchemaTypes());
    const unmapped = artifacts.filter((a) => !known.has(a.type)).map((a) => `${a.rel} (${a.type || 'no artifactType'})`);
    expect(unmapped).toEqual([]);
  });

  it.each(artifacts.map((a) => [a.rel, a] as const))('%s satisfies its schema', (_rel, artifact) => {
    const result = schemaValidator.validate(artifact.type, artifact.data, artifact.rel);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  // Shapes that may legitimately carry both alternatives at once (structured
  // fields plus a prose rendering) must use anyOf, not oneOf.
  const sampleStory = (): Record<string, unknown> => {
    const epics = artifacts.find((a) => a.type === 'epics')!.data as {
      content: { epics: Array<{ id: string; stories?: unknown[] }> };
    };
    const epic = epics.content.epics[0];
    const story = epic.stories!.find((s) => typeof s === 'object') as Record<string, unknown>;
    return JSON.parse(JSON.stringify({ ...story, epicId: epic.id })) as Record<string, unknown>;
  };

  it('accepts a standalone story whose user story is both structured and formatted', () => {
    const story = sampleStory();
    const userStory = story.userStory as Record<string, unknown>;
    expect(userStory.asA).toBeDefined();
    expect(userStory.formatted).toBeDefined();
    const result = schemaValidator.validate('story', { content: story });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts an epics acceptance criterion that has both Given/When/Then and criterion text', () => {
    const epics = JSON.parse(JSON.stringify(artifacts.find((a) => a.type === 'epics')!.data)) as {
      content: { epics: Array<{ stories?: Array<{ acceptanceCriteria?: Array<Record<string, unknown>> }> }> };
    };
    const ac = epics.content.epics[0].stories![0].acceptanceCriteria![0];
    expect(ac.given).toBeDefined();
    ac.criterion = 'Creating a task returns it with a unique ID';
    const result = schemaValidator.validate('epics', epics);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('checks inline epics against the full epic shape, not only the file-reference shape', () => {
    const epics = JSON.parse(JSON.stringify(artifacts.find((a) => a.type === 'epics')!.data)) as {
      content: { epics: Array<{ stories?: Array<Record<string, unknown>> }> };
    };
    delete epics.content.epics[0].stories![0].acceptanceCriteria;
    const result = schemaValidator.validate('epics', epics);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/acceptanceCriteria/);
  });

  it('reports the concrete problem with an inline epic, not the shape-matching noise', () => {
    const epics = JSON.parse(JSON.stringify(artifacts.find((a) => a.type === 'epics')!.data)) as {
      content: { epics: Array<Record<string, unknown>> };
    };
    epics.content.epics[0].status = 'someday';
    const result = schemaValidator.validate('epics', epics);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.stringMatching(/^\.content\.epics\[0\]\.status: .*one of -> draft/),
    ]);
  });

  // Agents write "partial" for a half-done epic. Without the alias, repair
  // fuzzy-matched it to "draft", marking finished work as not started.
  describe('inline epic status "partial"', () => {
    type EpicsDoc = { content: { epics: Array<Record<string, unknown>> } };
    const withPartialStatus = (): EpicsDoc => {
      const epics = JSON.parse(JSON.stringify(artifacts.find((a) => a.type === 'epics')!.data)) as EpicsDoc;
      epics.content.epics[0].status = 'partial';
      return epics;
    };

    it('validates as in-progress', () => {
      const epics = withPartialStatus();
      const result = schemaValidator.validate('epics', epics);
      expect(result.errors).toEqual([]);
      expect(epics.content.epics[0].status).toBe('in-progress');
    });

    it('is repaired to in-progress, not fuzzy-matched to draft', () => {
      const repaired = repairArtifactData(withPartialStatus(), 'epics', 'epics.json') as EpicsDoc;
      expect(repaired.content.epics[0].status).toBe('in-progress');
    });
  });

  it('fails validation when a required field is removed', () => {
    const retro = artifacts.find((a) => a.type === 'retrospective');
    expect(retro).toBeDefined();
    const broken = JSON.parse(JSON.stringify(retro!.data)) as { content: Record<string, unknown> };
    delete broken.content.epicReference;
    const result = schemaValidator.validate('retrospective', broken);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
