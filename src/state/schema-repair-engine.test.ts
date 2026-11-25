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
