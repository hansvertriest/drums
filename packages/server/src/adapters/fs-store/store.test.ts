import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '@drums/core';
import type { Workspace } from '@drums/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFsStore } from './store.js';

const at = '2026-01-01T00:00:00.000Z';
const workspace: Workspace = { id: 'w1', goal: 'Goal', createdAt: at, agents: [], repos: [], permissions: [], nudges: {} };

let root: string;
let store: Store;
const data = (...parts: string[]) => join(root, 'w1', '.drums', ...parts);
const allFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? allFiles(join(dir, e.name)) : [e.name]));

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'drums-store-'));
  store = createFsStore(root);
  await store.createWorkspace(workspace);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('workspaces', () => {
  it('writes workspace.json in the workspace folder and reads it back', async () => {
    expect(JSON.parse(readFileSync(data('workspace.json'), 'utf8'))).toEqual(workspace);
    expect(await store.getWorkspace('w1')).toEqual(workspace);
    expect(await store.listWorkspaces()).toEqual([workspace]);
    expect(store.workspacePath('w1')).toBe(join(root, 'w1'));
  });

  it('is empty when the root does not exist yet', async () => {
    expect(await createFsStore(join(root, 'nope')).listWorkspaces()).toEqual([]);
  });

  it('ignores folders that are not workspaces', async () => {
    mkdirSync(join(root, 'something-else'));
    writeFileSync(join(root, '.DS_Store'), '');
    expect((await store.listWorkspaces()).map((w) => w.id)).toEqual(['w1']);
  });

  it('keeps concurrent updates', async () => {
    const add = (id: string) => (w: Workspace): Workspace => ({ ...w, agents: [...w.agents, { id, role: 'scoper', name: 'S', status: 'idle' }] });
    await Promise.all(['a', 'b', 'c', 'd'].map((id) => store.updateWorkspace('w1', add(id))));
    expect((await store.getWorkspace('w1'))?.agents).toHaveLength(4);
  });

  it('keeps working after a failed update', async () => {
    await expect(store.updateWorkspace('w1', () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect((await store.updateWorkspace('w1', (w) => ({ ...w, goal: 'New' }))).goal).toBe('New');
  });

  it('refuses to create a workspace twice', async () => {
    await expect(store.createWorkspace(workspace)).rejects.toThrow('already exists');
  });

  it('refuses a corrupt file, naming it', async () => {
    writeFileSync(data('workspace.json'), '{"id":"w1"}');
    await expect(store.getWorkspace('w1')).rejects.toThrow('workspace.json is not valid');
  });

  it('refuses ids that would leave the root', async () => {
    await expect(store.getWorkspace('../../etc')).rejects.toThrow();
    expect(() => store.workspacePath('..')).toThrow();
  });

  it('leaves no temp files behind', async () => {
    await store.updateWorkspace('w1', (w) => ({ ...w, goal: 'x' }));
    await store.appendPost('w1', { kind: 'message', agent: 'a', at, text: 't' });
    expect(allFiles(join(root, 'w1')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('posts and steps', () => {
  it('stores one numbered file per post, in order', async () => {
    await store.appendPost('w1', { kind: 'message', agent: 'a', at, text: 'one' });
    const second = await store.appendPost('w1', { kind: 'note', agent: 'a', at, title: 't', message: 'two' });
    expect(second.seq).toBe(2);
    expect(existsSync(data('posts', '0002.json'))).toBe(true);
    expect((await store.listPosts('w1')).map((p) => p.seq)).toEqual([1, 2]);
  });

  it('gives racing appends different numbers', async () => {
    await Promise.all(Array.from({ length: 12 }, () => store.appendStep('w1', { kind: 'text', agent: 'a', at, text: 't' })));
    expect((await store.listSteps('w1')).map((s) => s.seq)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('keeps lists sorted past four digits', async () => {
    mkdirSync(data('steps'), { recursive: true });
    const entry = (seq: number) => JSON.stringify({ seq, kind: 'text', agent: 'a', at, text: 't' });
    writeFileSync(data('steps', '10000.json'), entry(10000));
    writeFileSync(data('steps', '0002.json'), entry(2));
    expect((await store.listSteps('w1')).map((s) => s.seq)).toEqual([2, 10000]);
  });
});

describe('artifacts', () => {
  const version = (n: number) => ({ version: n, by: 'a', note: `n${n}`, at });
  const meta = { title: 'T', kind: 'html', createdAt: at };

  it('lays versions out as v1.html and v1.json', async () => {
    const { id } = await store.createArtifact('w1', meta);
    expect(id).toBe('a1');
    expect(await store.addVersion('w1', id, version(1), '<p>one</p>')).toBe(true);
    expect(readFileSync(data('artifacts', 'a1', 'v1.html'), 'utf8')).toBe('<p>one</p>');
    expect(JSON.parse(readFileSync(data('artifacts', 'a1', 'v1.json'), 'utf8'))).toEqual(version(1));
    expect(JSON.parse(readFileSync(data('artifacts', 'a1', 'meta.json'), 'utf8'))).toMatchObject({ title: 'T', kind: 'html' });
    expect(await store.readVersion('w1', id, 1)).toBe('<p>one</p>');
  });

  it('never rewrites a version', async () => {
    const { id } = await store.createArtifact('w1', meta);
    await store.addVersion('w1', id, version(1), '<p>one</p>');
    const before = statSync(data('artifacts', 'a1', 'v1.html')).mtimeMs;
    expect(await store.addVersion('w1', id, { ...version(1), note: 'other' }, '<p>evil</p>')).toBe(false);
    expect(await store.readVersion('w1', id, 1)).toBe('<p>one</p>');
    expect((await store.listVersions('w1', id))[0]?.note).toBe('n1');
    expect(statSync(data('artifacts', 'a1', 'v1.html')).mtimeMs).toBe(before);
  });

  it('lets only one of two racing versions win, and keeps its content', async () => {
    const { id } = await store.createArtifact('w1', meta);
    const results = await Promise.all(['x', 'y', 'z'].map((c) => store.addVersion('w1', id, version(1), `<p>${c}</p>`)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = ['x', 'y', 'z'][results.indexOf(true)];
    expect(await store.readVersion('w1', id, 1)).toBe(`<p>${winner}</p>`);
  });

  it('replaces an unpublished html left by a crash', async () => {
    const { id } = await store.createArtifact('w1', meta);
    writeFileSync(data('artifacts', 'a1', 'v1.html'), 'half');
    expect(await store.readVersion('w1', id, 1)).toBeUndefined();
    expect(await store.addVersion('w1', id, version(1), '<p>one</p>')).toBe(true);
    expect(await store.readVersion('w1', id, 1)).toBe('<p>one</p>');
  });

  it('lists versions by number, past nine', async () => {
    const { id } = await store.createArtifact('w1', meta);
    for (const n of [1, 2, 10, 9]) await store.addVersion('w1', id, version(n), 'x');
    expect((await store.listVersions('w1', id)).map((v) => v.version)).toEqual([1, 2, 9, 10]);
  });

  it('gives artifacts different ids, in order', async () => {
    const created = await Promise.all([store.createArtifact('w1', meta), store.createArtifact('w1', meta)]);
    expect(created.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
    expect((await store.listArtifacts('w1')).map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('refuses an artifact id that would leave its folder', async () => {
    await expect(store.getArtifact('w1', '../secrets')).rejects.toThrow();
  });
});

describe('answers', () => {
  it('keeps them per version in answers/<id>-v<n>.json', async () => {
    const set = { artifact: 'a1', version: 3, answers: [{ name: 'n', label: 'L', value: 'v' }] };
    await store.saveAnswers('w1', set);
    expect(existsSync(data('answers', 'a1-v3.json'))).toBe(true);
    expect(await store.getAnswers('w1', 'a1', 3)).toEqual(set);
    expect(await store.getAnswers('w1', 'a1', 4)).toBeUndefined();
  });
});
