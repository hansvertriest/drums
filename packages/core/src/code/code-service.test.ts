import { describe, expect, it } from 'vitest';
import { createHarness, settle } from '../testing/harness.js';

const repos = [
  { name: 'api', base: 'main' },
  { name: 'web', base: 'dev' },
];

async function codeWorkspace(harness = createHarness(), requested = repos) {
  const state = await harness.services.workspaces.create({ goal: 'Add paging', repos: requested });
  return { harness, ws: state.workspace.id, agent: state.workspace.agents[0]!.id, state };
}

describe('attaching repos', () => {
  it('adds a worktree per repo on one branch, then opens a session per worktree with its base', async () => {
    const { harness, ws, state } = await codeWorkspace();
    const { worktrees, sessions } = harness.code.state;
    expect(worktrees.map((w) => [w.repo, w.path, w.branch, w.base])).toEqual([
      ['/repos/api', `/workspaces/${ws}/api`, `drums/${ws}`, 'main'],
      ['/repos/web', `/workspaces/${ws}/web`, `drums/${ws}`, 'dev'],
    ]);
    expect(sessions.map((s) => [s.request.worktree, s.request.baseRef])).toEqual([
      [`/workspaces/${ws}/api`, 'main'],
      [`/workspaces/${ws}/web`, 'dev'],
    ]);
    expect(state.workspace.branch).toBe(`drums/${ws}`);
    expect(sessions[0]!.request.viewerUrl).toBe(`http://drums/map/${ws}/api/`);
  });

  it('starts a role that needs a repo, chosen by data, and shows the map before any checkpoint', async () => {
    const { state, harness } = await codeWorkspace();
    expect(state.workspace.agents.map((a) => a.role)).toEqual(['coder']);
    expect(harness.backend.last().options.access).toBe('shell-and-files');
    expect(state.artifacts.map((a) => [a.kind, a.versions.length])).toEqual([['branch-map', 0]]);
  });

  it('uses the branch it is given', async () => {
    const harness = createHarness();
    const { workspace } = await harness.services.workspaces.create({ goal: 'x', repos: repos.slice(0, 1), branch: 'hans/x' });
    expect(workspace.branch).toBe('hans/x');
  });

  it('removes what it added when a later repo fails, and leaves no workspace', async () => {
    const harness = createHarness();
    harness.code.state.failAdd = 'web';
    await expect(harness.services.workspaces.create({ goal: 'x', repos })).rejects.toThrow(/cannot add web/);
    expect(harness.code.state.removed).toHaveLength(1);
    expect(harness.code.state.removed[0]).toMatch(/\/api$/);
    expect(harness.code.state.installs).toEqual([]);
    expect(harness.code.state.sessions).toHaveLength(0);
    expect(await harness.services.workspaces.list()).toEqual([]);
  });

  it('installs dependencies before anything can open a session', async () => {
    const harness = createHarness();
    const { install } = harness.code.dependencies;
    const during: Array<{ sessions: number; listed: number }> = [];
    harness.code.dependencies.install = async (worktree) => {
      during.push({ sessions: harness.code.state.sessions.length, listed: (await harness.services.workspaces.list()).length });
      await install(worktree);
    };
    const { ws } = await codeWorkspace(harness);
    expect(during).toEqual([
      { sessions: 0, listed: 0 },
      { sessions: 0, listed: 0 },
    ]);
    expect(harness.code.state.installs).toEqual([`/workspaces/${ws}/api`, `/workspaces/${ws}/web`]);
    expect(harness.code.state.sessions).toHaveLength(2);
  });

  it('opens the session anyway when an install fails, and says so naming the repo', async () => {
    const harness = createHarness();
    harness.code.state.failInstall = 'web';
    const { ws, state } = await codeWorkspace(harness);
    expect(harness.code.state.sessions.map((s) => s.request.worktree)).toEqual([`/workspaces/${ws}/api`, `/workspaces/${ws}/web`]);
    expect(harness.code.state.removed).toEqual([]);
    expect(state.workspace.agents).toHaveLength(1);
    expect(state.steps.filter((s) => s.kind === 'error')).toMatchObject([{ agent: state.workspace.agents[0]!.id, text: 'Could not install the dependencies of web: npm is not installed' }]);
    expect(harness.seen).toContainEqual({ type: 'agent.step', workspace: ws, step: expect.objectContaining({ kind: 'error' }) });
  });

  it('refuses a repo that is not a project, and the same repo twice', async () => {
    const { services } = createHarness();
    await expect(services.workspaces.create({ goal: 'x', repos: [{ name: 'nope', base: 'main' }] })).rejects.toThrow(/no project/);
    await expect(services.workspaces.create({ goal: 'x', repos: [repos[0]!, repos[0]!] })).rejects.toThrow(/once/);
  });

  it('survives a session that cannot start, and tries again on demand', async () => {
    const harness = createHarness();
    harness.code.state.failOpen = 'web';
    const { ws } = await codeWorkspace(harness);
    const failing = await harness.services.code.mapState(ws);
    expect(failing.repos.find((r) => r.name === 'web')?.error).toMatch(/could not start: missing object/);
    harness.code.state.failOpen = undefined;
    const healed = await harness.services.code.mapState(ws);
    expect(healed.repos.find((r) => r.name === 'web')?.error).toBeUndefined();
  });

  it('lists projects with their branches, offering main first', async () => {
    const { services } = createHarness();
    expect(await services.code.projects()).toEqual([
      { name: 'api', branches: ['dev', 'main'], base: 'main' },
      { name: 'web', branches: ['dev', 'main'], base: 'main' },
    ]);
  });
});

