import { Workspace } from '@drums/protocol';
import { describe, expect, it } from 'vitest';
import type { FakeSession } from '../testing/fake-backend.js';
import { createHarness, settle } from '../testing/harness.js';
import { workspaceStatus } from '../workspaces/status.js';

const REPOS = [{ name: 'api', base: 'main' }];

/** A workspace with one agent, a Scoper unless told otherwise, whose turn is in progress. */
async function setup(repos: typeof REPOS = [], role = 'scoper') {
  const harness = createHarness();
  harness.picker.answer = async () => [{ role, instruction: 'Start' }];
  const { workspace } = await harness.services.workspaces.create({ goal: 'x', repos });
  const ws = workspace.id;
  const sender = harness.backend.last();
  const scoper = workspace.agents[0]!.id;
  const load = async () => (await harness.store.getWorkspace(ws))!;
  const agent = async (name: string) => (await load()).agents.find((a) => a.name === name)!;
  const posts = () => harness.services.posts.list(ws);
  const lastNote = async () => (await posts()).filter((post) => post.kind === 'note').at(-1);
  return { ...harness, ws, sender, scoper, load, agent, posts, lastNote };
}

const endTurn = async (session: FakeSession, outcome: 'success' | 'error' = 'success') => {
  session.emit({ type: 'turn.ended', outcome, ...(outcome === 'error' ? { error: 'failed' } : {}) });
  await settle();
};

const handOver = (session: FakeSession, role: string, instruction = 'Check it') => session.tool('handover', { role, instruction });

describe('when a handover fires', () => {
  it('waits for the end of the turn, then starts a new agent with the overview in front', async () => {
    const { sender, backend, agent, scoper, ws, services } = await setup();
    await handOver(sender, 'reviewer', 'Check <this>');
    expect(backend.sessions).toHaveLength(1);
    await endTurn(sender);
    expect(backend.sessions).toHaveLength(2);
    const [first] = backend.last().received;
    expect(first).toContain('<drums-workspace>');
    expect(first).toContain('<drums-handover from="Scoper">\nCheck &lt;this&gt;\n</drums-handover>');
    expect((await agent('Reviewer')).status).toBe('running');
    expect((await agent('Scoper')).status).toBe('idle');
    const reviewer = (await agent('Reviewer')).id;
    expect((await services.posts.list(ws)).filter((post) => post.kind === 'handover')).toMatchObject([
      { agent: reviewer, direction: 'received', peer: scoper, instruction: 'Check <this>' },
      { agent: scoper, direction: 'sent', peer: reviewer, instruction: 'Check <this>' },
    ]);
  });

  it('leaves the workspace running, not ready for review', async () => {
    const { sender, load } = await setup();
    await handOver(sender, 'reviewer');
    await endTurn(sender);
    expect(workspaceStatus((await load()).agents)).toBe('running');
  });

  it('survives a nudge and waits for the turn that answers it', async () => {
    const { sender, code, ws, backend } = await setup(REPOS, 'coder');
    code.state.uncommitted.add(`/workspaces/${ws}/api`);
    await handOver(sender, 'reviewer');
    await endTurn(sender);
    expect(sender.received.at(-1)).toContain('<drums-system>');
    expect(backend.sessions).toHaveLength(1);
    await endTurn(sender);
    expect(backend.sessions).toHaveLength(2);
  });

  it('continues an existing agent without a second overview', async () => {
    const { sender, backend, services, ws, scoper } = await setup();
    await handOver(sender, 'reviewer');
    await endTurn(sender);
    const reviewer = backend.last();
    await endTurn(reviewer);
    await services.agents.send(ws, scoper, 'and again');
    await handOver(sender, 'reviewer', 'Once more');
    await endTurn(sender);
    expect(backend.sessions).toHaveLength(2);
    expect(reviewer.received.at(-1)).toBe('<drums-handover from="Scoper">\nOnce more\n</drums-handover>');
  });

  it('picks the newest open agent of the role, and never the sender', async () => {
    const { sender, backend, services, ws, scoper, agent, picker } = await setup();
    picker.answer = async () => [{ role: 'scoper', instruction: 'Second' }];
    await services.agents.add(ws, 'Second');
    const second = backend.last();
    await endTurn(second);
    await handOver(sender, 'scoper', 'For the other one');
    await endTurn(sender);
    expect(second.received.at(-1)).toContain('For the other one');
    expect((await agent('Scoper')).id).toBe(scoper);
    expect((await agent('Scoper')).status).toBe('idle');
  });
});

