import { describe, expect, it } from 'vitest';
import { createHarness } from '../testing/harness.js';

const setup = async () => {
  const harness = createHarness();
  const state = await harness.services.workspaces.create({ goal: 'Goal' });
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
    const { call } = await setup();
    expect((await call('artifact_create', create)).json).toEqual({ id: 'a1', version: 1 });
    expect((await call('artifact_list', {})).json).toEqual([{ id: 'a1', title: 'Scope', kind: 'html', latest: 1, by: 'Scoper' }]);
    expect((await call('artifact_read', { id: 'a1' })).json).toEqual({ html: '<p>a</p>', version: 1, by: 'Scoper', note: 'first' });
  });

  it('artifact_update posts a version, and returns a conflict with the latest', async () => {
    const { call } = await setup();
    await call('artifact_create', create);
    const update = { id: 'a1', base_version: 1, html: '<p>b</p>', note: 'second' };
    expect((await call('artifact_update', update)).json).toEqual({ version: 2 });
    const conflict = await call('artifact_update', update);
    expect(conflict.isError).toBe(true);
    expect(conflict.json).toMatchObject({ latest: { version: 2, by: 'Scoper', html: '<p>b</p>' } });
    expect(conflict.json.conflict).toContain('base_version 2');
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

/** The Scoper and a Designer, as the model would use them. */
const withTwo = async () => {
  const context = await setup();
  context.picker.answer = async () => [{ role: 'designer', instruction: 'Draw' }];
  const designer = await context.services.agents.add(context.ws, 'Draw');
  const session = context.backend.last();
  const callDesigner = async (id: string, args: unknown) => {
    const result = await session.tool(id, args);
    return { ...result, json: JSON.parse(result.text) as Record<string, unknown> };
  };
  return { ...context, designer: designer.id, designerSession: session, callDesigner };
};

describe('feed', () => {
  it("shows other agents' notes and versions, named, and not your own or the user's", async () => {
    const { call, callDesigner } = await withTwo();
    await call('post', { title: 'From scoper', message: 'm' });
    await callDesigner('post', { title: 'From designer', message: 'm' });
    await call('artifact_create', create);

    const { posts } = (await callDesigner('feed', {})).json as { posts: Array<Record<string, unknown>> };
    expect(posts.map((p) => p.title)).toEqual(['From scoper', 'Scope']);
    expect(posts[0]).toMatchObject({ by: 'Scoper', role: 'scoper', message: 'm' });
    expect(posts[1]).toMatchObject({ by: 'Scoper', artifact: 'a1', version: 1, message: 'first' });
    expect(((await call('feed', {})).json as { posts: Array<{ title: string }> }).posts.map((p) => p.title)).toEqual(['From designer']);
  });

  it('gives only what is new after the cursor', async () => {
    const { call, callDesigner } = await withTwo();
    await call('post', { title: 'One', message: 'm' });
    const first = (await callDesigner('feed', {})).json as { cursor: number };
    expect((await callDesigner('feed', { since: first.cursor })).json).toEqual({ posts: [], cursor: first.cursor });
    await callDesigner('post', { title: 'Mine', message: 'm' });
    await call('post', { title: 'Two', message: 'm' });
    const next = (await callDesigner('feed', { since: first.cursor })).json as { posts: Array<{ title: string }>; cursor: number };
    expect(next.posts.map((p) => p.title)).toEqual(['Two']);
    expect(next.cursor).toBeGreaterThan(first.cursor);
  });

  it('refuses a bad cursor', async () => {
    const { designerSession } = await withTwo();
    expect(await designerSession.tool('feed', { since: -1 })).toMatchObject({ isError: true });
  });
});

describe('artifact_update between agents', () => {
  it('refuses the agent that based on an old version, and lets it merge and retry', async () => {
    const { call, callDesigner, services, ws } = await withTwo();
    await call('artifact_create', create);
    await callDesigner('artifact_update', { id: 'a1', base_version: 1, html: '<p>designer</p>', note: 'd' });

    const conflict = await call('artifact_update', { id: 'a1', base_version: 1, html: '<p>scoper</p>', note: 's' });
    expect(conflict.isError).toBe(true);
    expect(conflict.json).toMatchObject({ latest: { version: 2, by: 'Designer', html: '<p>designer</p>', note: 'd' } });
    expect((await services.artifacts.read(ws, 'a1')).content).toBe('<p>designer</p>');

    const merged = await call('artifact_update', { id: 'a1', base_version: 2, html: '<p>both</p>', note: 'merged' });
    expect(merged.json).toEqual({ version: 3 });
    expect((await services.artifacts.get(ws, 'a1')).versions.map((v) => v.note)).toEqual(['first', 'd', 'merged']);
  });
});

describe('simultaneous tool calls', () => {
  it('lets exactly one of several updates on one base win, and the rest see it', async () => {
    const { call, callDesigner, services, ws, seen } = await withTwo();
    await call('artifact_create', create);
    const update = (html: string) => ({ id: 'a1', base_version: 1, html, note: html });
    const results = await Promise.all([
      call('artifact_update', update('s1')),
      callDesigner('artifact_update', update('d1')),
      call('artifact_update', update('s2')),
      callDesigner('artifact_update', update('d2')),
    ]);
    expect(results.filter((r) => !r.isError)).toHaveLength(1);
    expect(results.filter((r) => r.isError)).toHaveLength(3);
    const artifact = await services.artifacts.get(ws, 'a1');
    expect(artifact.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(seen.filter((e) => e.type === 'artifact.version')).toHaveLength(2);
  });

  it('announces versions in order, each with all versions so far', async () => {
    const { call, callDesigner, seen } = await withTwo();
    await call('artifact_create', create);
    await Promise.all([
      call('artifact_update', { id: 'a1', base_version: 1, html: 's', note: 's' }),
      callDesigner('artifact_update', { id: 'a1', base_version: 2, html: 'd', note: 'd' }),
    ]);
    const announced = seen.flatMap((e) => (e.type === 'artifact.version' ? [[e.version, e.artifact.versions.length]] : []));
    for (const [version, known] of announced) expect(known).toBeGreaterThanOrEqual(version!);
    expect(announced.map(([version]) => version)).toEqual([...announced.map(([version]) => version)].sort());
  });

  it('gives simultaneous creates different ids, and hides none of them', async () => {
    const { call, callDesigner, services, ws } = await withTwo();
    const results = await Promise.all([
      call('artifact_create', create),
      callDesigner('artifact_create', create),
      call('artifact_create', create),
    ]);
    expect(results.map((r) => r.json.id).sort()).toEqual(['a1', 'a2', 'a3']);
    expect((await services.artifacts.list(ws)).map((a) => a.versions.length)).toEqual([1, 1, 1]);
  });

  it('puts simultaneous posts in one order: place in the feed, time and events agree', async () => {
    const { call, callDesigner, services, ws, seen } = await withTwo();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => (i % 2 ? call : callDesigner)('post', { title: `p${i}`, message: 'm' })),
    );
    const posts = await services.posts.list(ws);
    expect(posts.map((p) => p.seq)).toEqual(posts.map((_, i) => i + 1));
    expect(posts.map((p) => p.at)).toEqual([...posts.map((p) => p.at)].sort());
    const announced = seen.flatMap((e) => (e.type === 'post.created' ? [e.post.seq] : []));
    expect(announced).toEqual([...announced].sort((a, b) => a - b));
  });
});
