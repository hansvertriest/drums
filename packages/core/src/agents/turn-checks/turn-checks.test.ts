import { describe, expect, it } from 'vitest';
import type { FakeSession } from '../../testing/fake-backend.js';
import { createHarness, settle } from '../../testing/harness.js';
import { createTurnCheckRegistry, turnChecks } from './registry.js';

const setup = async () => {
  const harness = createHarness();
  const { workspace } = await harness.services.workspaces.create({ goal: 'Add paging', repos: [{ name: 'api', base: 'main' }] });
  const ws = workspace.id;
  const session = harness.backend.last();
  const agent = workspace.agents[0]!;
  const edit = () => harness.code.state.uncommitted.add(`/workspaces/${ws}/api`);
  const commit = () => harness.code.state.uncommitted.delete(`/workspaces/${ws}/api`);
  const load = async () => (await harness.store.getWorkspace(ws))!;
  const status = async () => (await load()).agents[0]!.status;
  return { ...harness, ws, session, agent, edit, commit, load, status };
};

const endTurn = async (session: FakeSession) => {
  session.emit({ type: 'turn.ended', outcome: 'success' });
  await settle();
};

const NUDGE = /^<drums-system>\nYou left changes uncommitted[\s\S]*<\/drums-system>$/;

describe('changes left uncommitted', () => {
  it('leaves a turn that changed nothing alone', async () => {
    const { session, status } = await setup();
    await endTurn(session);
    expect(session.received).toHaveLength(1);
    expect(await status()).toBe('review');
  });

  it('nudges once, keeps the agent running, and is satisfied by a commit', async () => {
    const { session, edit, commit, status, load, services, ws } = await setup();
    edit();
    await endTurn(session);
    expect(session.received.at(-1)).toMatch(NUDGE);
    expect(await status()).toBe('running');
    await expect(services.agents.send(ws, (await load()).agents[0]!.id, 'hello')).rejects.toThrow(/is working/);

    commit();
    await endTurn(session);
    expect(session.received.filter((text) => NUDGE.test(text))).toHaveLength(1);
    expect(await status()).toBe('review');
  });

  it('does not commit for the agent if it still does not, and does not ask again', async () => {
    const { session, edit, agent, status, services, ws, code } = await setup();
    edit();
    await endTurn(session);
    await endTurn(session);
    expect(session.received.filter((text) => NUDGE.test(text))).toHaveLength(1);
    expect(code.state.uncommitted.size).toBe(1);
    expect(await status()).toBe('review');
    // A new turn with the changes still there gets one nudge again.
    await services.agents.send(ws, agent.id, 'and now?');
    await endTurn(session);
    expect(session.received.filter((text) => NUDGE.test(text))).toHaveLength(2);
  });

  it('never bothers a role that cannot change files', async () => {
    const { services, ws, edit, picker, backend, session } = await setup();
    await endTurn(session);
    picker.answer = async () => [{ role: 'reviewer', instruction: 'Check' }];
    await services.agents.add(ws, 'Check');
    const reviewer = backend.last();
    edit();
    await endTurn(reviewer);
    expect(reviewer.received).toHaveLength(1);
  });

  it('survives a repo it cannot read, and says so in the steps', async () => {
    const { session, code, status, services, ws } = await setup();
    code.git.hasUncommitted = async () => {
      throw new Error('not a git repository');
    };
    await endTurn(session);
    expect(await status()).toBe('review');
    expect((await services.workspaces.state(ws)).steps.at(-1)).toMatchObject({ kind: 'tool', tool: 'drums', summary: expect.stringContaining('not a git repository') });
  });
});

