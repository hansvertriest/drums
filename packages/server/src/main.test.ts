import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HealthResponse, MAX_MESSAGE_BODY_BYTES, VersionResponse, WorkspaceList, WorkspaceState } from '@drums/protocol';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { main, type RunningDrums } from './main.js';
import { fakeBackend } from './testing/fake-backend.js';
import { createKeywordRolePicker } from './testing/keyword-role-picker.js';

let dir: string;
let webRoot: string;
let drums: RunningDrums;
const fake = fakeBackend();

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'drums-main-'));
  webRoot = join(dir, 'web');
  mkdirSync(join(webRoot, 'assets'), { recursive: true });
  writeFileSync(join(webRoot, 'index.html'), '<title>drums</title>');
  writeFileSync(join(webRoot, 'assets', 'a.js'), 'export {};');
  writeFileSync(join(webRoot, 'manifest.webmanifest'), '{}');
  drums = await main({ port: 0, webRoot, home: join(dir, 'home'), workspacesRoot: join(dir, 'ws'), agentBackend: fake.backend, rolePicker: createKeywordRolePicker() });
});

afterAll(async () => {
  await drums.stop();
  rmSync(dir, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) => fetch(new URL(path, drums.url), init);
const send = (method: string, path: string, body: unknown) =>
  get(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

async function createWorkspace(goal = 'Scope checkout') {
  const response = await send('POST', '/api/workspaces', { goal });
  expect(response.status).toBe(201);
  const state = WorkspaceState.parse(await response.json());
  return { ws: state.workspace.id, agent: state.workspace.agents[0]!.id, session: fake.sessions.at(-1)! };
}

const tool = (session: (typeof fake.sessions)[number], id: string, args: unknown) =>
  session.options.tools.find((t) => t.id === id)!.call(args);

const answers = [{ name: 'q', label: 'Q', value: 'Stripe' }];

describe('main', () => {
  it('binds to loopback by default', () => {
    expect(new URL(drums.url).hostname).toBe('127.0.0.1');
  });

  it('serves the web manifest with its own content type, which Safari may need to install the app', async () => {
    const response = await get('/manifest.webmanifest');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/manifest+json');
  });

  it('serves the health route with the registries wired in', async () => {
    const response = await get('/api/health');
    expect(response.status).toBe(200);
    const body = HealthResponse.parse(await response.json());
    expect(body.roles).toEqual(['scoper', 'researcher', 'designer', 'coder', 'reviewer']);
    expect(body.artifactKinds).toEqual(['html', 'branch-map']);
    expect(body.tools).toContain('artifact_update');
  });

  it('answers unknown API paths with a 404, not the web app', async () => {
    expect((await get('/api/nope')).status).toBe(404);
  });

  it('serves the web app, its assets and falls back to index.html', async () => {
    expect(await (await get('/')).text()).toContain('drums');
    expect(await (await get('/assets/a.js')).text()).toContain('export');
    expect(await (await get('/some/page')).text()).toContain('drums');
  });

  it('forbids frames from navigating away, on the page that embeds them', async () => {
    expect((await get('/')).headers.get('content-security-policy')).toBe(`frame-src ${new URL(drums.url).origin}/map/`);
  });

  it('refuses a port that is taken', async () => {
    const { port } = new URL(drums.url);
    await expect(main({ port: Number(port), webRoot, home: join(dir, 'home'), workspacesRoot: join(dir, 'ws') })).rejects.toThrow('EADDRINUSE');
  });
});

describe('the API from request to agent and back', () => {
  beforeEach(() => settle());

  it('creates a workspace and starts a Scoper on the goal', async () => {
    const { ws, session } = await createWorkspace('Scope search');
    expect(session.received).toHaveLength(1);
    expect(session.received[0]?.endsWith('\n\nScope search')).toBe(true);
    const list = WorkspaceList.parse(await (await get('/api/workspaces')).json());
    expect(list.find((w) => w.id === ws)?.status).toBe('running');
  });

  it('runs the whole M1 loop: artifact, answer, Send, next version', async () => {
    const { ws, agent, session } = await createWorkspace();
    await tool(session, 'artifact_create', { title: 'Scope', html: '<select name="q"></select>', note: 'first' });
    await tool(session, 'request_input', { reason: 'Pick one' });
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();

    const state = WorkspaceState.parse(await (await get(`/api/workspaces/${ws}`)).json());
    expect(state.workspace.agents[0]?.status).toBe('input');
    expect(state.artifacts[0]?.renderer).toBe('html');

    const saved = await send('PUT', `/api/workspaces/${ws}/artifacts/a1/answers`, { version: 1, answers });
    expect(saved.status).toBe(200);
    const sent = await send('POST', `/api/workspaces/${ws}/send`, { overall: 'Small' });
    expect(await sent.json()).toEqual({ recipients: [agent] });
    expect(session.received.at(-1)).toContain('<answer name="q" label="Q">Stripe</answer>');
    expect(session.received.at(-1)).toContain('<overall>Small</overall>');

    await tool(session, 'artifact_update', { id: 'a1', base_version: 1, html: '<p class="chg">Stripe</p>', note: 'second' });
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();

    const v2 = VersionResponse.parse(await (await get(`/api/workspaces/${ws}/artifacts/a1/versions/2`)).json());
    expect(v2.content).toContain('Stripe');
    expect(v2.version.note).toBe('second');
    const v1 = VersionResponse.parse(await (await get(`/api/workspaces/${ws}/artifacts/a1/versions/1`)).json());
    expect(v1.answers).toEqual(answers);
  });

  it('refuses Send and messages while the agent runs', async () => {
    const { ws, agent, session } = await createWorkspace();
    await tool(session, 'artifact_create', { title: 'S', html: '<p>x</p>', note: 'n' });
    await send('PUT', `/api/workspaces/${ws}/artifacts/a1/answers`, { version: 1, answers });
    const sent = await send('POST', `/api/workspaces/${ws}/send`, {});
    expect(sent.status).toBe(409);
    expect(await sent.json()).toMatchObject({ error: expect.stringContaining('working') });
    expect((await send('POST', `/api/workspaces/${ws}/agents/${agent}/messages`, { text: 'hi' })).status).toBe(409);
  });

  it('refuses a message body over the limit by its length, without reading it', async () => {
    const { ws, agent } = await createWorkspace();
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const url = new URL(`/api/workspaces/${ws}/agents/${agent}/messages`, drums.url);
      const headers = { 'content-type': 'application/json', 'content-length': MAX_MESSAGE_BODY_BYTES + 1 };
      const req = request(url, { method: 'POST', headers }, (response) => {
        resolve(response.statusCode);
        response.resume();
        req.destroy();
      });
      req.on('error', reject);
      req.flushHeaders();
    });
    expect(status).toBe(413);
  });

  it('stops an agent', async () => {
    const { ws, agent } = await createWorkspace();
    expect((await get(`/api/workspaces/${ws}/agents/${agent}/stop`, { method: 'POST' })).status).toBe(204);
    await settle();
    const state = WorkspaceState.parse(await (await get(`/api/workspaces/${ws}`)).json());
    expect(state.workspace.agents[0]?.status).toBe('idle');
  });

  it('streams domain events for the workspace only', async () => {
    const { ws, session } = await createWorkspace();
    const other = await createWorkspace('Another');
    const abort = new AbortController();
    const response = await get(`/api/workspaces/${ws}/stream`, { signal: abort.signal });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (needle: string) => {
      while (!text.includes(needle)) text += decoder.decode((await reader.read()).value);
    };
    await readUntil('ready');
    await tool(other.session, 'post', { title: 'elsewhere', message: 'm' });
    await tool(session, 'post', { title: 'here', message: 'm' });
    await readUntil('here');
    abort.abort();
    expect(text).toContain('"post.created"');
    expect(text).not.toContain('elsewhere');
  });
});

describe('the API refuses', () => {
  it('bad bodies', async () => {
    expect((await send('POST', '/api/workspaces', { goal: '  ' })).status).toBe(400);
    expect((await send('POST', '/api/workspaces', {})).status).toBe(400);
    expect((await get('/api/workspaces', { method: 'POST', body: 'not json' })).status).toBe(400);
    expect((await send('POST', '/api/workspaces', { goal: 'x', agents: [] })).status).toBe(400);
    expect((await send('POST', '/api/workspaces', { goal: 'x', agents: [{ role: 'wizard', instruction: 'x' }] })).status).toBe(400);
    expect((await send('POST', '/api/workspaces', { goal: 'x', agents: [{ role: 'coder', instruction: 'x' }] })).status).toBe(400);
  });

  it('bad ids and unknown things', async () => {
    expect((await get('/api/workspaces/nope')).status).toBe(404);
    expect((await get('/api/workspaces/..%2F..%2Fetc')).status).toBe(400);
    const { ws } = await createWorkspace();
    expect((await get(`/api/workspaces/${ws}/artifacts/a9/versions/1`)).status).toBe(404);
    expect((await get(`/api/workspaces/${ws}/artifacts/a1/versions/x`)).status).toBe(400);
  });

  it('other origins and rebound hosts', async () => {
    const hostile = await get('/api/workspaces', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{"goal":"x"}' });
    expect(hostile.status).toBe(403);
    const sandboxed = await get('/api/workspaces', { headers: { origin: 'null' } });
    expect(sandboxed.status).toBe(403);
    const own = await get('/api/workspaces', { headers: { origin: drums.url.slice(0, -1) } });
    expect(own.status).toBe(200);
  });
});
