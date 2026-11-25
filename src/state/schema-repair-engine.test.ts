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
});
