import { describe, expect, it } from 'vitest';
import { createRegistry } from './registry.js';

describe('createRegistry', () => {
  it('looks entries up by id and lists them', () => {
    const registry = createRegistry('thing', [{ id: 'a' }, { id: 'b' }]);
    expect(registry.get('a')).toEqual({ id: 'a' });
    expect(registry.has('c')).toBe(false);
    expect(registry.list().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('refuses duplicates and unknown ids, naming the registry', () => {
    expect(() => createRegistry('thing', [{ id: 'a' }, { id: 'a' }])).toThrow('Duplicate thing: a');
    expect(() => createRegistry('thing', []).get('a')).toThrow('Unknown thing: a');
  });
});
