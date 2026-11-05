import { describe, expect, it } from 'vitest';
import { rendererFor, renderers } from './renderers';

describe('renderers', () => {
  it('has a renderer for each kind', () => {
    expect(renderers.map((renderer) => renderer.id)).toEqual(['html', 'branch-map']);
    expect(rendererFor('html')?.ownVersions).toBeFalsy();
    expect(rendererFor('branch-map')?.ownVersions).toBe(true);
  });

  it('has no renderer for an unknown kind', () => {
    expect(rendererFor('nope')).toBeUndefined();
  });
});
