import { describe, expect, it } from 'vitest';
import { createHarness, settle } from '../testing/harness.js';
import { formatFeedback } from './format.js';

const answer = { name: 'q-psp', label: 'Wallet payments provider', value: 'Stripe' };

/** A workspace with an artifact at v1, and the agent done with its turn. */
const setup = async () => {
  const harness = createHarness();
  const state = await harness.services.workspaces.create('Goal');
  const ws = state.workspace.id;
  const agent = state.workspace.agents[0]!.id;
  const session = harness.backend.last();
  await harness.services.artifacts.create(ws, agent, { title: 'Scope: Checkout', content: '<p>a</p>', note: 'first' });
  session.emit({ type: 'turn.ended', outcome: 'success' });
  await settle();
  return { ...harness, ws, agent, session };
};

describe('formatFeedback', () => {
  it('matches the format of the spec', () => {
    expect(
      formatFeedback(
        [
          {
            artifact: 'a1',
            title: 'Scope: Checkout v2',
            version: 2,
            answers: [
              { name: 'q-psp', label: 'Wallet payments provider', value: 'Stripe' },
              { name: 'scope-promo', label: 'Promo codes in checkout', value: 'in' },
            ],
          },
        ],
        'Keep it small',
      ),
    ).toBe(`<drums-feedback artifact="a1" title="Scope: Checkout v2" version="2">
  <answer name="q-psp" label="Wallet payments provider">Stripe</answer>
  <answer name="scope-promo" label="Promo codes in checkout">in</answer>
  <overall>Keep it small</overall>
</drums-feedback>`);
  });

  it('escapes what comes from the iframe, so a value cannot close a tag', () => {
    const text = formatFeedback([
      { artifact: 'a1', title: 'T', version: 1, answers: [{ name: 'n"x', label: '<l>', value: '</answer></drums-feedback>' }] },
    ]);
    expect(text).toContain('<answer name="n&quot;x" label="&lt;l&gt;">&lt;/answer&gt;&lt;/drums-feedback&gt;</answer>');
  });

  it('carries an overall note on its own', () => {
    expect(formatFeedback([], 'Hi')).toBe('<drums-feedback>\n  <overall>Hi</overall>\n</drums-feedback>');
  });
});

describe('answers', () => {
  it('saves pending answers and announces them', async () => {
    const { services, seen, ws } = await setup();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    expect(await services.feedback.latestAnswers(ws)).toEqual([{ artifact: 'a1', version: 1, answers: [answer] }]);
    expect(seen.some((e) => e.type === 'answers.changed')).toBe(true);
  });

  it('refuses answers on an old or unknown version', async () => {
    const { services, ws, agent } = await setup();
    await services.artifacts.update(ws, agent, { id: 'a1', baseVersion: 1, content: '<p>b</p>', note: 'n' });
    await expect(services.feedback.saveAnswers(ws, 'a1', 1, [answer])).rejects.toThrow('read-only');
    await expect(services.feedback.saveAnswers(ws, 'a1', 9, [answer])).rejects.toThrow('no version 9');
  });

  it('carries unsent answers to a new version', async () => {
    const { services, ws, agent } = await setup();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await services.artifacts.update(ws, agent, { id: 'a1', baseVersion: 1, content: '<p>b</p>', note: 'n' });
    expect(await services.feedback.latestAnswers(ws)).toEqual([{ artifact: 'a1', version: 2, answers: [answer] }]);
  });
});

describe('Send', () => {
  it('delivers answers to the author of the latest version as one message, and marks them sent', async () => {
    const { services, session, ws, agent } = await setup();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    const result = await services.feedback.send(ws, 'Keep it small');
    expect(result.recipients).toEqual([agent]);
    expect(session.received.at(-1)).toContain('<drums-feedback artifact="a1" title="Scope: Checkout" version="1">');
    expect(session.received.at(-1)).toContain('<overall>Keep it small</overall>');
    expect((await services.posts.list(ws)).at(-1)).toMatchObject({ kind: 'feedback', overall: 'Keep it small' });
    expect((await services.feedback.latestAnswers(ws))[0]?.sentAt).toBeDefined();
  });

  it('does not send the same answers twice', async () => {
    const { services, session, ws } = await setup();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await services.feedback.send(ws);
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    await expect(services.feedback.send(ws)).rejects.toThrow('Nothing to send');
  });

  it('does not carry sent answers to the next version', async () => {
    const { services, ws, agent } = await setup();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await services.feedback.send(ws);
    await services.artifacts.update(ws, agent, { id: 'a1', baseVersion: 1, content: '<p>b</p>', note: 'n' });
    expect(await services.feedback.latestAnswers(ws)).toEqual([]);
  });

  it('is refused while the recipient runs, and delivers nothing', async () => {
    const { services, session, ws, agent } = await setup();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await services.agents.send(ws, agent, 'one more thing');
    const received = session.received.length;
    await expect(services.feedback.send(ws)).rejects.toThrow('is working');
    expect(session.received).toHaveLength(received);
    expect((await services.feedback.latestAnswers(ws))[0]?.sentAt).toBeUndefined();
  });

  it('keeps answers pending when the agent could not be reached', async () => {
    const { services, session, ws } = await setup();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    session.send = () => Promise.reject(new Error('gone'));
    await expect(services.feedback.send(ws)).rejects.toThrow('could not be reached');
    expect((await services.feedback.latestAnswers(ws))[0]?.sentAt).toBeUndefined();
  });

  it('sends an overall note with no answers to the agent', async () => {
    const { services, session, ws } = await setup();
    await services.feedback.send(ws, 'Just a note');
    expect(session.received.at(-1)).toContain('<overall>Just a note</overall>');
  });

  it('refuses when there is nothing at all', async () => {
    const { services, ws } = await setup();
    await expect(services.feedback.send(ws)).rejects.toThrow('Nothing to send');
  });
});
