import { describe, expect, it } from 'vitest';
import { createHarness, settle } from '../testing/harness.js';

const repos = [
  { name: 'api', base: 'main' },
  { name: 'web', base: 'dev' },
];
const request = {
  title: 'Add paging',
  repos: [
    { name: 'api', body: 'API part' },
    { name: 'web', body: 'Web part' },
  ],
};

async function setup() {
  const harness = createHarness();
  const { workspace } = await harness.services.workspaces.create({ goal: 'Add paging\nand more', repos });
  return { harness, ws: workspace.id, branch: workspace.branch!, session: harness.backend.last() };
}

describe('opening PRs', () => {
  it('commits, pushes and opens one per repo, all with the same title, each with its report', async () => {
    const { harness, ws, branch } = await setup();
    await harness.services.prs.open(ws, request);
    const { commits, pushes, opened } = harness.code.state;
    expect(commits.map((c) => c.message)).toEqual(['Add paging', 'Add paging']);
    expect(pushes).toEqual([
      { worktree: `/workspaces/${ws}/api`, branch },
      { worktree: `/workspaces/${ws}/web`, branch },
    ]);
    expect(opened.map((o) => [o.title, o.head, o.base])).toEqual([
      ['Add paging', branch, 'main'],
      ['Add paging', branch, 'dev'],
    ]);
    expect(opened[0]!.body).toContain('API part');
    expect(opened[0]!.body).toContain('<!-- dyffle:start -->');
  });

  it('links the PRs to each other, keeping the report', async () => {
    const { harness, ws } = await setup();
    await harness.services.prs.open(ws, request);
    const { edits } = harness.code.state;
    expect(edits.map((e) => e.number)).toEqual([1, 2]);
    expect(edits[0]!.body).toContain('web: https://example.test/pull/2');
    expect(edits[0]!.body).not.toContain('api: https://');
    expect(edits[1]!.body).toContain('api: https://example.test/pull/1');
    expect(edits[0]!.body).toContain('<!-- dyffle:end -->');
  });

  it('adds no links for a single PR', async () => {
    const { harness, ws } = await setup();
    await harness.services.prs.open(ws, { title: 'T', repos: [request.repos[0]!] });
    expect(harness.code.state.edits).toEqual([]);
  });

  it('sets agents ready for review to idle, and the workspace shows the PR', async () => {
    const { harness, ws, session } = await setup();
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    expect((await harness.services.workspaces.state(ws)).workspace.agents[0]!.status).toBe('review');
    await harness.services.prs.open(ws, { title: 'T', repos: [request.repos[0]!] });
    const [summary] = await harness.services.workspaces.list();
    expect(summary).toMatchObject({ status: 'pr', pr: 1, prCount: 1 });
    expect(harness.seen.find((e) => e.type === 'prs.opened')).toMatchObject({ prs: [{ repo: 'api', pr: { number: 1 } }] });
  });

  it('keeps what opened when a later repo fails, and opening again links them', async () => {
    const { harness, ws } = await setup();
    harness.code.state.failPr = 'web';
    await expect(harness.services.prs.open(ws, request)).rejects.toThrow(/Not everything opened. web: gh: refused web/);
    expect((await harness.services.workspaces.state(ws)).workspace.repos.find((r) => r.name === 'api')?.pr?.number).toBe(1);
    harness.code.state.failPr = undefined;
    await harness.services.prs.open(ws, { title: 'Add paging', repos: [request.repos[1]!] });
    const { edits } = harness.code.state;
    expect(edits.find((e) => e.number === 1)?.body).toContain('API part');
    expect(edits.find((e) => e.number === 1)?.body).toContain('web: https://example.test/pull/2');
  });

  it('refuses a second PR for a repo and a repo with no changes', async () => {
    const { harness, ws } = await setup();
    await harness.services.prs.open(ws, { title: 'T', repos: [request.repos[0]!] });
    await expect(harness.services.prs.open(ws, { title: 'T', repos: [request.repos[0]!] })).rejects.toThrow(/already has PR #1/);
    harness.code.state.changes.set(`/workspaces/${ws}/web`, { files: 0, additions: 0, deletions: 0 });
    await expect(harness.services.prs.open(ws, { title: 'T', repos: [request.repos[1]!] })).rejects.toThrow(/no changes/);
    expect(harness.code.state.pushes).toHaveLength(1);
  });

  it('drafts the first line of the goal as title, with a body per repo', async () => {
    const { harness, ws, branch } = await setup();
    const drafts = await harness.services.prs.drafts(ws);
    expect(drafts).toMatchObject({ title: 'Add paging', branch });
    expect(drafts.repos.map((r) => [r.name, r.base, r.files])).toEqual([['api', 'main', 1], ['web', 'dev', 1]]);
  });
});
