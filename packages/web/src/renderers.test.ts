import { describe, expect, it } from 'vitest';
import { rendererFor, renderers } from './renderers';

describe('renderers', () => {
  it('has the html renderer', () => {
    expect(renderers.map((renderer) => renderer.id)).toEqual(['html']);
    expect(rendererFor('html')).toBeDefined();
  });

  it('has no renderer for an unknown kind', () => {
    expect(rendererFor('nope')).toBeUndefined();
  });
});
