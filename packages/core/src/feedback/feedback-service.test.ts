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
    const result = await services.feedback.send(ws, { overall: 'Keep it small' });
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
    await services.feedback.send(ws, { overall: 'Just a note' });
    expect(session.received.at(-1)).toContain('<overall>Just a note</overall>');
  });

  it('refuses when there is nothing at all', async () => {
    const { services, ws } = await setup();
    await expect(services.feedback.send(ws)).rejects.toThrow('Nothing to send');
  });
});

/** Two agents done with their turn, each the author of one artifact: `a1` by the Scoper, `a2` by the Designer. */
const withTwoAuthors = async () => {
  const context = await setup();
  const { services, ws, picker, backend, session: scoper } = context;
  picker.answer = async () => [{ role: 'designer', instruction: 'Draw' }];
  const designer = await services.agents.add(ws, 'Draw');
  const designerSession = backend.last();
  await designerSession.tool('artifact_create', { title: 'Design', html: '<p>d</p>', note: 'first' });
  designerSession.emit({ type: 'turn.ended', outcome: 'success' });
  await settle();
  return { ...context, scoper, designer: designer.id, designerSession };
};

const finish = async (session: { emit(event: { type: 'turn.ended'; outcome: 'success' }): void }) => {
  session.emit({ type: 'turn.ended', outcome: 'success' });
  await settle();
};

describe('Send with several agents', () => {
  it('gives each author only the answers for its own artifacts, with the note on the first group', async () => {
    const { services, ws, agent, designer, scoper, designerSession } = await withTwoAuthors();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await services.feedback.saveAnswers(ws, 'a2', 1, [{ name: 'layout', label: 'Layout', value: 'wide' }]);
    const { recipients } = await services.feedback.send(ws, { overall: 'Keep it small' });
    expect(recipients).toEqual([agent, designer]);
    expect(scoper.received.at(-1)).toContain('artifact="a1"');
    expect(scoper.received.at(-1)).toContain('<overall>Keep it small</overall>');
    expect(scoper.received.at(-1)).not.toContain('Layout');
    expect(designerSession.received.at(-1)).toContain('artifact="a2"');
    expect(designerSession.received.at(-1)).not.toContain('overall');
    expect(designerSession.received.at(-1)).not.toContain('Wallet');
    const feedback = (await services.posts.list(ws)).filter((p) => p.kind === 'feedback');
    expect(feedback).toMatchObject([{ agent, overall: 'Keep it small' }, { agent: designer }]);
    expect(feedback[1]).not.toHaveProperty('overall');
  });

  it('sends answers to whoever posted the latest version, not whoever created the artifact', async () => {
    const { services, ws, designer, designerSession, scoper } = await withTwoAuthors();
    const received = scoper.received.length;
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await services.artifacts.update(ws, designer, { id: 'a1', baseVersion: 1, content: '<p>b</p>', note: 'mine now' });
    const { recipients } = await services.feedback.send(ws);
    expect(recipients).toEqual([designer]);
    expect(designerSession.received.at(-1)).toContain('artifact="a1" title="Scope: Checkout" version="2"');
    expect(scoper.received).toHaveLength(received);
  });

  it('delivers nothing to anyone if one recipient runs, and names it', async () => {
    const { services, ws, designer, scoper, designerSession } = await withTwoAuthors();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await services.feedback.saveAnswers(ws, 'a2', 1, [answer]);
    await services.agents.send(ws, designer, 'one more thing');
    const before = [scoper.received.length, designerSession.received.length];
    await expect(services.feedback.send(ws, { overall: 'n' })).rejects.toThrow('Designer is working');
    expect([scoper.received.length, designerSession.received.length]).toEqual(before);
    expect((await services.feedback.latestAnswers(ws)).every((set) => set.sentAt === undefined)).toBe(true);

    await finish(designerSession);
    expect((await services.feedback.send(ws, { overall: 'n' })).recipients).toHaveLength(2);
  });

  it('is not refused by an agent that gets nothing', async () => {
    const { services, ws, agent, designerSession, designer } = await withTwoAuthors();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await services.agents.send(ws, designer, 'busy now');
    expect((await services.feedback.send(ws)).recipients).toEqual([agent]);
    expect(designerSession.received.at(-1)).toBe('busy now');
  });

  it('sends a note with no answers to the tab that is open', async () => {
    const { services, ws, designer, designerSession } = await withTwoAuthors();
    expect((await services.feedback.send(ws, { overall: 'Hi', to: designer })).recipients).toEqual([designer]);
    expect(designerSession.received.at(-1)).toContain('<overall>Hi</overall>');
  });

  it('refuses a note to an agent that does not exist', async () => {
    const { services, ws } = await withTwoAuthors();
    await expect(services.feedback.send(ws, { overall: 'Hi', to: 'nobody' })).rejects.toThrow('No agent nobody');
  });

  it('frees the others when a recipient cannot be reached, and keeps their answers pending', async () => {
    const { services, ws, scoper, designer, designerSession } = await withTwoAuthors();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await services.feedback.saveAnswers(ws, 'a2', 1, [answer]);
    scoper.send = () => Promise.reject(new Error('gone'));
    await expect(services.feedback.send(ws)).rejects.toThrow('could not be reached');
    expect((await services.feedback.latestAnswers(ws)).every((set) => set.sentAt === undefined)).toBe(true);
    await services.agents.send(ws, designer, 'still free');
    expect(designerSession.received.at(-1)).toBe('still free');
  });
});