describe('an artifact file written without artifact_update', () => {
  const write = (session: FakeSession, path: string) => session.emit({ type: 'step', tool: 'Write', summary: path, writes: [path] });

  it('nudges for HTML outside the repos, once, and does nothing more', async () => {
    const { session, status } = await setup();
    write(session, 'scope.html');
    await endTurn(session);
    expect(session.received.at(-1)).toMatch(/^<drums-system>\nYou wrote an HTML file/);
    await endTurn(session);
    expect(await status()).toBe('review');
    expect(session.received.filter((text) => text.startsWith('<drums-system>'))).toHaveLength(1);
  });

  it('takes HTML in a repo for code, and other files for nothing', async () => {
    const { session } = await setup();
    write(session, 'api/public/index.html');
    write(session, 'notes.md');
    await endTurn(session);
    expect(session.received).toHaveLength(1);
  });

  it('is satisfied by a posted version', async () => {
    const { session } = await setup();
    write(session, '.drums/artifacts/a2/v1.html');
    await session.tool('artifact_create', { title: 'Scope', html: '<p>x</p>', note: 'first' });
    await endTurn(session);
    expect(session.received).toHaveLength(1);
  });

  it('forgets last turn: only what this turn wrote counts', async () => {
    const { session, services, ws, agent } = await setup();
    write(session, 'scope.html');
    await session.tool('artifact_create', { title: 'Scope', html: '<p>x</p>', note: 'first' });
    await endTurn(session);
    await services.agents.send(ws, agent.id, 'thanks');
    await endTurn(session);
    expect(session.received).toHaveLength(2);
  });

  it('sends both nudges as one message when both hold', async () => {
    const { session, edit, load } = await setup();
    edit();
    write(session, 'scope.html');
    await endTurn(session);
    expect(session.received).toHaveLength(2);
    expect(session.received[1]).toContain('uncommitted');
    expect(session.received[1]).toContain('artifact_update');
    expect((await load()).nudges).toEqual({ coder: { 'uncommitted-changes': 1, 'artifact-file-written': 1 } });
  });
});

describe('when checks do not run', () => {
  it('runs none after Stop, and the agent goes idle', async () => {
    const { session, edit, services, ws, agent, status } = await setup();
    edit();
    await services.agents.stop(ws, agent.id);
    session.emit({ type: 'turn.ended', outcome: 'error', error: 'interrupted' });
    await settle();
    expect(session.received).toHaveLength(1);
    expect(await status()).toBe('idle');
  });

  it('runs none after a stop during the nudge turn', async () => {
    const { session, edit, services, ws, agent, status } = await setup();
    edit();
    await endTurn(session);
    await services.agents.stop(ws, agent.id);
    await endTurn(session);
    expect(await status()).toBe('idle');
    expect(session.received.filter((text) => NUDGE.test(text))).toHaveLength(1);
  });

  it('sends no nudge if Stop comes while the checks are running, and interrupts nothing', async () => {
    const { session, edit, services, ws, agent, status, code } = await setup();
    edit();
    const hasUncommitted = code.git.hasUncommitted;
    let proceed = () => {};
    code.git.hasUncommitted = (worktree) => new Promise((resolve) => (proceed = () => void hasUncommitted(worktree).then(resolve)));
    session.emit({ type: 'turn.ended', outcome: 'success' });
    await settle();
    await services.agents.stop(ws, agent.id);
    proceed();
    await settle();
    expect(session.received).toHaveLength(1);
    expect(session.interrupted).toBe(0);
    expect(await status()).toBe('idle');
  });

  it('runs none after a failed turn', async () => {
    const { session, edit, status } = await setup();
    edit();
    session.emit({ type: 'turn.ended', outcome: 'error', error: 'overloaded' });
    await settle();
    expect(session.received).toHaveLength(1);
    expect(await status()).toBe('idle');
  });

  it('runs none when the turn ends by asking the user', async () => {
    const { session, edit, status } = await setup();
    edit();
    await session.tool('request_input', { reason: 'Which table?' });
    await endTurn(session);
    expect(session.received).toHaveLength(1);
    expect(await status()).toBe('input');
  });
});

describe('counting', () => {
  it('counts per role, stored, and adds up over workspaces', async () => {
    const first = await setup();
    first.edit();
    await endTurn(first.session);
    await endTurn(first.session);
    first.commit();
    first.edit();
    await first.services.agents.send(first.ws, first.agent.id, 'more');
    await endTurn(first.session);
    await endTurn(first.session);
    expect((await first.load()).nudges).toEqual({ coder: { 'uncommitted-changes': 2 } });

    const { workspace } = await first.services.workspaces.create({ goal: 'Second', repos: [{ name: 'web', base: 'dev' }] });
    first.code.state.uncommitted.add(`/workspaces/${workspace.id}/web`);
    await endTurn(first.backend.last());
    expect(await first.services.agents.nudges()).toEqual({ coder: { 'uncommitted-changes': 3 } });
  });

  it('counts nothing a nudge would not have been sent for', async () => {
    const { session, load, services } = await setup();
    await endTurn(session);
    expect((await load()).nudges).toEqual({});
    expect(await services.agents.nudges()).toEqual({});
  });
});

describe('the registry', () => {
  it('holds every check once, by id', () => {
    expect(createTurnCheckRegistry().list().map((check) => check.id)).toEqual(turnChecks.map((check) => check.id));
    expect(() => createTurnCheckRegistry([turnChecks[0]!, turnChecks[0]!])).toThrow(/Duplicate/);
  });
});