describe('what cancels it', () => {
  it.each([
    ['Stop', async (s: FakeSession, stop: () => Promise<void>) => { await stop(); await endTurn(s, 'error'); }],
    ['a failed turn', async (s: FakeSession) => endTurn(s, 'error')],
  ])('%s', async (_name, finish) => {
    const { sender, backend, services, ws, scoper } = await setup();
    await handOver(sender, 'reviewer');
    await finish(sender, () => services.agents.stop(ws, scoper));
    expect(backend.sessions).toHaveLength(1);
  });

  it('request_input, also in the turn after a nudge', async () => {
    const { sender, code, ws, backend, agent } = await setup(REPOS, 'coder');
    code.state.uncommitted.add(`/workspaces/${ws}/api`);
    await handOver(sender, 'reviewer');
    await endTurn(sender);
    expect(sender.received.at(-1)).toContain('<drums-system>');
    await sender.tool('request_input', { reason: 'Which one?' });
    await endTurn(sender);
    expect(backend.sessions).toHaveLength(1);
    expect((await agent('Coder')).status).toBe('input');
  });

  it('does not carry over into the next turn', async () => {
    const { sender, backend, services, ws, scoper } = await setup();
    await handOver(sender, 'reviewer');
    await endTurn(sender, 'error');
    await services.agents.send(ws, scoper, 'go on');
    await endTurn(sender);
    expect(backend.sessions).toHaveLength(1);
  });
});

describe('what the tool refuses straight away', () => {
  it('an unknown role, naming the ones there are', async () => {
    const { sender } = await setup();
    const result = await handOver(sender, 'plumber');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('reviewer');
  });

  it('a role that needs a repo, in a workspace without', async () => {
    const { sender } = await setup();
    expect((await handOver(sender, 'coder')).isError).toBe(true);
  });

  it('its own role when nobody else has it', async () => {
    const { sender } = await setup();
    expect((await handOver(sender, 'scoper')).text).toMatch(/yourself/);
  });

  it('a second handover in the same turn, and keeps the first', async () => {
    const { sender, backend } = await setup();
    await handOver(sender, 'reviewer', 'First');
    expect((await handOver(sender, 'designer', 'Second')).isError).toBe(true);
    await endTurn(sender);
    expect(backend.last().received[0]).toContain('First');
  });
});

describe('refused when it fires', () => {
  const withBusyReviewer = async () => {
    const context = await setup();
    await handOver(context.sender, 'reviewer');
    await endTurn(context.sender);
    await context.services.agents.send(context.ws, context.scoper, 'and again');
    await handOver(context.sender, 'reviewer', 'Once more');
    return context;
  };

  it('a running target, with the sender on Needs input and the reason in its thread', async () => {
    const { sender, agent, lastNote, backend } = await withBusyReviewer();
    await endTurn(sender);
    expect((await agent('Scoper')).status).toBe('input');
    expect(await lastNote()).toMatchObject({ title: 'Needs input', message: expect.stringMatching(/Reviewer is working[\s\S]*Once more/) });
    expect(backend.last().received).toHaveLength(1);
  });

  it('a target on Needs input, which no claim covers', async () => {
    const { sender, backend, agent, lastNote } = await withBusyReviewer();
    await backend.last().tool('request_input', { reason: 'Which?' });
    await endTurn(backend.last());
    await endTurn(sender);
    expect((await agent('Scoper')).status).toBe('input');
    expect(await lastNote()).toMatchObject({ message: expect.stringContaining('waiting for you') });
  });

  it('a workspace archived in the meantime', async () => {
    const { sender, store, ws, agent, backend } = await setup();
    await handOver(sender, 'reviewer');
    await store.updateWorkspace(ws, (w) => ({ ...w, archivedAt: '2026-01-02T00:00:00.000Z' }));
    await endTurn(sender);
    expect(backend.sessions).toHaveLength(1);
    expect((await agent('Scoper')).status).toBe('input');
  });

  it('a delivery that fails, without counting it', async () => {
    const { sender, backend, agent, load, lastNote } = await setup();
    backend.start = () => Promise.reject(new Error('no session'));
    await handOver(sender, 'reviewer');
    await endTurn(sender);
    expect((await agent('Scoper')).status).toBe('input');
    expect(await lastNote()).toMatchObject({ message: expect.stringContaining('could not be reached') });
    expect((await load()).handoversInARow).toBe(0);
  });
});

