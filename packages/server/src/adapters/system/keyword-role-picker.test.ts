import { createRoleRegistry } from '@drums/core';
import { describe, expect, it } from 'vitest';
import { createKeywordRolePicker } from './keyword-role-picker.js';

const candidates = createRoleRegistry()
  .list()
  .map(({ id, summary }) => ({ id, summary }));

const pickFor = async (goal: string) =>
  (await createKeywordRolePicker().pick({ goal, candidates, hasRepos: false, exactlyOne: true })).map((pick) => pick.role);

describe('the keyword role picker', () => {
  it('finds the role from the words in its summary', async () => {
    expect(await pickFor('Review the plan for gaps')).toEqual(['reviewer']);
    expect(await pickFor('Research payment providers and compare them')).toEqual(['researcher']);
    expect(await pickFor('Design the checkout screen')).toEqual(['designer']);
    expect(await pickFor('Work out the scope of this')).toEqual(['scoper']);
  });

  it('takes the role the request names first on a tie', async () => {
    expect(await pickFor('Review the scope against the code')).toEqual(['reviewer']);
    expect(await pickFor('Scope the review process')).toEqual(['scoper']);
  });

  it('returns nothing when no word matches, so core falls back', async () => {
    expect(await pickFor('xyzzy plugh')).toEqual([]);
    expect(await pickFor('the and of')).toEqual([]);
  });

  it('keeps the instruction as it was given', async () => {
    const [pick] = await createKeywordRolePicker().pick({ goal: 'Review IT', candidates, hasRepos: false, exactlyOne: true });
    expect(pick?.instruction).toBe('Review IT');
  });

  it('returns every match unless asked for one', async () => {
    const picks = await createKeywordRolePicker().pick({ goal: 'Review the scope', candidates, hasRepos: false });
    expect(picks.map((pick) => pick.role)).toEqual(['reviewer', 'scoper']);
  });

  it('knows only the candidates it is given', async () => {
    const picks = await createKeywordRolePicker().pick({
      goal: 'water the plants',
      candidates: [{ id: 'gardener', summary: 'Waters plants' }],
      hasRepos: false,
    });
    expect(picks.map((pick) => pick.role)).toEqual(['gardener']);
  });
});
