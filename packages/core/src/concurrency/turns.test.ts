import { describe, expect, it } from 'vitest';
import { createTurns } from './turns.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('createTurns', () => {
  it('runs one at a time per key, in order', async () => {
    const inTurn = createTurns();
    const log: string[] = [];
    const work = (name: string) => async () => {
      log.push(`${name} in`);
      await tick();
      log.push(`${name} out`);
    };
    await Promise.all([inTurn('k', work('a')), inTurn('k', work('b'))]);
    expect(log).toEqual(['a in', 'a out', 'b in', 'b out']);
  });

  it('lets other keys through', async () => {
    const inTurn = createTurns();
    const log: string[] = [];
    let release = () => {};
    const blocked = inTurn('k', () => new Promise<void>((resolve) => (release = resolve)));
    await inTurn('other', async () => void log.push('other'));
    expect(log).toEqual(['other']);
    release();
    await blocked;
  });

  it('carries on after a failure, and gives the failure to its own caller', async () => {
    const inTurn = createTurns();
    await expect(inTurn('k', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await inTurn('k', async () => 'next')).toBe('next');
  });
});
