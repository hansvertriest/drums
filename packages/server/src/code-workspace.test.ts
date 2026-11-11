import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import type { RolePicker } from '@drums/core';
import { MapState, ProjectList, WorkspaceList, WorkspaceState } from '@drums/protocol';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { main, type RunningDrums } from './main.js';
import { fakeBackend } from './testing/fake-backend.js';
import { createTempRepo, runGit, tempDirs, writeFile } from './testing/temp-repo.js';

/** A code workspace through the real HTTP layer, real git and real dyffle. The model is fake. */
const dirs = tempDirs();
const pickCoder: RolePicker = { pick: async ({ goal, hasRepos }) => ({ picks: hasRepos ? [{ role: 'coder', instruction: goal }] : [] }) };
const fake = fakeBackend();
const LISTED_NAME = 'box.example';
const LISTED = `${LISTED_NAME}:8445`;
let parent: string;
let drums: RunningDrums;
let repo: { path: string };

beforeAll(async () => {
  parent = dirs.make('drums-code-');
  repo = createTempRepo(parent, 'shop');
  createTempRepo(parent, 'other');
  process.env.DRUMS_ALLOWED_HOSTS = LISTED_NAME;
  mkdirSync(join(parent, 'home'));
  writeFileSync(join(parent, 'home', 'config.json'), JSON.stringify({ projects: [repo.path, join(parent, 'other'), join(parent, 'not-a-repo')] }));
  mkdirSync(join(parent, 'web'));
  writeFileSync(join(parent, 'web', 'index.html'), '<title>drums</title>');
  drums = await main({ port: 0, webRoot: join(parent, 'web'), home: join(parent, 'home'), workspacesRoot: join(parent, 'ws'), agentBackend: fake.backend, rolePicker: pickCoder });
});

afterAll(async () => {
  await drums.stop();
  delete process.env.DRUMS_ALLOWED_HOSTS;
  dirs.cleanup();
});

