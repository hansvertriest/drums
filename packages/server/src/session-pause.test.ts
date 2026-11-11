import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { RolePicker } from '@drums/core';
import { MapState, WorkspaceState } from '@drums/protocol';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { main, type RunningDrums } from './main.js';
import { fakeBackend } from './testing/fake-backend.js';
import { createTempRepo, runGit, tempDirs, writeFile } from './testing/temp-repo.js';

/** Pausing and restarting through real HTTP, real git and real dyffle. The model and `gh` are fake, and origin is a local bare repo. */
/** Well past what setting up a workspace takes on a busy machine: nothing may pause in between. */
const GRACE_MS = 500;
vi.setConfig({ testTimeout: 60_000 });
const dirs = tempDirs();
const fake = fakeBackend();
const pickCoder: RolePicker = { pick: async ({ goal, hasRepos }) => ({ picks: hasRepos ? [{ role: 'coder', instruction: goal }] : [] }) };
const PATH = process.env.PATH;
let parent: string;
let drums: RunningDrums;
let ghLog: string;

const start = () =>
  main({ port: 0, webRoot: join(parent, 'web'), home: join(parent, 'home'), workspacesRoot: join(parent, 'ws'), agentBackend: fake.backend, rolePicker: pickCoder, sessionGraceMs: GRACE_MS });

