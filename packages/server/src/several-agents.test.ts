import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent, WorkspaceList, WorkspaceState } from '@drums/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main, type RunningDrums } from './main.js';
import { fakeBackend } from './testing/fake-backend.js';

/** Several agents through the real HTTP layer and the real file store; only the model is fake. */
let dir: string;
let drums: RunningDrums;
const fake = fakeBackend();

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'drums-several-'));
  mkdirSync(join(dir, 'web'));
  writeFileSync(join(dir, 'web', 'index.html'), '<title>drums</title>');
  drums = await main({ port: 0, webRoot: join(dir, 'web'), home: join(dir, 'home'), workspacesRoot: join(dir, 'ws'), agentBackend: fake.backend });
});

afterAll(async () => {
  await drums.stop();
  rmSync(dir, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) => fetch(new URL(path, drums.url), init);
const send = (method: string, path: string, body: unknown) =>
  get(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const until = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Never happened');
};

type Session = (typeof fake.sessions)[number];
const tool = (session: Session, id: string, args: unknown) => session.options.tools.find((t) => t.id === id)!.call(args);

const stateOf = async (ws: string) => WorkspaceState.parse(await (await get(`/api/workspaces/${ws}`)).json());
const statusesAre = (ws: string, status: Agent['status']) => async () =>
  (await stateOf(ws)).workspace.agents.every((agent) => agent.status === status);

async function workspaceWithTeam(goal: string, instructions: string[]) {
  const created = WorkspaceState.parse(await (await send('POST', '/api/workspaces', { goal })).json());
  const ws = created.workspace.id;
  const sessions = [fake.sessions.at(-1)!];
  const agents = [created.workspace.agents[0]!];
  for (const instruction of instructions) {
    const response = await send('POST', `/api/workspaces/${ws}/agents`, { instruction });
    expect(response.status).toBe(201);
    agents.push(Agent.parse(await response.json()));
    sessions.push(fake.sessions.at(-1)!);
  }
  return { ws, sessions, agents };
}

const endTurns = async (ws: string, sessions: Session[]) => {
  for (const session of sessions) session.emit({ type: 'turn.ended', outcome: 'success' });
  await until(statusesAre(ws, 'review'));
};

describe('Add agent', () => {
  it('picks the role from the instruction, with the Scoper as fallback', async () => {
    const { agents, sessions } = await workspaceWithTeam('Goal', ['Review the plan', 'Design the screen', 'xyzzy']);
    expect(agents.map((a) => a.role)).toEqual(['scoper', 'reviewer', 'designer', 'scoper']);
    expect(agents.map((a) => a.name)).toEqual(['Scoper', 'Reviewer', 'Designer', 'Scoper 2']);
    expect(sessions[1]?.received[0]).toContain('Scoper (scoper), running');
    expect(sessions[1]?.received[0]?.endsWith('Review the plan')).toBe(true);
  });

  it('refuses an empty instruction and an unknown workspace', async () => {
    const { ws } = await workspaceWithTeam('Goal', []);
    expect((await send('POST', `/api/workspaces/${ws}/agents`, { instruction: ' ' })).status).toBe(400);
    expect((await send('POST', '/api/workspaces/nope/agents', { instruction: 'x' })).status).toBe(404);
  });
});

describe('focus over HTTP', () => {
  it('sends the block in front of the text, and refuses a bad focus', async () => {
    const { ws, agents, sessions } = await workspaceWithTeam('Goal', []);
    await tool(sessions[0]!, 'artifact_create', { title: 'Scope', html: '<p>a</p>', note: 'n' });
    await endTurns(ws, sessions);
    const path = `/api/workspaces/${ws}/agents/${agents[0]!.id}/messages`;
    expect((await send('POST', path, { text: 'x', focus: { artifact: 'a1' } })).status).toBe(400);
    expect((await send('POST', path, { text: 'x', focus: { artifact: 'a9', version: 1 } })).status).toBe(404);
    expect((await send('POST', path, { text: 'review this', focus: { artifact: 'a1', version: 1 } })).status).toBe(202);
    expect(sessions[0]?.received.at(-1)).toMatch(/^<drums-focus>\n {2}artifact: a1 "Scope", viewing v1 \(latest, by Scoper\)\n<\/drums-focus>\nreview this$/);
    expect((await stateOf(ws)).posts.at(-1)).toMatchObject({ kind: 'message', text: 'review this', focus: { artifact: 'a1', version: 1 } });
  });
});

describe('Send over HTTP', () => {
  it('routes to the authors, and answers 409 naming the one that runs', async () => {
    const { ws, agents, sessions } = await workspaceWithTeam('Goal', ['Design the screen']);
    const [scoper, designer] = sessions as [Session, Session];
    await tool(scoper, 'artifact_create', { title: 'Scope', html: '<p>a</p>', note: 'n' });
    await tool(designer, 'artifact_create', { title: 'Design', html: '<p>b</p>', note: 'n' });
    await endTurns(ws, sessions);

    const answers = [{ name: 'q', label: 'Q', value: 'yes' }];
    await send('PUT', `/api/workspaces/${ws}/artifacts/a1/answers`, { version: 1, answers });
    await send('PUT', `/api/workspaces/${ws}/artifacts/a2/answers`, { version: 1, answers });

    await send('POST', `/api/workspaces/${ws}/agents/${agents[1]!.id}/messages`, { text: 'busy' });
    const before = scoper.received.length;
    const refused = await send('POST', `/api/workspaces/${ws}/send`, { overall: 'n' });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'Designer is working. Wait for it to finish, or stop it.' });
    expect(scoper.received).toHaveLength(before);

    await endTurns(ws, [designer]);
    const sent = await send('POST', `/api/workspaces/${ws}/send`, { overall: 'n' });
    expect(await sent.json()).toEqual({ recipients: agents.map((a) => a.id) });
    expect(scoper.received.at(-1)).toContain('artifact="a1"');
    expect(scoper.received.at(-1)).toContain('<overall>n</overall>');
    expect(designer.received.at(-1)).toContain('artifact="a2"');
    expect(designer.received.at(-1)).not.toContain('<overall>');
  });

  it('sends a lone note to the agent named, and refuses a stranger', async () => {
    const { ws, agents, sessions } = await workspaceWithTeam('Goal', ['Design the screen']);
    await endTurns(ws, sessions);
    expect((await send('POST', `/api/workspaces/${ws}/send`, { overall: 'n', to: 'stranger' })).status).toBe(404);
    expect(await (await send('POST', `/api/workspaces/${ws}/send`, { overall: 'n', to: agents[1]!.id })).json()).toEqual({ recipients: [agents[1]!.id] });
    expect(sessions[1]?.received.at(-1)).toContain('<overall>n</overall>');
  });
});

