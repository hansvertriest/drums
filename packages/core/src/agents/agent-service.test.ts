import { describe, expect, it } from 'vitest';
import { createHarness, settle } from '../testing/harness.js';

const setup = async () => {
  const harness = createHarness();
  const state = await harness.services.workspaces.create('Scope checkout');
  const ws = state.workspace.id;
  const agent = state.workspace.agents[0]!.id;
  const status = async () => (await harness.store.getWorkspace(ws))!.agents[0]!;
  return { ...harness, ws, agent, status, session: harness.backend.last() };
};

describe('starting', () => {
  it('starts one Scoper on the goal, in the workspace folder, with its prompt and only its tools', async () => {
    const { session, status, ws } = await setup();
    expect(session.received).toEqual(['Scope checkout']);
    expect(session.options.cwd).toBe(`/workspaces/${ws}`);
    expect(session.options.prompt).toContain('# The artifact contract');
    expect(session.options.tools.map((t) => t.id)).toEqual([
      'post',
      'artifact_list',
      'artifact_read',
      'artifact_create',
      'artifact_update',
      'request_input',
    ]);
    expect((await status()).status).toBe('running');
    expect((await status()).role).toBe('scoper');
  });

  it('stores the session id when the backend reports it', async () => {
    const { session, status } = await setup();
    session.emit({ type: 'session', sessionId: 's-1' });
    await settle();
    expect((await status()).sessionId).toBe('s-1');
  });
});

describe('status', () => {
  it('goes to review when a turn ends normally', async () => {
    const { session, status } = await setup();
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    expect((await status()).status).toBe('review');
  });

  it('goes to input after request_input and stays there when the turn ends', async () => {
    const { session, status, services, ws } = await setup();
    await session.tool('request_input', { reason: 'Pick a provider' });
    expect((await status()).status).toBe('input');
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    expect((await status()).status).toBe('input');
    expect((await services.posts.list(ws)).at(-1)).toMatchObject({ kind: 'note', message: 'Pick a provider' });
  });

  it('asks again only for the turn it was requested in', async () => {
    const { session, status, services, ws, agent } = await setup();
    await session.tool('request_input', { reason: 'r' });
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    await services.agents.send(ws, agent, 'answer');
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    expect((await status()).status).toBe('review');
  });

  it('goes idle after Stop', async () => {
    const { session, status, services, ws, agent } = await setup();
    await services.agents.stop(ws, agent);
    expect(session.interrupted).toBe(1);
    session.emit({ type: 'turn.ended', outcome: 'error', error: 'interrupted' });
    await settle();
    expect((await status()).status).toBe('idle');
    expect((await services.workspaces.state(ws)).steps).toEqual([]);
  });

  it('shows a failed turn as an error step and goes idle', async () => {
    const { session, status, services, ws } = await setup();
    session.emit({ type: 'turn.ended', outcome: 'error', error: 'Not logged in' });
    await settle();
    expect((await status()).status).toBe('idle');
    expect((await services.workspaces.state(ws)).steps.at(-1)).toMatchObject({ kind: 'error', text: 'Not logged in' });
  });
});

describe('messages', () => {
  it('delivers a message and shows it in the thread', async () => {
    const { session, services, ws, agent } = await setup();
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    await services.agents.send(ws, agent, 'smaller please');
    expect(session.received.at(-1)).toBe('smaller please');
    expect((await services.posts.list(ws)).at(-1)).toMatchObject({ kind: 'message', text: 'smaller please' });
  });

  it('refuses a message while the agent runs, without a thread entry', async () => {
    const { services, ws, agent } = await setup();
    const before = (await services.posts.list(ws)).length;
    await expect(services.agents.send(ws, agent, 'hurry')).rejects.toThrow('is working');
    expect(await services.posts.list(ws)).toHaveLength(before);
  });

  it('resumes the stored session after the old one died', async () => {
    const { backend, session, services, ws, agent, status } = await setup();
    session.emit({ type: 'session', sessionId: 's-1' });
    session.emit({ type: 'turn.ended', outcome: 'success' });
    session.end();
    await settle();
    await services.agents.send(ws, agent, 'again');
    expect(backend.last()).not.toBe(session);
    expect(backend.last().resumedFrom).toBe('s-1');
    expect(backend.last().received).toEqual(['again']);
    expect((await status()).status).toBe('running');
  });

  it('goes idle with an error when the session dies mid-turn', async () => {
    const { session, services, ws, status } = await setup();
    session.end(new Error('process exited'));
    await settle();
    expect((await status()).status).toBe('idle');
    expect((await services.workspaces.state(ws)).steps.at(-1)).toMatchObject({ kind: 'error', text: 'process exited' });
  });
});

describe('steps', () => {
  it('stores tool steps and text and streams them', async () => {
    const { session, services, ws, seen } = await setup();
    session.emit({ type: 'step', tool: 'artifact_create', summary: 'Scope' });
    session.emit({ type: 'text', text: 'Thinking aloud' });
    await settle();
    const { steps } = await services.workspaces.state(ws);
    expect(steps.map((s) => s.kind)).toEqual(['tool', 'text']);
    expect(seen.filter((e) => e.type === 'agent.step')).toHaveLength(2);
  });
});

describe('recover', () => {
  it('marks agents left running by a restart as idle', async () => {
    const { services, status } = await setup();
    expect((await status()).status).toBe('running');
    await services.agents.recover();
    expect((await status()).status).toBe('idle');
  });
});