beforeAll(async () => {
  parent = dirs.make('drums-pause-');
  const repo = createTempRepo(parent, 'shop', { withOrigin: true });
  ghLog = join(parent, 'gh.log');
  const bin = join(parent, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncat >> "${ghLog}"\nif [ "$1 $2" = "pr create" ]; then echo "https://github.example/o/r/pull/7"; fi\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  process.env.PATH = `${bin}${delimiter}${PATH}`;
  mkdirSync(join(parent, 'home'));
  writeFileSync(join(parent, 'home', 'config.json'), JSON.stringify({ projects: [repo.path] }));
  mkdirSync(join(parent, 'web'));
  writeFileSync(join(parent, 'web', 'index.html'), '<title>drums</title>');
  drums = await start();
});

afterAll(async () => {
  await drums.stop();
  process.env.PATH = PATH;
  dirs.cleanup();
});

const get = (path: string, init?: RequestInit) => fetch(new URL(path, drums.url), init);
const post = (path: string, body: unknown) => get(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const mapOf = async (ws: string) => MapState.parse(await (await get(`/api/workspaces/${ws}/map`)).json());
type Session = (typeof fake.sessions)[number];
const tool = (session: Session, id: string, args: unknown) => session.options.tools.find((t) => t.id === id)!.call(args);

/** A running session announces itself in its worktree; a paused one has taken that back. */
const isRunning = (worktree: string) => existsSync(join(worktree, '.dyffle', 'server.json'));
const paused = (worktree: string) => vi.waitFor(() => expect(isRunning(worktree)).toBe(false), { timeout: 10_000, interval: 20 });
const pause = async (worktree: string, session: Session) => {
  session.emit({ type: 'turn.ended', outcome: 'success' });
  await paused(worktree);
};
const longerThanGrace = () => new Promise((resolve) => setTimeout(resolve, GRACE_MS * 2.5));
const CHANGED = 'export function add(a: number, b: number, c = 0): number {\n  return a + b + c;\n}\n\nexport function twice(a: number): number {\n  return add(a, a);\n}\n';

/** What the Coder does now instead of a checkpoint: commit. `impact` then brings dyffle up to date, as it does for an agent. */
async function commit(session: Session, worktree: string, message: string) {
  runGit(worktree, 'add', '-A');
  runGit(worktree, 'commit', '-qm', message);
  await tool(session, 'impact', {});
  return runGit(worktree, 'rev-parse', 'HEAD').trim();
}
const titles = async (url: string) => (await (await get(`${url}views.json`)).json()).views.map((v: { title: string }) => v.title);

async function create(goal: string) {
  const response = await post('/api/workspaces', { goal, repos: [{ name: 'shop', base: 'main' }] });
  expect(response.status).toBe(201);
  const state = WorkspaceState.parse(await response.json());
  const ws = state.workspace.id;
  return { ws, session: fake.sessions.at(-1)!, agent: state.workspace.agents[0]!.id, worktree: join(parent, 'ws', ws, 'shop') };
}

describe('pausing', () => {
  it('keeps a session while an agent runs, and pauses it after', async () => {
    const { session, worktree } = await create('Runs');
    await longerThanGrace();
    expect(isRunning(worktree)).toBe(true);
    await pause(worktree, session);
  });

  it('keeps a session while a page has the stream open, through a reload, and pauses it after', async () => {
    const { ws, session, worktree } = await create('Open page');
    const page = new AbortController();
    await get(`/api/workspaces/${ws}/stream`, { signal: page.signal });
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await longerThanGrace();
    expect(isRunning(worktree)).toBe(true);

    page.abort();
    const reloaded = new AbortController();
    await get(`/api/workspaces/${ws}/stream`, { signal: reloaded.signal });
    await longerThanGrace();
    expect(isRunning(worktree)).toBe(true);

    reloaded.abort();
    await paused(worktree);
  });

  it('counts the map frame as open, so its stream never hangs on a stopped session', async () => {
    const { ws, session, worktree } = await create('Frame');
    const frame = new AbortController();
    const viewer = (await mapOf(ws)).repos[0]!.viewer!;
    await get(`${viewer}events`, { signal: frame.signal });
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await longerThanGrace();
    expect(isRunning(worktree)).toBe(true);
    frame.abort();
    await paused(worktree);
  });

  it('makes no difference to the map, commits, comments or PRs', async () => {
    const { ws, session, agent, worktree } = await create('Paused work');
    writeFile(worktree, 'src/math.ts', CHANGED);
    const before = await commit(session, worktree, 'Before');
    await pause(worktree, session);

    // The strip's counts need no session, and don't start one.
    const list = await (await get('/api/workspaces')).json();
    expect(list.find((w: { id: string }) => w.id === ws)).toMatchObject({ additions: expect.any(Number) });
    expect(isRunning(worktree)).toBe(false);

    // The map.
    const state = (await mapOf(ws)).repos[0]!;
    expect(state.error).toBeUndefined();
    expect(state.additions).toBeGreaterThan(0);
    expect(isRunning(worktree)).toBe(true);
    const url = state.viewer!;
    expect(await titles(url)).toEqual(['Whole branch', 'Before', 'Uncommitted changes']);
    expect(await (await get(`${url}index.json`)).json()).toMatchObject({ nodes: expect.any(Array) });

    // Comments, made and read across a pause.
    const comment = { id: 'c1', path: 'src/math.ts', line: 2, side: 'RIGHT', body: 'Why c?', code: '  return a + b + c;' };
    expect((await get(`${url}review.json?key=commit-${before}`, { method: 'PUT', body: JSON.stringify({ body: '', comments: [comment], viewed: {} }) })).status).toBe(204);
    await paused(worktree);
    expect((await mapOf(ws)).repos[0]!.pendingComments).toBe(1);
    expect(await (await get(`${url}review.json?key=commit-${before}`)).json()).toMatchObject({ comments: [{ id: 'c1' }] });
    await paused(worktree);

    // Send, and a commit after the pause next to the one before it.
    expect((await post(`/api/workspaces/${ws}/send`, {})).status).toBe(200);
    expect(session.received.at(-1)).toContain('Why c?');
    writeFile(worktree, 'src/more.ts', 'export const more = 1;\n');
    await commit(session, worktree, 'After');
    expect(await titles(url)).toEqual(['Whole branch', 'Before', 'After', 'Uncommitted changes']);
    await pause(worktree, session);

    // A PR, with the branch's report in it.
    const opened = await post(`/api/workspaces/${ws}/prs`, { title: 'Paged', repos: [{ name: 'shop', body: 'Body' }] });
    expect(opened.status).toBe(201);
    expect(readFileSync(ghLog, 'utf8')).toContain('dyffle:start');
    expect(runGit(worktree, 'status', '--porcelain', '--', 'src').trim()).toBe('');
    expect(agent).toBeTruthy();
  });

  it('shows a failed resume, keeps the agent usable, and works again once it can', async () => {
    const { ws, session, agent, worktree } = await create('Failing');
    await pause(worktree, session);
    // A worktree git no longer knows: its link to the repo is gone.
    const link = join(worktree, '.git');
    const away = `${worktree}-git`;
    renameSync(link, away);
    try {
      expect((await mapOf(ws)).repos[0]!.error).toMatch(/could not start/);
      expect((await post(`/api/workspaces/${ws}/agents/${agent}/messages`, { text: 'go on' })).status).toBeLessThan(300);
      const result = await tool(session, 'impact', {});
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/could not start/);
    } finally {
      renameSync(away, link);
    }
    expect((await mapOf(ws)).repos[0]!.error).toBeUndefined();
    await pause(worktree, session);
  });
});

describe('the end-of-turn check on a real worktree', () => {
  it('takes real edits as uncommitted, reminds once, and takes a commit as none', async () => {
    const { ws, session, agent, worktree } = await create('Checks');
    writeFile(worktree, 'src/math.ts', CHANGED);
    const before = session.received.length;
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await vi.waitFor(() => expect(session.received.length).toBe(before + 1), { timeout: 10_000, interval: 20 });
    expect(session.received.at(-1)).toContain('You left changes uncommitted');

    // Ignored, it lets the turn end, and drums commits nothing itself.
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await vi.waitFor(async () => {
      const { workspace } = WorkspaceState.parse(await (await get(`/api/workspaces/${ws}`)).json());
      expect(workspace.agents[0]!.status).toBe('review');
    }, { timeout: 10_000, interval: 20 });
    expect(runGit(worktree, 'status', '--porcelain').trim()).not.toBe('');

    runGit(worktree, 'add', '-A');
    runGit(worktree, 'commit', '-m', 'mine');
    await post(`/api/workspaces/${ws}/agents/${agent}/messages`, { text: 'again' });
    const sent = session.received.length;
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await vi.waitFor(async () => {
      const { workspace } = WorkspaceState.parse(await (await get(`/api/workspaces/${ws}`)).json());
      expect(workspace.agents[0]!.status).toBe('review');
    }, { timeout: 10_000, interval: 20 });
    expect(session.received).toHaveLength(sent);

    expect(await (await get('/api/nudges')).json()).toMatchObject({ coder: { 'uncommitted-changes': expect.any(Number) } });
  });
});

describe('restart', () => {
  it('brings several agents, a code workspace and a waiting permission back, stopped gracefully or not', async () => {
    const { ws, session, worktree, agent } = await create('Restart me');
    session.emit({ type: 'session', sessionId: 's-coder' });
    writeFile(worktree, 'src/math.ts', CHANGED);
    await commit(session, worktree, 'Before');
    const added = await (await post(`/api/workspaces/${ws}/agents`, { instruction: 'Help' })).json();
    const second = fake.sessions.at(-1)!;
    second.emit({ type: 'session', sessionId: 's-second' });
    second.emit({ type: 'permission.requested', id: 'waiting', tool: 'Bash', title: 'Run', detail: 'x' });
    await vi.waitFor(async () => {
      const { workspace } = WorkspaceState.parse(await (await get(`/api/workspaces/${ws}`)).json());
      expect(workspace.agents.map((a) => a.status)).toEqual(['running', 'input']);
      expect(workspace.agents.map((a) => a.sessionId)).toEqual(['s-coder', 's-second']);
    }, { interval: 20 });

    await drums.stop();
    drums = await start();

    const state = WorkspaceState.parse(await (await get(`/api/workspaces/${ws}`)).json());
    expect(state.workspace.agents.map((a) => a.status)).toEqual(['idle', 'idle']);
    expect(state.workspace.permissions).toMatchObject([{ id: 'waiting', status: 'expired' }]);
    expect(state.steps.some((step) => step.kind === 'error' && step.text.includes('restarted'))).toBe(true);
    expect((await mapOf(ws)).repos[0]!.error).toBeUndefined();
    const url = (await mapOf(ws)).repos[0]!.viewer!;
    expect(await titles(url)).toEqual(['Whole branch', 'Before', 'Uncommitted changes']);

    // A row that can't be answered says so; either agent takes a message and goes on.
    expect((await post(`/api/workspaces/${ws}/agents/${added.id}/permissions/waiting`, { decision: 'allow' })).status).toBe(404);
    expect((await post(`/api/workspaces/${ws}/agents/${agent}/messages`, { text: 'back' })).status).toBeLessThan(300);
    expect((await post(`/api/workspaces/${ws}/agents/${added.id}/messages`, { text: 'back too' })).status).toBeLessThan(300);
    expect(fake.sessions.slice(-2).map((s) => s.received.at(-1))).toEqual(['back', 'back too']);
  });
});
