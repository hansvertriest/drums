import { describe, expect, it } from 'vitest';
import { rendererFor, renderers } from './renderers';

describe('renderers', () => {
  it('has the dummy entry', () => {
    expect(renderers.map((renderer) => renderer.id)).toEqual(['dummy']);
    expect(rendererFor('dummy')).toBeDefined();
  });

  it('has no renderer for an unknown kind', () => {
    expect(rendererFor('nope')).toBeUndefined();
  });
});