describe('sessions', () => {
  it('forwards session events as domain events', async () => {
    const { harness, ws } = await codeWorkspace();
    harness.code.state.sessions[1]!.emit('feed');
    expect(harness.seen).toContainEqual({ type: 'map.changed', workspace: ws, repo: 'web', aspect: 'feed' });
  });

  it('resumes a stopped session with a new one on the next request', async () => {
    const { harness, ws } = await codeWorkspace();
    const { sessions } = harness.code.state;
    await harness.services.close();
    expect(sessions.every((s) => s.stopped)).toBe(true);
    await harness.services.code.mapSource(ws, 'api');
    expect(sessions).toHaveLength(3);
    expect(sessions[2]!.request.worktree).toBe(sessions[0]!.request.worktree);
  });

  it('opens one session for requests at the same time', async () => {
    const { harness, ws } = await codeWorkspace();
    await harness.services.close();
    await Promise.all([harness.services.code.mapSource(ws, 'api'), harness.services.code.mapSource(ws, 'api')]);
    expect(harness.code.state.sessions).toHaveLength(3);
  });
});

describe('checkpoint through its tool', () => {
  it('posts to each repo and makes one version of the branch map, attributed', async () => {
    const { harness, ws } = await codeWorkspace();
    const result = await harness.backend.last().tool('checkpoint', { title: 'Paging', message: 'Adds `list`' });
    expect(JSON.parse(result.text)).toMatchObject({ version: 1, repos: [{ name: 'api' }, { name: 'web' }] });
    expect(harness.code.state.sessions.map((s) => s.posts)).toEqual([
      [{ title: 'Paging', message: 'Adds `list`', author: 'Coder' }],
      [{ title: 'Paging', message: 'Adds `list`', author: 'Coder' }],
    ]);
    const { posts, artifacts } = await harness.services.workspaces.state(ws);
    const post = posts.find((p) => p.kind === 'checkpoint');
    expect(post).toMatchObject({ title: 'Paging', version: 1, artifact: artifacts[0]!.id });
    expect(artifacts[0]!.versions.map((v) => v.note)).toEqual(['Paging']);
    const content = await harness.services.artifacts.read(ws, artifacts[0]!.id);
    expect(JSON.parse(content.content).repos[0]).toMatchObject({ name: 'api', post: 1 });
  });

  it('makes no version when nothing changed', async () => {
    const { harness, ws } = await codeWorkspace();
    harness.code.state.change = { post: 1 };
    const result = await harness.backend.last().tool('checkpoint', { title: 'Nothing', message: 'x' });
    expect(JSON.parse(result.text).note).toMatch(/Nothing changed/);
    const { artifacts, posts } = await harness.services.workspaces.state(ws);
    expect(artifacts[0]!.versions).toEqual([]);
    expect(posts.some((p) => p.kind === 'checkpoint')).toBe(false);
  });

  it('only lists the repos that changed in the version', async () => {
    const { harness, ws } = await codeWorkspace();
    const [api] = harness.code.state.sessions;
    const original = api!.checkpoint;
    api!.checkpoint = async (input) => ({ post: (await original(input)).post });
    const result = JSON.parse((await harness.backend.last().tool('checkpoint', { title: 'T', message: 'm' })).text);
    expect(result.repos.map((r: { name: string }) => r.name)).toEqual(['web']);
    const post = (await harness.services.workspaces.state(ws)).posts.find((p) => p.kind === 'checkpoint');
    expect(post).toMatchObject({ repos: [{ name: 'web' }] });
  });

  it('says which repo failed and keeps the rest', async () => {
    const { harness } = await codeWorkspace();
    harness.code.state.sessions[0]!.checkpoint = async () => {
      throw new Error('git broke');
    };
    const result = JSON.parse((await harness.backend.last().tool('checkpoint', { title: 'T', message: 'm' })).text);
    expect(result.version).toBe(1);
    expect(result.failed).toEqual([{ repo: 'api', error: 'git broke' }]);
  });

  it('refuses in a workspace with no repos, in words the agent can use', async () => {
    const harness = createHarness();
    const { workspace } = await harness.services.workspaces.create({ goal: 'scope it' });
    const refused = await harness.services.code.checkpoint(workspace.id, workspace.agents[0]!.id, { title: 'T', message: 'm' }).catch((e: Error) => e.message);
    expect(refused).toMatch(/no repos/);
  });

  it('can not be written to with artifact_update', async () => {
    const { harness, state } = await codeWorkspace();
    const result = await harness.backend.last().tool('artifact_update', { id: state.artifacts[0]!.id, base_version: 1, html: '{"repos":[]}', note: 'x' });
    expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/checkpoint/) });
  });

  it('shows in feed for the other agents', async () => {
    const { harness, ws } = await codeWorkspace();
    await harness.backend.last().tool('checkpoint', { title: 'Paging', message: 'm' });
    await settle();
    const other = await harness.services.agents.start(ws, 'reviewer', 'review');
    const feed = JSON.parse((await harness.backend.last().tool('feed', {})).text);
    expect(feed.posts.map((p: { title: string }) => p.title)).toContain('Paging');
    expect(other.role).toBe('reviewer');
  });
});

