import { describe, expect, it } from 'vitest';
import { createHarness, settle } from '../testing/harness.js';

const setup = async () => {
  const harness = createHarness();
  const state = await harness.services.workspaces.create({ goal: 'Scope checkout' });
  return { ...harness, ws: state.workspace.id, agent: state.workspace.agents[0]!.id, session: harness.backend.last() };
};

describe('a stored session that can no longer resume', () => {
  const restart = async () => {
    const { store, ws, agent, session, services, backend } = await setup();
    session.emit({ type: 'session', sessionId: 's-gone' });
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    services.agents.closeAll();
    return { store, ws, agent, services, backend };
  };
  const sessionId = async (store: Awaited<ReturnType<typeof setup>>['store'], ws: string) => (await store.getWorkspace(ws))!.agents[0]!.sessionId;

  it('starts over when the session fails its first turn, with the overview and the same message', async () => {
    const { services, ws, agent, backend, store } = await restart();
    await services.agents.send(ws, agent, 'carry on');
    const resumed = backend.last();
    expect(resumed.resumedFrom).toBe('s-gone');
    resumed.emit({ type: 'turn.ended', outcome: 'error', error: 'No conversation found' });
    resumed.end(new Error('No conversation found'));
    await settle();

    const fresh = backend.last();
    expect(fresh).not.toBe(resumed);
    expect(fresh.resumedFrom).toBeUndefined();
    expect(fresh.received).toHaveLength(1);
    expect(fresh.received[0]).toMatch(/^<drums-workspace>[\s\S]*carry on$/);
    const stored = await store.getWorkspace(ws);
    expect(stored!.agents[0]).toMatchObject({ status: 'running' });
    expect(stored!.agents[0]!.sessionId).toBeUndefined();
    const steps = (await services.workspaces.state(ws)).steps;
    expect(steps.some((step) => step.kind === 'error')).toBe(false);
    expect(steps.at(-1)).toMatchObject({ tool: 'drums', summary: expect.stringContaining('could not resume') });

    fresh.emit({ type: 'session', sessionId: 's-new' });
    fresh.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    expect(await sessionId(store, ws)).toBe('s-new');
    expect(stored!.agents[0]!.status).toBe('running');
  });

  it('starts over when the session dies without a word', async () => {
    const { services, ws, agent, backend } = await restart();
    await services.agents.send(ws, agent, 'carry on');
    backend.last().end(new Error('exited with code 1'));
    await settle();
    expect(backend.last().resumedFrom).toBeUndefined();
    expect(backend.last().received.at(-1)).toContain('carry on');
  });

  it('starts over when the backend refuses to resume at all', async () => {
    const { services, ws, agent, backend, store } = await restart();
    const start = backend.sessions.length;
    backend.resume = async () => {
      throw new Error('unknown session');
    };
    await services.agents.send(ws, agent, 'carry on');
    expect(backend.sessions).toHaveLength(start + 1);
    expect(backend.last().received.at(-1)).toContain('carry on');
    expect(await sessionId(store, ws)).toBeUndefined();
  });

  it('leaves a session that resumed alone when a later turn fails', async () => {
    const { services, ws, agent, backend, store } = await restart();
    await services.agents.send(ws, agent, 'carry on');
    const resumed = backend.last();
    resumed.emit({ type: 'session', sessionId: 's-gone' });
    resumed.emit({ type: 'turn.ended', outcome: 'error', error: 'overloaded' });
    await settle();
    expect(backend.last()).toBe(resumed);
    expect(await sessionId(store, ws)).toBe('s-gone');
    expect((await store.getWorkspace(ws))!.agents[0]!.status).toBe('idle');
  });

  it('goes idle with the error when a new session fails too: it never loops', async () => {
    const { services, ws, agent, backend, store } = await restart();
    await services.agents.send(ws, agent, 'carry on');
    backend.last().end(new Error('gone'));
    await settle();
    const count = backend.sessions.length;
    backend.last().emit({ type: 'turn.ended', outcome: 'error', error: 'no auth' });
    await settle();
    expect(backend.sessions).toHaveLength(count);
    expect((await store.getWorkspace(ws))!.agents[0]!.status).toBe('idle');
    await services.agents.send(ws, agent, 'try again');
    expect(backend.last().received.at(-1)).toBe('try again');
  });

  it('after a restart: several agents come back idle, rows expire, and each resumes its own session', async () => {
    const harness = createHarness();
    const { workspace } = await harness.services.workspaces.create({ goal: 'Team' });
    const ws = workspace.id;
    const first = harness.backend.last();
    first.emit({ type: 'session', sessionId: 's-1' });
    harness.picker.answer = async () => [{ role: 'designer', instruction: 'Draw' }];
    const designer = await harness.services.agents.add(ws, 'Draw');
    const second = harness.backend.last();
    second.emit({ type: 'session', sessionId: 's-2' });
    second.emit({ type: 'permission.requested', id: 'p1', tool: 'Bash', title: 'Run', detail: 'x' });
    await settle();
    expect((await harness.store.getWorkspace(ws))!.agents.map((a) => a.status)).toEqual(['running', 'input']);

    harness.services.agents.closeAll();
    await settle();
    await harness.services.agents.recover();
    const after = (await harness.store.getWorkspace(ws))!;
    expect(after.agents.map((a) => a.status)).toEqual(['idle', 'idle']);
    expect(after.permissions).toMatchObject([{ id: 'p1', status: 'expired' }]);

    await harness.services.agents.send(ws, designer.id, 'back');
    expect(harness.backend.last().resumedFrom).toBe('s-2');
  });
});
