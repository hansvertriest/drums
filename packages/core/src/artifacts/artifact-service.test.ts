import { describe, expect, it } from 'vitest';
import { createHarness, settle } from '../testing/harness.js';

const setup = async () => {
  const harness = createHarness();
  const state = await harness.services.workspaces.create({ goal: 'Scope it' });
  return { ...harness, ws: state.workspace.id, agent: state.workspace.agents[0]!.id };
};

describe('ArtifactService', () => {
  it('creates version 1, posts it in the thread and announces it', async () => {
    const { services, seen, ws, agent } = await setup();
    const created = await services.artifacts.create(ws, agent, { title: 'Scope', content: '<p>a</p>', note: 'first' });
    expect(created).toEqual({ id: 'a1', version: 1 });
    expect((await services.posts.list(ws)).at(-1)).toMatchObject({ kind: 'version', artifact: 'a1', version: 1, message: 'first' });
    expect(seen.some((e) => e.type === 'artifact.version' && e.version === 1 && e.artifact.renderer === 'html')).toBe(true);
  });

  it('keeps old versions readable after an update', async () => {
    const { services, ws, agent } = await setup();
    await services.artifacts.create(ws, agent, { title: 'Scope', content: '<p>a</p>', note: 'first' });
    const result = await services.artifacts.update(ws, agent, { id: 'a1', baseVersion: 1, content: '<p>b</p>', note: 'second' });
    expect(result).toEqual({ status: 'ok', version: 2 });
    expect((await services.artifacts.read(ws, 'a1', 1)).content).toBe('<p>a</p>');
    expect((await services.artifacts.read(ws, 'a1')).content).toBe('<p>b</p>');
  });

  it('refuses a stale base version and returns the latest', async () => {
    const { services, ws, agent } = await setup();
    await services.artifacts.create(ws, agent, { title: 'Scope', content: '<p>a</p>', note: 'first' });
    await services.artifacts.update(ws, agent, { id: 'a1', baseVersion: 1, content: '<p>b</p>', note: 'second' });
    const result = await services.artifacts.update(ws, agent, { id: 'a1', baseVersion: 1, content: '<p>c</p>', note: 'late' });
    expect(result).toMatchObject({ status: 'conflict', latest: { version: 2, content: '<p>b</p>', note: 'second' } });
    expect((await services.artifacts.get(ws, 'a1')).versions).toHaveLength(2);
  });

  it('refuses whole documents and empty html', async () => {
    const { services, ws, agent } = await setup();
    const create = (content: string) => services.artifacts.create(ws, agent, { title: 't', content, note: 'n' });
    await expect(create('<!doctype html><html></html>')).rejects.toThrow('fragment');
    await expect(create('   ')).rejects.toThrow('empty');
    expect(await services.artifacts.list(ws)).toEqual([]);
    await settle();
  });

  it('archives and restores an artifact, and a new version brings it back', async () => {
    const { services, seen, ws, agent } = await setup();
    await services.artifacts.create(ws, agent, { title: 'Scope', content: '<p>a</p>', note: 'first' });
    expect(await services.artifacts.setArchived(ws, 'a1', true)).toMatchObject({ id: 'a1', archived: true });
    expect(seen.some((e) => e.type === 'artifact.archived' && e.artifact.archived)).toBe(true);
    expect((await services.artifacts.list(ws))[0]).toMatchObject({ archived: true });
    expect((await services.artifacts.setArchived(ws, 'a1', false)).archived).toBeUndefined();
    await services.artifacts.setArchived(ws, 'a1', true);
    await services.artifacts.update(ws, agent, { id: 'a1', baseVersion: 1, content: '<p>b</p>', note: 'second' });
    expect((await services.artifacts.get(ws, 'a1')).archived).toBeUndefined();
  });

  it('says so when an artifact or version does not exist', async () => {
    const { services, ws } = await setup();
    await expect(services.artifacts.read(ws, 'a9')).rejects.toThrow('No artifact a9');
  });
});
