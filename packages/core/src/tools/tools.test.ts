import { describe, expect, it } from 'vitest';
import { createHarness } from '../testing/harness.js';

const setup = async () => {
  const harness = createHarness();
  const state = await harness.services.workspaces.create('Goal');
  const session = harness.backend.last();
  const call = async (id: string, args: unknown) => {
    const result = await session.tool(id, args);
    return { ...result, json: JSON.parse(result.text) as Record<string, unknown> };
  };
  return { ...harness, ws: state.workspace.id, agent: state.workspace.agents[0]!.id, call };
};

const create = { title: 'Scope', html: '<p>a</p>', note: 'first' };

describe('tools', () => {
  it('post attributes the note to the calling agent', async () => {
    const { call, services, ws, agent } = await setup();
    await call('post', { title: 'Hi', message: 'there' });
    expect((await services.posts.list(ws)).at(-1)).toMatchObject({ kind: 'note', agent, title: 'Hi' });
  });

  it('artifact_create, _list and _read round-trip', async () => {
    const { call, agent } = await setup();
    expect((await call('artifact_create', create)).json).toEqual({ id: 'a1', version: 1 });
    expect((await call('artifact_list', {})).json).toEqual([{ id: 'a1', title: 'Scope', kind: 'html', latest: 1, by: agent }]);
    expect((await call('artifact_read', { id: 'a1' })).json).toEqual({ html: '<p>a</p>', version: 1, by: agent, note: 'first' });
  });

  it('artifact_update posts a version, and returns a conflict with the latest', async () => {
    const { call } = await setup();
    await call('artifact_create', create);
    const update = { id: 'a1', base_version: 1, html: '<p>b</p>', note: 'second' };
    expect((await call('artifact_update', update)).json).toEqual({ version: 2 });
    const conflict = await call('artifact_update', update);
    expect(conflict.isError).toBe(true);
    expect(conflict.json).toMatchObject({ latest: { version: 2, html: '<p>b</p>' } });
  });

  it('refuses bad input with a message, not a crash', async () => {
    const { backend } = await setup();
    const result = await backend.last().tool('artifact_create', { title: 'x' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Invalid input');
  });

  it('turns a refused call into text the agent can act on', async () => {
    const { backend } = await setup();
    const result = await backend.last().tool('artifact_read', { id: 'a7' });
    expect(result).toEqual({ text: 'No artifact a7.', isError: true });
  });

  it('lets a tool bug through instead of hiding it as a refusal', async () => {
    const { backend, store } = await setup();
    store.listArtifacts = () => Promise.reject(new Error('disk on fire'));
    await expect(backend.last().tool('artifact_list', {})).rejects.toThrow('disk on fire');
  });
});