describe('impact through its tool', () => {
  it('passes Markdown on, with the repo as a heading if there are several', async () => {
    const { harness } = await codeWorkspace();
    expect((await harness.backend.last().tool('impact', {})).text).toBe('# api\n\n## impact\n\n# web\n\n## impact');
  });

  it('is plain with one repo', async () => {
    const { harness } = await codeWorkspace(createHarness(), repos.slice(0, 1));
    expect((await harness.backend.last().tool('impact', { target: 'list' })).text).toBe('## impact');
  });

  it('turns an unknown target into a helpful error, not a throw', async () => {
    const { harness } = await codeWorkspace();
    harness.code.state.impact = { status: 'not-found', message: 'Nothing matches "nope".' };
    const result = await harness.backend.last().tool('impact', { target: 'nope' });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Nothing matches "nope"/);
    expect(result.text).toMatch(/Class\.method/);
  });

  it('also finds a path given with its repo folder', async () => {
    const { harness } = await codeWorkspace();
    const asked: Array<string | undefined> = [];
    const [api] = harness.code.state.sessions;
    api!.impact = async (target) => {
      asked.push(target);
      return { status: 'found', markdown: 'hit' };
    };
    await harness.backend.last().tool('impact', { target: 'api/src/a.ts' });
    expect(asked).toEqual(['src/a.ts']);
  });
});

describe('the role', () => {
  it('carries the work loop, and the tool the checkpoint wording of the spec', async () => {
    const { harness } = await codeWorkspace();
    const { options } = harness.backend.last();
    expect(options.prompt).toMatch(/Run the tests/);
    expect(options.prompt).toMatch(/Call impact/);
    expect(options.prompt).toMatch(/Call checkpoint/);
    expect(options.prompt).toMatch(/End every turn with a checkpoint or a request_input/);
    const checkpoint = options.tools.find((t) => t.id === 'checkpoint')!;
    expect(checkpoint.description).toContain('Call it after each coherent step (a feature step, a fix, a refactor) once the\ntests you ran pass');
  });

  it('is only picked with repos attached', async () => {
    const harness = createHarness();
    const { workspace } = await harness.services.workspaces.create({ goal: 'scope' });
    await harness.services.agents.add(workspace.id, 'write code');
    expect(harness.picker.asked.at(-1)?.candidates.map((c) => c.id)).not.toContain('coder');
    const coded = await codeWorkspace(harness);
    await harness.services.agents.add(coded.ws, 'write code');
    expect(harness.picker.asked.at(-1)?.candidates.map((c) => c.id)).toContain('coder');
    expect(harness.picker.asked.at(-1)?.hasRepos).toBe(true);
  });

  it('roles besides the Coder get a shell too', async () => {
    const harness = createHarness();
    await harness.services.workspaces.create({ goal: 'scope' });
    expect(harness.backend.last().options.access).toBe('shell-and-files');
  });

  it('tells a new agent the branch and repos in its overview', async () => {
    const { harness } = await codeWorkspace();
    const first = harness.backend.last().received[0]!;
    expect(first).toMatch(/branch: drums\//);
    expect(first).toMatch(/api\/, from main: 1 files changed, \+2 -1/);
  });
});