describe('Send at the same time as other things', () => {
  it('delivers once when pressed twice', async () => {
    const { services, ws, session } = await setup();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    const before = session.received.length;
    const sends = await Promise.allSettled([services.feedback.send(ws), services.feedback.send(ws)]);
    expect(sends.map((s) => s.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(session.received).toHaveLength(before + 1);
    expect((await services.posts.list(ws)).filter((p) => p.kind === 'feedback')).toHaveLength(1);
  });

  it('never half-delivers when a message to one recipient races it', async () => {
    const { services, ws, designer, scoper, designerSession } = await withTwoAuthors();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await services.feedback.saveAnswers(ws, 'a2', 1, [answer]);
    const before = scoper.received.length;
    const [send, message] = await Promise.allSettled([services.feedback.send(ws), services.agents.send(ws, designer, 'racing')]);
    expect(message.status).toBe('fulfilled');
    expect(send.status).toBe('rejected');
    expect(scoper.received).toHaveLength(before);
    expect(designerSession.received.at(-1)).toBe('racing');
    expect((await services.feedback.latestAnswers(ws)).every((set) => set.sentAt === undefined)).toBe(true);
  });

  it('does not carry answers over to a version that races the Send', async () => {
    const { services, ws, designer } = await withTwoAuthors();
    await services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await Promise.all([
      services.feedback.send(ws),
      services.artifacts.update(ws, designer, { id: 'a1', baseVersion: 1, content: '<p>b</p>', note: 'n' }),
    ]);
    expect(await services.feedback.send(ws).catch((e: Error) => e.message)).toBe('Nothing to send.');
  });

  it('never strands answers on a version a new one just replaced', async () => {
    const { services, ws, agent } = await setup();
    const update = { id: 'a1', baseVersion: 1, content: '<p>b</p>', note: 'n' };
    const [saved] = await Promise.allSettled([
      services.feedback.saveAnswers(ws, 'a1', 1, [answer]),
      services.artifacts.update(ws, agent, update),
    ]);
    expect(saved.status).toBe('fulfilled');
    expect(await services.feedback.latestAnswers(ws)).toEqual([{ artifact: 'a1', version: 2, answers: [answer] }]);
  });

  it('refuses answers once the new version has landed', async () => {
    const { services, ws, agent } = await setup();
    const update = services.artifacts.update(ws, agent, { id: 'a1', baseVersion: 1, content: '<p>b</p>', note: 'n' });
    await settle();
    const save = services.feedback.saveAnswers(ws, 'a1', 1, [answer]);
    await update;
    await expect(save).rejects.toThrow('read-only');
    expect(await services.feedback.latestAnswers(ws)).toEqual([]);
  });
});
