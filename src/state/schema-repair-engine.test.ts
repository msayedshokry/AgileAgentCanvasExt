import { describe, it, expect } from 'vitest';
import { repairDataWithSchema } from './schema-repair-engine';

const schema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['draft', 'ready', 'in-progress', 'done'],
      'x-aliases': { complete: 'done' },
    },
  },
};

const repairStatus = (status: string) => repairDataWithSchema({ status }, schema);

describe('enum repair', () => {
  it('fixes near misses in spelling and case', () => {
    expect(repairStatus('In Progress').data.status).toBe('in-progress');
    expect(repairStatus('redy').data.status).toBe('ready');
  });

  it('maps an alias to its target', () => {
    expect(repairStatus('complete').data.status).toBe('done');
  });

  it('leaves a value that matches nothing unchanged instead of using the first enum value', () => {
    const result = repairStatus('someday');
    expect(result.data.status).toBe('someday');
    expect(result.changed).toBe(false);
  });

  it('completes a clear abbreviation', () => {
    expect(repairStatus('in-prog').data.status).toBe('in-progress');
  });

  it.each(['not-ready', 'undone', 'in', ''])('does not rewrite %j to a status it merely contains or prefixes', (value) => {
    const result = repairStatus(value);
    expect(result.data.status).toBe(value);
    expect(result.changed).toBe(false);
  });
});

describe('string to object coercion', () => {
  const refsSchema = (props: Record<string, { type: string; enum?: string[] }>, required?: string[]) => ({
    type: 'object',
    properties: {
      refs: { type: 'array', items: { type: 'object', properties: props, ...(required ? { required } : {}) } },
    },
  });

  it('puts the string in a content field, not a classifier like "type"', () => {
    // Story uxReferences: { type, reference, description }; a bare file name is the reference.
    const schema = refsSchema({ type: { type: 'string' }, reference: { type: 'string' }, description: { type: 'string' } });
    const result = repairDataWithSchema({ refs: ['wireframe-board.fig'] }, schema);
    expect(result.data.refs[0]).toEqual({ type: '', reference: 'wireframe-board.fig', description: '' });
  });

  it('prefers a required content field', () => {
    const schema = refsSchema({ kind: { type: 'string' }, note: { type: 'string' }, title: { type: 'string' } }, ['title']);
    expect(repairDataWithSchema({ refs: ['Login page'] }, schema).data.refs[0].title).toBe('Login page');
  });

  it('never uses an enum field for free text', () => {
    const schema = refsSchema({ status: { type: 'string', enum: ['open', 'closed'] }, text: { type: 'string' } });
    expect(repairDataWithSchema({ refs: ['Check the logs'] }, schema).data.refs[0]).toEqual({ status: '', text: 'Check the logs' });
  });

  it('still uses a classifier field when it is the only string field', () => {
    const schema = refsSchema({ type: { type: 'string' }, count: { type: 'integer' } });
    expect(repairDataWithSchema({ refs: ['figma'] }, schema).data.refs[0].type).toBe('figma');
  });
});

describe('number enum repair', () => {
  const numberSchema = {
    type: 'object',
    properties: { level: { type: 'integer', enum: [1, 2, 3], default: 1 } },
  };

  it('leaves an out-of-set number for validation instead of using the default', () => {
    const result = repairDataWithSchema({ level: 7 }, numberSchema);
    expect(result.data.level).toBe(7);
    expect(result.changed).toBe(false);
  });

  it('still keeps a number that is in the set', () => {
    expect(repairDataWithSchema({ level: 2 }, numberSchema).data.level).toBe(2);
  });
});