describe('the count of handovers in a row', () => {
  /** Scoper → Reviewer → Designer → Researcher: three handovers. */
  const chainOfThree = async () => {
    const context = await setup();
    let from = context.sender;
    for (const role of ['reviewer', 'designer', 'researcher']) {
      await handOver(from, role);
      await endTurn(from);
      from = context.backend.last();
    }
    return { ...context, last: from };
  };

  it('stops at the fourth, showing the instruction it wanted to send', async () => {
    const { last, agent, lastNote, load, backend } = await chainOfThree();
    expect((await load()).handoversInARow).toBe(3);
    await handOver(last, 'scoper', 'Fourth one');
    await endTurn(last);
    expect((await agent('Researcher')).status).toBe('input');
    expect(await lastNote()).toMatchObject({ message: expect.stringMatching(/3 handovers in a row[\s\S]*Fourth one/) });
    expect(backend.sessions).toHaveLength(4);
    expect((await load()).handoversInARow).toBe(3);
  });

  it('resets on a message from the composer', async () => {
    const { services, ws, agent, load, last } = await chainOfThree();
    await endTurn(last);
    await services.agents.send(ws, (await agent('Researcher')).id, 'go on');
    expect((await load()).handoversInARow).toBe(0);
  });

  it('resets on Send', async () => {
    const { services, ws, agent, load, last } = await chainOfThree();
    await endTurn(last);
    await services.feedback.send(ws, { overall: 'carry on', to: (await agent('Researcher')).id });
    expect((await load()).handoversInARow).toBe(0);
  });

  it('defaults to 0 for a workspace stored before it existed', () => {
    const old = { id: 'w1', goal: 'x', createdAt: '2026-01-01T00:00:00.000Z', agents: [] };
    expect(Workspace.parse(old).handoversInARow).toBe(0);
  });
});

