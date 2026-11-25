// Every artifact in the bundled sample project must satisfy its schema: the
// sample is what new users open first, and it is hand-edited over time.
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getAvailableSchemaTypes, schemaValidator } from './schema-validator';

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
