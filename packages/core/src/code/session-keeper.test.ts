import { describe, expect, it } from 'vitest';
import { createHarness, settle } from '../testing/harness.js';

const setup = async () => {
  const harness = createHarness();
  const { workspace } = await harness.services.workspaces.create({ goal: 'Paging', repos: [{ name: 'api', base: 'main' }] });
  const ws = workspace.id;
  const session = harness.backend.last();
  const reviews = () => harness.code.state.sessions;
  const endTurn = async () => {
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
  };
  const passGrace = async () => {
    harness.timers.fire();
    await settle();
  };
  return { ...harness, ws, session, reviews, endTurn, passGrace, agent: workspace.agents[0]!.id };
};

describe('pausing code sessions', () => {
  it('keeps them while an agent runs, however long that takes', async () => {
    const { reviews, passGrace } = await setup();
    await passGrace();
    expect(reviews()[0]!.stopped).toBe(false);
  });

  it('stops them a grace period after the last agent ends, with nobody looking', async () => {
    const { reviews, endTurn, timers, passGrace } = await setup();
    await endTurn();
    expect(reviews()[0]!.stopped).toBe(false);
    expect(timers.pending.size).toBe(1);
    await passGrace();
    expect(reviews()[0]!.stopped).toBe(true);
  });

  it('keeps them while the workspace is open, and for the grace period after', async () => {
    const { services, ws, reviews, endTurn, passGrace } = await setup();
    const leave = services.code.view(ws);
    await endTurn();
    await passGrace();
    expect(reviews()[0]!.stopped).toBe(false);
    leave();
    expect(reviews()[0]!.stopped).toBe(false);
    await passGrace();
    expect(reviews()[0]!.stopped).toBe(true);
  });

  it('does not churn on a reload: back within the grace period, the same session goes on', async () => {
    const { services, ws, reviews, endTurn, passGrace } = await setup();
    const first = services.code.view(ws);
    await endTurn();
    first();
    const second = services.code.view(ws);
    await passGrace();
    await services.code.mapState(ws);
    expect(reviews()).toHaveLength(1);
    expect(reviews()[0]!.stopped).toBe(false);
    second();
  });

  it('counts each connection, and leaving twice as once', async () => {
    const { services, ws, reviews, endTurn, passGrace } = await setup();
    const one = services.code.view(ws);
    const other = services.code.view(ws);
    await endTurn();
    one();
    one();
    await passGrace();
    expect(reviews()[0]!.stopped).toBe(false);
    other();
    await passGrace();
    expect(reviews()[0]!.stopped).toBe(true);
  });

  it('keeps them while a permission waits, though the status is not running', async () => {
    const { session, reviews, passGrace, endTurn, services, ws, agent } = await setup();
    session.emit({ type: 'permission.requested', id: 'p1', tool: 'Bash', title: 'Run', detail: 'x' });
    await settle();
    await passGrace();
    expect(reviews()[0]!.stopped).toBe(false);
    await services.agents.answerPermission(ws, agent, 'p1', 'allow');
    await endTurn();
    await passGrace();
    expect(reviews()[0]!.stopped).toBe(true);
  });

  it('makes no difference to anything that comes after', async () => {
    const { services, ws, reviews, endTurn, passGrace, session, agent } = await setup();
    await endTurn();
    await passGrace();

    // The count on the strip and pending comments need no session at all.
    await services.workspaces.list();
    await services.code.pendingReviews(ws);
    expect(reviews()).toHaveLength(1);

    await services.agents.send(ws, agent, 'carry on');
    expect((await session.tool('impact', {})).text).toBe('## impact');
    expect(reviews()).toHaveLength(2);
    expect(reviews()[1]!.request).toEqual(reviews()[0]!.request);

    await endTurn();
    await passGrace();
    expect(reviews()[1]!.stopped).toBe(true);
  });

  it('pauses a session that was only opened to answer one request', async () => {
    const { services, ws, reviews, endTurn, passGrace } = await setup();
    await endTurn();
    await passGrace();
    await services.code.mapSource(ws, 'api');
    expect(reviews()[1]!.stopped).toBe(false);
    await passGrace();
    expect(reviews()[1]!.stopped).toBe(true);
  });

  it('reports a resume that fails, and tries again on the next request', async () => {
    const { services, ws, code, reviews, endTurn, passGrace } = await setup();
    await endTurn();
    await passGrace();
    code.state.failOpen = 'api';
    expect((await services.code.mapState(ws)).repos[0]!.error).toMatch(/could not start: missing object/);
    await expect(services.code.mapSource(ws, 'api')).rejects.toThrow(/could not start/);
    expect(await services.code.pendingReviews(ws)).toEqual([]);

    code.state.failOpen = undefined;
    expect((await services.code.mapState(ws)).repos[0]!.error).toBeUndefined();
    expect(reviews()).toHaveLength(2);
    expect(reviews()[1]!.stopped).toBe(false);
  });

  it('an impact in a failed resume says so to the agent, and the agent stays usable', async () => {
    const { services, ws, code, session, endTurn, passGrace, agent } = await setup();
    await endTurn();
    await passGrace();
    code.state.failOpen = 'api';
    await services.agents.send(ws, agent, 'carry on');
    const result = await session.tool('impact', {});
    expect(result.text).toMatch(/could not start/);
  });

  it('a new session waits for the one still stopping on its worktree', async () => {
    const { services, ws, reviews, endTurn, timers } = await setup();
    await endTurn();
    let release = () => {};
    reviews()[0]!.stop = () => new Promise<void>((resolve) => (release = resolve));
    timers.fire();
    await settle();
    const opening = services.code.mapSource(ws, 'api');
    await settle();
    expect(reviews()).toHaveLength(1);
    release();
    await opening;
    expect(reviews()).toHaveLength(2);
  });

  it('close stops everything and leaves no timers', async () => {
    const { services, reviews, endTurn, timers } = await setup();
    await endTurn();
    await services.close();
    expect(timers.pending.size).toBe(0);
    expect(reviews()[0]!.stopped).toBe(true);
  });
});