describe('simultaneous tool calls on the real file store', () => {
  it('allocates ids and places without loss or doubles, and only one update on a base wins', async () => {
    const { ws, sessions } = await workspaceWithTeam('Goal', ['Design the screen', 'Review the plan', 'Research the options']);
    const created = await Promise.all(
      sessions.flatMap((session, i) => [0, 1, 2].map((n) => tool(session, 'artifact_create', { title: `A${i}${n}`, html: '<p>x</p>', note: 'n' }))),
    );
    const ids = created.map((result) => (JSON.parse(result.text) as { id: string }).id);
    expect(new Set(ids).size).toBe(12);

    await Promise.all(sessions.flatMap((session, i) => Array.from({ length: 5 }, (_, n) => tool(session, 'post', { title: `p${i}${n}`, message: 'm' }))));

    const updates = await Promise.all(
      sessions.flatMap((session, i) =>
        [0, 1].map((n) => tool(session, 'artifact_update', { id: 'a1', base_version: 1, html: `<p>${i}${n}</p>`, note: `${i}${n}` })),
      ),
    );
    expect(updates.filter((result) => !result.isError)).toHaveLength(1);

    const state = await stateOf(ws);
    expect(state.artifacts).toHaveLength(12);
    expect(state.artifacts.find((a) => a.id === 'a1')?.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(state.posts.map((p) => p.seq)).toEqual(state.posts.map((_, i) => i + 1));
    expect(state.posts.map((p) => p.at)).toEqual([...state.posts.map((p) => p.at)].sort());
    expect(state.posts.filter((p) => p.kind === 'note')).toHaveLength(20);
    expect(state.posts.filter((p) => p.kind === 'version')).toHaveLength(13);
    expect(readdirSync(join(dir, 'ws', ws, '.drums', 'posts')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('keeps every agent in the workspace file when agents are added at once', async () => {
    const created = WorkspaceState.parse(await (await send('POST', '/api/workspaces', { goal: 'Goal' })).json());
    const ws = created.workspace.id;
    const added = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((x) => send('POST', `/api/workspaces/${ws}/agents`, { instruction: `Review ${x}` })));
    expect(added.every((response) => response.status === 201)).toBe(true);
    const { workspace } = await stateOf(ws);
    expect(workspace.agents.map((a) => a.name).sort()).toEqual(['Reviewer', 'Reviewer 2', 'Reviewer 3', 'Reviewer 4', 'Reviewer 5', 'Scoper']);
  });
});

describe('the strip', () => {
  it('hears over one workspace stream that another changed, with none of its content', async () => {
    const open = await workspaceWithTeam('Open', []);
    const other = await workspaceWithTeam('Other', []);
    const abort = new AbortController();
    const response = await get(`/api/workspaces/${open.ws}/stream`, { signal: abort.signal });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (needle: string) => {
      while (!text.includes(needle)) text += decoder.decode((await reader.read()).value);
    };
    await readUntil('ready');
    await tool(other.sessions[0]!, 'post', { title: 'elsewhere', message: 'm' });
    await readUntil('workspaces.changed');
    abort.abort();
    expect(text).not.toContain('elsewhere');
    expect(text).not.toContain(other.ws);

    const list = WorkspaceList.parse(await (await get('/api/workspaces')).json());
    expect(list.find((w) => w.id === other.ws)).toMatchObject({ status: 'running', lastRole: 'scoper' });
  });
});
