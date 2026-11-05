import { describe, expect, it } from 'vitest';
import { createHarness, settle } from '../testing/harness.js';

const call = { type: 'permission.requested' as const, id: 'p1', tool: 'Bash', title: 'Run a command', detail: 'command: curl x' };

async function setup() {
  const harness = createHarness();
  const { workspace } = await harness.services.workspaces.create({ goal: 'x', repos: [{ name: 'api', base: 'main' }] });
  const session = harness.backend.last();
  const agent = workspace.agents[0]!.id;
  const state = () => harness.services.workspaces.state(workspace.id);
  const status = async () => (await state()).workspace.agents[0]!.status;
  return { harness, ws: workspace.id, session, agent, state, status };
}

describe('permission requests', () => {
  it('sets the agent to Needs input and stores a row a reload can show', async () => {
    const { session, status, state, harness } = await setup();
    session.emit(call);
    await settle();
    expect(await status()).toBe('input');
    expect((await state()).workspace.permissions).toMatchObject([{ id: 'p1', tool: 'Bash', status: 'pending', title: 'Run a command' }]);
    expect(harness.seen.find((e) => e.type === 'permission.changed')).toMatchObject({ request: { id: 'p1', status: 'pending' } });
  });

  it.each([
    ['allow', 'allowed'],
    ['deny', 'denied'],
  ] as const)('%s resumes the turn', async (decision, outcome) => {
    const { harness, ws, agent, session, status, state } = await setup();
    session.emit(call);
    await settle();
    await harness.services.agents.answerPermission(ws, agent, 'p1', decision);
    expect(session.answers).toEqual([{ id: 'p1', decision }]);
    expect(await status()).toBe('running');
    expect((await state()).workspace.permissions[0]!.status).toBe(outcome);
  });

  it('stays in Needs input until the last of several is answered', async () => {
    const { harness, ws, agent, session, status } = await setup();
    session.emit(call);
    session.emit({ ...call, id: 'p2' });
    await settle();
    await harness.services.agents.answerPermission(ws, agent, 'p1', 'allow');
    expect(await status()).toBe('input');
    await harness.services.agents.answerPermission(ws, agent, 'p2', 'deny');
    expect(await status()).toBe('running');
  });

  it('refuses an answer to nothing, or to the wrong agent', async () => {
    const { harness, ws, agent, session } = await setup();
    await expect(harness.services.agents.answerPermission(ws, agent, 'nope', 'allow')).rejects.toThrow(/Nothing is waiting/);
    session.emit(call);
    await settle();
    await expect(harness.services.agents.answerPermission(ws, 'other', 'p1', 'allow')).rejects.toThrow(/Nothing is waiting/);
    await harness.services.agents.answerPermission(ws, agent, 'p1', 'allow');
    await expect(harness.services.agents.answerPermission(ws, agent, 'p1', 'allow')).rejects.toThrow(/Nothing is waiting/);
  });

  it('refuses messages while it waits, and Stop still works', async () => {
    const { harness, ws, agent, session, status, state } = await setup();
    session.emit(call);
    await settle();
    await expect(harness.services.agents.send(ws, agent, 'hello')).rejects.toThrow(/working/);
    await harness.services.agents.stop(ws, agent);
    expect(session.interrupted).toBe(1);
    session.emit({ type: 'turn.ended', outcome: 'error', error: 'aborted' });
    await settle();
    expect(await status()).toBe('idle');
    expect((await state()).workspace.permissions[0]!.status).toBe('expired');
  });

  it('expires when the backend stops waiting', async () => {
    const { session, status, state } = await setup();
    session.emit(call);
    await settle();
    session.emit({ type: 'permission.cancelled', id: 'p1' });
    await settle();
    expect((await state()).workspace.permissions[0]!.status).toBe('expired');
    expect(await status()).toBe('running');
  });

  it('expires when the session dies, and the agent is free again', async () => {
    const { harness, ws, agent, session, status, state } = await setup();
    session.emit(call);
    await settle();
    session.end(new Error('gone'));
    await settle();
    expect(await status()).toBe('idle');
    expect((await state()).workspace.permissions[0]!.status).toBe('expired');
    await expect(harness.services.agents.send(ws, agent, 'carry on')).resolves.toBeUndefined();
  });

  it('after a restart an unanswerable request does not leave the agent in Needs input', async () => {
    const { harness, session, status, state } = await setup();
    session.emit(call);
    await settle();
    // What a new server sees: the files as they were, with no session alive.
    await harness.services.agents.recover();
    expect(await status()).toBe('idle');
    const after = await state();
    expect(after.workspace.permissions[0]!.status).toBe('expired');
    expect(after.steps.some((s) => s.kind === 'error' && /restarted/.test(s.text))).toBe(true);
  });

  it('recovering leaves an agent alone that asked through request_input', async () => {
    const { harness, ws, agent, session, status } = await setup();
    await harness.services.agents.requestInput(ws, agent, 'which one?');
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    expect(await status()).toBe('input');
    await harness.services.agents.recover();
    expect(await status()).toBe('input');
  });
});
