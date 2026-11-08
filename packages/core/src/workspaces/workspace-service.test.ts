import type { Agent } from '@drums/protocol';
import { describe, expect, it } from 'vitest';
import { createHarness, settle } from '../testing/harness.js';
import { workspaceSlug } from './slug.js';
import { workspaceStatus } from './status.js';

const agent = (status: Agent['status']): Agent => ({ id: status, role: 'scoper', name: 'Scoper', status });

describe('workspaceStatus', () => {
  it('shows the state that most needs you', () => {
    expect(workspaceStatus([agent('idle'), agent('running'), agent('input')])).toBe('input');
    expect(workspaceStatus([agent('running'), agent('review')])).toBe('review');
    expect(workspaceStatus([agent('idle'), agent('running')])).toBe('running');
    expect(workspaceStatus([])).toBe('idle');
  });
});

describe('workspaceSlug', () => {
  it('makes a path-safe, readable slug', () => {
    expect(workspaceSlug('Scope ../../etc/passwd, please!', 'AB-12-cd-ef')).toBe('scope-etc-passwd-please-ab12cd');
    expect(workspaceSlug('日本語', 'ab12cd')).toBe('ab12cd');
  });
});

describe('WorkspaceService', () => {
  it('creates a workspace with one running Scoper and shows the goal in its thread', async () => {
    const { services } = createHarness();
    const { workspace, posts } = await services.workspaces.create({ goal: 'Scope checkout' });
    expect(workspace.goal).toBe('Scope checkout');
    expect(workspace.agents.map((a) => [a.role, a.status])).toEqual([['scoper', 'running']]);
    expect(posts).toMatchObject([{ kind: 'message', text: 'Scope checkout' }]);
  });

  it('keeps the title the picker made, for the list and the PR, and goes without one if it made none', async () => {
    const { services, picker } = createHarness();
    picker.title = '  Checkout scope ';
    const titled = await services.workspaces.create({ goal: 'Scope checkout, with all the details' });
    expect(titled.workspace.title).toBe('Checkout scope');
    picker.title = undefined;
    const plain = await services.workspaces.create({ goal: 'Other' });
    expect(plain.workspace.title).toBeUndefined();
    expect(await services.workspaces.list()).toMatchObject([{ title: 'Checkout scope' }, { goal: 'Other' }]);
  });

  it('lists workspaces with their status and the role that posted last', async () => {
    const { services, backend } = createHarness();
    const { workspace } = await services.workspaces.create({ goal: 'Goal' });
    expect(await services.workspaces.list()).toMatchObject([{ id: workspace.id, status: 'running' }]);
    await backend.last().tool('post', { title: 't', message: 'm' });
    expect((await services.workspaces.list())[0]?.lastRole).toBe('scoper');
  });

  it('sums up several agents by what most needs the user', async () => {
    const { services, backend, picker } = createHarness();
    const { workspace } = await services.workspaces.create({ goal: 'Goal' });
    const scoper = backend.last();
    picker.answer = async () => [{ role: 'designer', instruction: 'Draw' }];
    await services.agents.add(workspace.id, 'Draw');
    const designer = backend.last();
    const status = async () => (await services.workspaces.list())[0]?.status;

    expect(await status()).toBe('running');
    scoper.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    expect(await status()).toBe('review');
    await designer.tool('request_input', { reason: 'Which?' });
    expect(await status()).toBe('input');
    await designer.tool('post', { title: 't', message: 'm' });
    expect((await services.workspaces.list())[0]?.lastRole).toBe('designer');
  });

  it('says so when a workspace does not exist', async () => {
    const { services } = createHarness();
    await expect(services.workspaces.state('nope')).rejects.toThrow('No workspace nope');
  });
});