describe('a handover that needs your OK', () => {
  const askForCoder = async () => {
    const context = await setup(REPOS);
    await handOver(context.sender, 'coder', 'Build it');
    await endTurn(context.sender);
    const row = async () => (await context.load()).permissions[0]!;
    return { ...context, row };
  };

  it('adds a row that survives the end of the turn, with the sender on Needs input', async () => {
    const { row, backend, agent } = await askForCoder();
    expect(await row()).toMatchObject({ tool: 'handover', status: 'pending', detail: 'Build it', handover: { role: 'coder' } });
    expect(backend.sessions).toHaveLength(1);
    expect((await agent('Scoper')).status).toBe('input');
  });

  it('Allow fires it, without a live prompt to answer', async () => {
    const { row, services, ws, scoper, backend, agent, sender } = await askForCoder();
    await services.agents.answerPermission(ws, scoper, (await row()).id, 'allow');
    expect((await row()).status).toBe('allowed');
    expect(sender.answers).toEqual([]);
    expect(backend.sessions).toHaveLength(2);
    expect(backend.last().received[0]).toContain('Build it');
    expect((await agent('Coder')).status).toBe('running');
    expect((await agent('Scoper')).status).toBe('idle');
  });

  it('Deny starts nothing and leaves the work ready for review', async () => {
    const { row, services, ws, scoper, backend, agent, load } = await askForCoder();
    await services.agents.answerPermission(ws, scoper, (await row()).id, 'deny');
    expect((await row()).status).toBe('denied');
    expect(backend.sessions).toHaveLength(1);
    expect((await agent('Scoper')).status).toBe('review');
    expect((await load()).handoversInARow).toBe(0);
  });

  it('Allow checks again, and refuses a target that has since become busy', async () => {
    const { row, services, ws, scoper, store, agent, lastNote, picker } = await askForCoder();
    picker.answer = async () => [{ role: 'coder', instruction: 'Other work' }];
    await services.agents.add(ws, 'Other work');
    await services.agents.answerPermission(ws, scoper, (await row()).id, 'allow');
    expect((await row()).status).toBe('allowed');
    expect((await agent('Scoper')).status).toBe('input');
    expect(await lastNote()).toMatchObject({ message: expect.stringContaining('Coder is working') });
    expect((await store.getWorkspace(ws))!.handoversInARow).toBe(0);
  });

  it('does not reset the count when you Allow', async () => {
    const { row, services, ws, scoper, store } = await askForCoder();
    await store.updateWorkspace(ws, (w) => ({ ...w, handoversInARow: 2 }));
    await services.agents.answerPermission(ws, scoper, (await row()).id, 'allow');
    expect((await store.getWorkspace(ws))!.handoversInARow).toBe(3);
  });

  it('expires on a restart', async () => {
    const { row, services, agent } = await askForCoder();
    await services.agents.recover();
    expect((await row()).status).toBe('expired');
    expect((await agent('Scoper')).status).toBe('idle');
  });

  it('expires when a message reaches the sender', async () => {
    const { row, services, ws, scoper, backend, agent } = await askForCoder();
    await services.agents.send(ws, scoper, 'Actually, wait');
    expect((await row()).status).toBe('expired');
    expect(backend.sessions).toHaveLength(1);
    expect((await agent('Scoper')).status).toBe('running');
  });

  it('expires on Send to the sender', async () => {
    const { row, services, ws, scoper } = await askForCoder();
    await services.feedback.send(ws, { overall: 'Hold on', to: scoper });
    expect((await row()).status).toBe('expired');
  });

  it('does not leave the sender waiting if its idle session dies', async () => {
    const { row, sender, agent } = await askForCoder();
    sender.end();
    await settle();
    expect((await row()).status).toBe('expired');
    expect((await agent('Scoper')).status).toBe('idle');
  });

  it('cannot be answered twice', async () => {
    const { row, services, ws, scoper } = await askForCoder();
    const { id } = await row();
    await services.agents.answerPermission(ws, scoper, id, 'deny');
    await expect(services.agents.answerPermission(ws, scoper, id, 'allow')).rejects.toThrow(/Nothing is waiting/);
  });
});

describe('what other agents and the overview see', () => {
  it('lists a handover once in the feed, as sent', async () => {
    const { sender, services, ws, agent, picker, backend } = await setup();
    await handOver(sender, 'reviewer', 'Check it');
    await endTurn(sender);
    picker.answer = async () => [{ role: 'designer', instruction: 'Look' }];
    await services.agents.add(ws, 'Look');
    const reader = (await agent('Designer')).id;
    expect(backend.last().received[0]).toContain('Handed over to Reviewer');
    const feed = await services.posts.feed(ws, reader);
    expect(feed.posts.filter((post) => post.title.startsWith('Handed over'))).toMatchObject([
      { by: 'Scoper', title: 'Handed over to Reviewer', message: 'Check it' },
    ]);
  });

  it('tells an agent which roles it can hand over to, without one that needs a repo', async () => {
    const { sender } = await setup();
    expect(sender.received[0]).toContain('roles you can hand over to:');
    expect(sender.received[0]).toMatch(/reviewer: /);
    expect(sender.received[0]).not.toMatch(/coder: /);
  });

  it('lists the Coder on code', async () => {
    const { sender } = await setup(REPOS);
    expect(sender.received[0]).toMatch(/coder: /);
  });
});