/** Real git and a real dyffle session per workspace, all ticking in this one process: on a busy machine a test takes far past the default 5 s. */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const get = (path: string, init?: RequestInit) => fetch(new URL(path, drums.url), init);
const post = (path: string, body: unknown) => get(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function create(goal: string, repos = [{ name: 'shop', base: 'main' }], branch?: string) {
  const response = await post('/api/workspaces', { goal, repos, ...(branch ? { branch } : {}) });
  expect(response.status).toBe(201);
  const state = WorkspaceState.parse(await response.json());
  return { state, ws: state.workspace.id, session: fake.sessions.at(-1)!, worktree: join(parent, 'ws', state.workspace.id, 'shop') };
}

type Session = (typeof fake.sessions)[number];
/** Waits on what the test is about, not on a fixed time: the end of a turn runs git, which takes as long as it takes. */
async function until(check: () => Promise<boolean>, what: string) {
  for (const deadline = Date.now() + 20_000; Date.now() < deadline; await new Promise((resolve) => setTimeout(resolve, 10))) {
    if (await check()) return;
  }
  throw new Error(`Timed out waiting for ${what}.`);
}
const statuses = async (ws: string) => WorkspaceState.parse(await (await get(`/api/workspaces/${ws}`)).json()).workspace.agents.map((agent) => agent.status);
/** The agent's turn is over and it can take a message: the claim goes before the status changes. */
const turnOver = (ws: string) => until(async () => (await statuses(ws)).every((status) => status !== 'running'), 'the turn to end');
const waitingOnUser = (ws: string) => until(async () => (await statuses(ws)).includes('input'), 'the permission request');

const tool = (session: Session, id: string, args: unknown) => session.options.tools.find((t) => t.id === id)!.call(args);
/** What the Coder does now instead of a checkpoint: commit. `impact` then brings dyffle up to date, as it does for an agent. */
async function commit(session: Session, worktree: string, message: string) {
  runGit(worktree, 'add', '-A');
  runGit(worktree, 'commit', '-qm', message);
  await tool(session, 'impact', {});
  return runGit(worktree, 'rev-parse', 'HEAD').trim();
}
/** `fetch` won't send another `Host`. */
const statusWithHost = (path: string, host: string) =>
  new Promise<number | undefined>((resolve, reject) => {
    const { hostname, port } = new URL(drums.url);
    request({ hostname, port, path, headers: { host } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    })
      .on('error', reject)
      .end();
  });
/** The status, the headers and the first bytes of an answer: enough for a stream that doesn't end. */
const raw = (path: string, headers: Record<string, string>) =>
  new Promise<{ status: number | undefined; csp: string | undefined; type: string | undefined; first: string }>((resolve, reject) => {
    const { hostname, port } = new URL(drums.url);
    const sent = request({ hostname, port, path, headers }, (response) => {
      const done = (first: string) => {
        resolve({ status: response.statusCode, csp: response.headers['content-security-policy'] as string | undefined, type: response.headers['content-type'], first });
        sent.destroy();
      };
      response.once('data', (chunk: Buffer) => done(chunk.toString()));
      response.once('end', () => done(''));
    });
    sent.on('error', reject).end();
  });
const mapOf = async (ws: string) => MapState.parse(await (await get(`/api/workspaces/${ws}/map`)).json());
const viewer = async (ws: string, repoName = 'shop') => (await mapOf(ws)).repos.find((r) => r.name === repoName)!.viewer!;
const CHANGED = 'export function add(a: number, b: number, c = 0): number {\n  return a + b + c;\n}\n\nexport function twice(a: number): number {\n  return add(a, a);\n}\n';

describe('projects', () => {
  it('lists repos by name, with no paths, leaving out what is no repo', async () => {
    const body = ProjectList.parse(await (await get('/api/projects')).json());
    expect(body.map((p) => p.name)).toEqual(['shop', 'other']);
    expect(body[0]).toEqual({ name: 'shop', branches: ['main'], base: 'main' });
    expect(JSON.stringify(body)).not.toContain(parent);
  });
});

describe('creating', () => {
  it('makes a worktree on a new branch in the workspace folder, with a Coder in that folder', async () => {
    const { state, worktree, session, ws } = await create('Add paging');
    expect(runGit(worktree, 'branch', '--show-current').trim()).toBe(`drums/${ws}`);
    expect(state.workspace.agents[0]!.role).toBe('coder');
    expect(session.options.cwd).toBe(join(parent, 'ws', ws));
    expect(session.options.access).toBe('shell-and-files');
    expect(session.received[0]).toContain(`shop/, from main`);
    expect(existsSync(join(worktree, '.dyffle', 'server.json'))).toBe(true);
  });

  it('refuses a branch that is already checked out, leaving nothing behind', async () => {
    const before = WorkspaceList.parse(await (await get('/api/workspaces')).json()).length;
    const response = await post('/api/workspaces', { goal: 'Clash', repos: [{ name: 'shop', base: 'main' }], branch: 'main' });
    expect(response.status).toBe(409);
    expect(WorkspaceList.parse(await (await get('/api/workspaces')).json())).toHaveLength(before);
  });

  it('rejects a branch that could be taken for an option', async () => {
    expect((await post('/api/workspaces', { goal: 'x', repos: [{ name: 'shop', base: 'main' }], branch: '--force' })).status).toBe(400);
    expect((await post('/api/workspaces', { goal: 'x', repos: [{ name: '../x', base: 'main' }] })).status).toBe(400);
  });
});

describe('behind a proxy on a listed host', () => {
  const https = { 'x-forwarded-proto': 'https' };

  it('answers the API with an https origin, and only its own', async () => {
    expect((await raw('/api/workspaces', { host: LISTED, origin: `https://${LISTED}` })).status).toBe(200);
    expect((await raw('/api/workspaces', { host: LISTED, origin: `http://${LISTED}` })).status).toBe(200);
    expect((await raw('/api/workspaces', { host: LISTED, origin: 'https://evil.example' })).status).toBe(403);
    expect((await raw('/api/workspaces', { host: LISTED, origin: `https://${LISTED_NAME}` })).status).toBe(403);
    expect((await raw('/api/workspaces', { host: LISTED, origin: 'null' })).status).toBe(403);
  });

  it('still refuses a host that is not listed', async () => {
    expect((await raw('/api/workspaces', { host: 'evil.example:8445', origin: 'https://evil.example:8445' })).status).toBe(403);
    expect((await raw('/', { host: 'evil.example', ...https })).csp).toBe("frame-src 'none'");
  });

  it('keeps loopback to http, whatever the header says', async () => {
    const { host } = new URL(drums.url);
    expect((await raw('/api/workspaces', { host, origin: `https://${host}`, ...https })).status).toBe(403);
    expect((await raw('/api/workspaces', { host, origin: `http://${host}`, ...https })).status).toBe(200);
    expect((await raw('/', { host, ...https })).csp).toBe(`frame-src http://${host}/map/`);
  });

  it('lets the map frames load over https only if the proxy says so', async () => {
    expect((await raw('/', { host: LISTED, ...https })).csp).toBe(`frame-src https://${LISTED}/map/`);
    expect((await raw('/', { host: LISTED })).csp).toBe(`frame-src http://${LISTED}/map/`);
  });

  it('serves the viewer with a policy in https, and believes no header on other hosts', async () => {
    const { ws } = await create('Viewer behind a proxy');
    const url = await viewer(ws);
    const { csp, status } = await raw(url, { host: LISTED, ...https });
    expect(status).toBe(200);
    expect(csp).toContain(`connect-src https://${LISTED}${url}`);
    expect(csp).toContain(`frame-ancestors https://${LISTED}`);
    const { host } = new URL(drums.url);
    expect((await raw(url, { host, ...https })).csp).toContain(`frame-ancestors http://${host}`);
    expect((await raw(url, { host: 'evil.example', ...https })).status).toBe(404);
  });

  it('streams events', async () => {
    const { ws } = await create('Stream behind a proxy');
    const { status, type, first } = await raw(`/api/workspaces/${ws}/stream`, { host: LISTED, ...https });
    expect(status).toBe(200);
    expect(type).toContain('text/event-stream');
    expect(first).toContain('event: ready');
  });
});

describe('the map frame', () => {
  it('serves the viewer with a policy that keeps it to its own map', async () => {
    const { ws } = await create('Viewer page');
    const url = await viewer(ws);
    const response = await get(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<script>');
    const csp = response.headers.get('content-security-policy')!;
    expect(csp).toContain('sandbox allow-scripts');
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain(`connect-src ${new URL(url, drums.url).href}`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`frame-ancestors ${new URL(drums.url).origin}`);
  });

  it('is nothing without the token, or on a foreign host', async () => {
    const { ws } = await create('Viewer token');
    const url = await viewer(ws);
    expect((await get(`/map/wrong/${ws}/shop/`)).status).toBe(404);
    expect(await statusWithHost(`${url}views.json`, 'evil.example')).toBe(404);
    expect(await statusWithHost(`${url}views.json`, new URL(drums.url).host)).toBe(200);
  });

  it('answers a page with no origin, and only that', async () => {
    const { ws } = await create('Viewer cors');
    const views = await get(`${await viewer(ws)}views.json`, { headers: { origin: 'null' } });
    expect(views.headers.get('access-control-allow-origin')).toBe('null');
  });

  it('keeps the rest of the API out of reach of a page with no origin', async () => {
    expect((await get('/api/workspaces', { headers: { origin: 'null' } })).status).toBe(403);
    expect((await post('/api/workspaces', {}).then(() => get('/api/projects', { headers: { origin: 'null' } }))).status).toBe(403);
  });

  it('serves what the viewer asks for, and stores its reviews', async () => {
    const { ws, session, worktree } = await create('Viewer data');
    const url = await viewer(ws);
    writeFile(worktree, 'src/math.ts', CHANGED);
    const sha = await commit(session, worktree, 'Add c');
    expect(await (await get(`${url}indexes.json`)).json()).toEqual(['Branch (live)', `${sha.slice(0, 7)} Add c`, 'Uncommitted']);
    expect(await (await get(`${url}index.json?i=1`)).json()).toMatchObject({ pr: { title: 'Add c' } });
    expect((await get(`${url}index.json?i=9`)).status).toBe(404);
    expect((await (await get(`${url}views.json`)).json()).views[1]).toMatchObject({ kind: 'commit', title: 'Add c', sha, key: `commit-${sha}` });
    expect(await (await get(`${url}source.json?key=commit-${sha}&path=src/math.ts`)).json()).toMatchObject({ path: 'src/math.ts' });
    expect((await get(`${url}source.json?key=commit-${sha}&path=../../etc/passwd`)).status).toBe(404);
    expect((await get(`${url}source.json?key=../x&path=a`)).status).toBe(400);
    expect((await get(`${url}source.json?key=post-1&path=src/math.ts`)).status).toBe(400);

    const preflight = await get(`${url}review.json?key=live`, { method: 'OPTIONS', headers: { origin: 'null', 'access-control-request-method': 'PUT' } });
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PUT');
    const save = await get(`${url}review.json?key=live&client=c`, {
      method: 'PUT',
      body: JSON.stringify({ body: '', comments: [{ id: 'c1', path: 'src/math.ts', line: 2, side: 'RIGHT', body: 'Why c?', code: '  return a + b + c;' }], viewed: { 'src/math.ts': 'h' } }),
    });
    expect(save.status).toBe(204);
    expect(await (await get(`${url}review.json?key=live`)).json()).toMatchObject({ viewed: { 'src/math.ts': 'h' } });
    expect((await get(`${url}review.json?key=live`, { method: 'PUT', body: '{"nope":1}' })).status).toBe(400);
    expect((await mapOf(ws)).repos[0]).toMatchObject({ pendingComments: 1, files: 1 });
  });

  it('streams changes as server-sent events', async () => {
    const { ws, session, worktree } = await create('Viewer events');
    const controller = new AbortController();
    const stream = await get(`${await viewer(ws)}events`, { signal: controller.signal });
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    writeFile(worktree, 'src/math.ts', CHANGED);
    await tool(session, 'impact', {});
    const reader = stream.body!.getReader();
    let text = '';
    while (!text.includes('event: views')) text += new TextDecoder().decode((await reader.read()).value);
    controller.abort();
    expect(text).toContain('event: views');
  });
});

describe('Send with code comments', () => {
  it('delivers the Markdown to the Coder once', async () => {
    const { ws, session, worktree } = await create('Comments');
    const url = await viewer(ws);
    writeFile(worktree, 'src/math.ts', CHANGED);
    const sha = await commit(session, worktree, 'T');
    session.emit({ type: 'turn.ended', outcome: 'success' });
    const comment = { id: 'c1', path: 'src/math.ts', line: 2, side: 'RIGHT', body: 'Why c?', code: '  return a + b + c;', symbol: 'src/math.ts#add' };
    await get(`${url}review.json?key=commit-${sha}`, { method: 'PUT', body: JSON.stringify({ body: '', comments: [comment], viewed: {} }) });
    await turnOver(ws);
    expect((await post(`/api/workspaces/${ws}/send`, {})).status).toBe(200);
    expect(session.received.at(-1)).toContain('<drums-feedback repo="shop">');
    expect(session.received.at(-1)).toContain(`## Commit ${sha.slice(0, 7)}: T`);
    expect(session.received.at(-1)).toContain('Why c?');
    expect((await mapOf(ws)).repos[0]!.pendingComments).toBe(0);
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await turnOver(ws);
    expect((await post(`/api/workspaces/${ws}/send`, {})).status).toBe(400);
  });
});

describe('permission route', () => {
  it('answers a request, and refuses a bad body', async () => {
    const { ws, session, state } = await create('Permissions');
    const agent = state.workspace.agents[0]!.id;
    session.emit({ type: 'permission.requested', id: 'p1', tool: 'Bash', title: 'Run', detail: 'command: x' });
    await waitingOnUser(ws);
    const reloaded = WorkspaceState.parse(await (await get(`/api/workspaces/${ws}`)).json());
    expect(reloaded.workspace.permissions[0]).toMatchObject({ id: 'p1', status: 'pending' });
    expect(reloaded.workspace.agents[0]!.status).toBe('input');
    expect((await post(`/api/workspaces/${ws}/agents/${agent}/permissions/p1`, { decision: 'maybe' })).status).toBe(400);
    expect((await post(`/api/workspaces/${ws}/agents/${agent}/permissions/p1`, { decision: 'allow' })).status).toBe(204);
    expect((await post(`/api/workspaces/${ws}/agents/${agent}/permissions/p1`, { decision: 'allow' })).status).toBe(404);
  });
});

describe('two workspaces on one repo', () => {
  it('do not interfere', async () => {
    const a = await create('First at once');
    const b = await create('Second at once');
    writeFile(a.worktree, 'src/a.ts', 'export const a = 1;\n');
    writeFile(b.worktree, 'src/b.ts', 'export const b = 1;\n');
    await Promise.all([commit(a.session, a.worktree, 'A'), commit(b.session, b.worktree, 'B')]);
    const [inA, inB] = await Promise.all([a, b].map(async ({ ws }) => (await (await get(`${await viewer(ws)}index.json?i=0`)).text())));
    expect(inA).toContain('src/a.ts');
    expect(inA).not.toContain('src/b.ts');
    expect(inB).toContain('src/b.ts');
    expect(inB).not.toContain('src/a.ts');
  });
});

describe('restart', () => {
  it('resumes sessions on demand, with what they had', async () => {
    const { ws, session, worktree } = await create('Survive restart');
    writeFile(worktree, 'src/math.ts', CHANGED);
    await commit(session, worktree, 'Before');
    session.emit({ type: 'permission.requested', id: 'gone', tool: 'Bash', title: 'Run', detail: 'x' });
    await waitingOnUser(ws);
    const again = await main({ port: 0, webRoot: join(parent, 'web'), home: join(parent, 'home'), workspacesRoot: join(parent, 'ws'), agentBackend: fake.backend, rolePicker: pickCoder });
    try {
      const base = new URL(again.url);
      const state = WorkspaceState.parse(await (await fetch(new URL(`/api/workspaces/${ws}`, base))).json());
      expect(state.workspace.permissions[0]).toMatchObject({ id: 'gone', status: 'expired' });
      expect(state.workspace.agents[0]!.status).toBe('idle');
      const map = MapState.parse(await (await fetch(new URL(`/api/workspaces/${ws}/map`, base))).json());
      const { views } = await (await fetch(new URL(`${map.repos[0]!.viewer}views.json`, base))).json();
      expect(views.map((v: { title: string }) => v.title)).toEqual(['Whole branch', 'Before', 'Uncommitted changes']);
    } finally {
      await again.stop();
    }
  });
});