describe('picking roles for a new workspace', () => {
  const coderIn = (names: string[]) => names.includes('coder');

  it('starts what the picker chooses, each with its own instruction', async () => {
    const { services, picker, backend } = createHarness();
    picker.answer = async () => [
      { role: 'researcher', instruction: 'Compare the loyalty programmes' },
      { role: 'designer', instruction: 'Sketch the points page' },
    ];
    const { workspace, posts } = await services.workspaces.create({ goal: 'Loyalty' });
    expect(workspace.agents.map((a) => [a.role, a.name, a.status])).toEqual([
      ['researcher', 'Researcher', 'running'],
      ['designer', 'Designer', 'running'],
    ]);
    expect(posts.map((p) => (p.kind === 'message' ? p.text : ''))).toEqual(['Compare the loyalty programmes', 'Sketch the points page']);
    expect(backend.sessions.map((s) => s.received[0])).toEqual([expect.stringContaining('goal: Loyalty'), expect.stringContaining('goal: Loyalty')]);
  });

  it('offers the registry\'s summaries, and a role needing a repo only with repos', async () => {
    const { services, picker } = createHarness();
    await services.workspaces.create({ goal: 'No repos' });
    expect(coderIn(picker.asked[0]!.candidates.map((c) => c.id))).toBe(false);
    expect(picker.asked[0]).toMatchObject({ goal: 'No repos', hasRepos: false });
    expect(picker.asked[0]!.candidates[0]!.summary).toBeTruthy();
    await services.workspaces.create({ goal: 'Repos', repos: [{ name: 'api', base: 'main' }] });
    expect(coderIn(picker.asked[1]!.candidates.map((c) => c.id))).toBe(true);
    expect(picker.asked[1]).toMatchObject({ goal: 'Repos', hasRepos: true });
  });

  it('never starts a role that needs a repo in a workspace without, whatever comes back', async () => {
    const { services, picker } = createHarness();
    picker.answer = async () => [{ role: 'coder', instruction: 'Hack' }];
    const { workspace } = await services.workspaces.create({ goal: 'x' });
    expect(workspace.agents.map((a) => a.role)).toEqual(['scoper']);
  });

  it.each([
    ['nothing', async () => []],
    ['an unknown role', async () => [{ role: 'wizard', instruction: 'x' }]],
    ['a failure', async () => Promise.reject(new Error('down'))],
  ])('starts a Scoper on the goal when the picker gives %s, with repos or without', async (_name, answer) => {
    const { services, picker } = createHarness();
    picker.answer = answer;
    const plain = await services.workspaces.create({ goal: 'Plain' });
    expect(plain.workspace.agents.map((a) => a.role)).toEqual(['scoper']);
    expect(plain.posts).toMatchObject([{ kind: 'message', text: 'Plain' }]);
    const code = await services.workspaces.create({ goal: 'Code', repos: [{ name: 'api', base: 'main' }] });
    expect(code.workspace.agents.map((a) => a.role)).toEqual(['scoper']);
  });

  it('starts each role once, and works from the goal when the instruction is empty', async () => {
    const { services, picker } = createHarness();
    picker.answer = async () => [
      { role: 'designer', instruction: '   ' },
      { role: 'designer', instruction: 'Again' },
    ];
    const { workspace, posts } = await services.workspaces.create({ goal: 'Goal' });
    expect(workspace.agents.map((a) => a.role)).toEqual(['designer']);
    expect(posts).toMatchObject([{ kind: 'message', text: 'Goal' }]);
  });

  it('asks the model before anything starts, and not at all when the worktrees fail', async () => {
    const { services, picker, code } = createHarness();
    code.state.failAdd = 'api';
    await expect(services.workspaces.create({ goal: 'x', repos: [{ name: 'api', base: 'main' }] })).rejects.toThrow(/cannot add/);
    expect(picker.asked).toEqual([]);
  });

  it('gives the strip where the last post is', async () => {
    const { services, backend } = createHarness();
    await services.workspaces.create({ goal: 'x' });
    expect((await services.workspaces.list())[0]?.lastPost).toBeUndefined();
    await backend.last().tool('post', { title: 't', message: 'm' });
    expect((await services.workspaces.list())[0]?.lastPost).toBe(2);
  });
});

