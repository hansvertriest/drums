import { describe, expect, it } from 'vitest';
import { createSystemClock } from './clock.js';
import { createUuidIds } from './ids.js';

describe('system adapters', () => {
  it('tells the time', () => {
    expect(createSystemClock().now()).toBeInstanceOf(Date);
  });

  it('never repeats an id', () => {
    const ids = createUuidIds();
    expect(ids.next()).not.toBe(ids.next());
  });
});