describe('naming the agents for a new workspace', () => {
  const repos = [{ name: 'api', base: 'main' }];

  it('skips the picker and starts exactly these agents with exactly this text and title', async () => {
    const { services, picker, backend } = createHarness();
    const { workspace, posts } = await services.workspaces.create({
      goal: 'Slack message slack:C1:1.2',
      title: 'Fix the invoice export',
      repos,
      agents: [
        { role: 'coder', instruction: 'Fix it' },
        { role: 'reviewer', instruction: 'Check it' },
      ],
    });
    expect(picker.asked).toEqual([]);
    expect(workspace.title).toBe('Fix the invoice export');
    expect(workspace.agents.map((a) => [a.role, a.status])).toEqual([['coder', 'running'], ['reviewer', 'running']]);
    expect(posts.map((p) => (p.kind === 'message' ? p.text : ''))).toEqual(['Fix it', 'Check it']);
    expect(backend.sessions.map((s) => s.received[0])).toEqual([expect.stringMatching(/Fix it$/), expect.stringMatching(/Check it$/)]);
  });

  it('starts a role twice when asked to, under different names', async () => {
    const { services } = createHarness();
    const { workspace } = await services.workspaces.create({
      goal: 'Two',
      agents: [
        { role: 'researcher', instruction: 'One side' },
        { role: 'researcher', instruction: 'The other' },
      ],
    });
    expect(workspace.agents.map((a) => a.role)).toEqual(['researcher', 'researcher']);
    expect(new Set(workspace.agents.map((a) => a.name)).size).toBe(2);
  });

  it('goes without a title when the request has agents but no title', async () => {
    const { services, picker } = createHarness();
    picker.title = 'From the picker';
    const { workspace } = await services.workspaces.create({ goal: 'Goal', agents: [{ role: 'scoper', instruction: 'Go' }] });
    expect(workspace.title).toBeUndefined();
  });

  it('lets a title replace the one the picker made', async () => {
    const { services, picker } = createHarness();
    picker.title = 'From the picker';
    const { workspace } = await services.workspaces.create({ goal: 'Goal', title: 'Mine' });
    expect(workspace.title).toBe('Mine');
    expect(picker.asked).toHaveLength(1);
  });

  it.each([
    ['an unknown role', { repos, agents: [{ role: 'scoper', instruction: 'x' }, { role: 'wizard', instruction: 'x' }] }, /Unknown role: wizard/],
    ['a role needing a repo without one', { agents: [{ role: 'coder', instruction: 'x' }] }, /coder needs a repo/],
  ])('refuses %s before anything exists', async (_name, request, message) => {
    const { services, picker, code, backend } = createHarness();
    await expect(services.workspaces.create({ goal: 'x', ...request })).rejects.toMatchObject({ name: 'InvalidError', message: expect.stringMatching(message) });
    expect(code.state.worktrees).toEqual([]);
    expect(picker.asked).toEqual([]);
    expect(backend.sessions).toEqual([]);
    expect(await services.workspaces.list()).toEqual([]);
  });
});

describe('archiving', () => {
  it('stops the agents, marks it in the list, refuses messages until restored, and resumes them after', async () => {
    const { services, backend, store } = createHarness();
    const { workspace } = await services.workspaces.create({ goal: 'Goal' });
    const agent = workspace.agents[0]!.id;
    backend.last().emit({ type: 'session', sessionId: 's-1' });
    await settle();

    await services.workspaces.archive(workspace.id);
    await settle();
    expect((await store.getWorkspace(workspace.id))!.agents[0]!.status).toBe('idle');
    expect(await services.workspaces.list()).toMatchObject([{ id: workspace.id, archived: true }]);
    await expect(services.agents.send(workspace.id, agent, 'more')).rejects.toThrow('archived');
    await expect(services.agents.add(workspace.id, 'more')).rejects.toThrow('archived');

    await services.workspaces.restore(workspace.id);
    expect((await services.workspaces.list())[0]!.archived).toBeUndefined();
    await services.agents.send(workspace.id, agent, 'more');
    expect(backend.last().resumedFrom).toBe('s-1');
    expect(backend.last().received).toEqual(['more']);
  });
});
