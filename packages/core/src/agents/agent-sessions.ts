import type { Agent, AgentId, PermissionDecision, WorkspaceId } from '@drums/protocol';
import { ConflictError, NotFoundError } from '../errors.js';
import type { AgentBackend, AgentEvent, AgentSession, AgentSessionOptions } from '../ports/agent-backend.js';
import type { Clock } from '../ports/clock.js';
import type { AgentClaims } from './agent-claims.js';
import type { AgentPermissions } from './agent-permissions.js';
import type { AgentRecords } from './agent-records.js';
import type { EndOfTurn, TurnRecord } from './turn-checks/end-of-turn.js';

/** What only exists while the server runs. */
interface Live {
  session: AgentSession;
  stopping: boolean;
  /** `request_input` was called this turn, so ending it means Needs input, not review. */
  wantsInput: boolean;
  /** The end-of-turn checks are running: no turn is in progress to interrupt. */
  checking: boolean;
  /** A stored session that hasn't yet shown it could resume. */
  unproven: boolean;
  /** Given up on, or shutting down: whatever it still reports means nothing. */
  abandoned: boolean;
  /** The message of the turn in progress, to send again if a stored session turns out not to resume. */
  sent?: string;
  turn: TurnRecord;
}

export interface AgentSessionsDeps {
  backend: AgentBackend;
  clock: Clock;
  records: AgentRecords;
  claims: AgentClaims;
  permissions: AgentPermissions;
  endOfTurn: EndOfTurn;
  options(workspace: WorkspaceId, agent: Agent): AgentSessionOptions;
  /** What a session that starts over needs up front, having lost its conversation. */
  overview(workspace: WorkspaceId, agent: AgentId): Promise<string>;
}

export type AgentSessions = ReturnType<typeof createAgentSessions>;

/** Running sessions: opening them, following their events, and what those do to the agent's status. */
export function createAgentSessions({ backend, clock, records, claims, permissions, endOfTurn, options, overview }: AgentSessionsDeps) {
  const live = new Map<AgentId, Live>();

  const newTurn = (answering: string[] = []): TurnRecord => ({ startedAt: clock.now().toISOString(), writes: [], answering });

  const whenRequested = async (workspace: WorkspaceId, agent: AgentId, event: Extract<AgentEvent, { type: 'permission.requested' }>) => {
    const { id, tool, title, detail } = event;
    await permissions.add(workspace, agent, { id, tool, title, detail });
    await records.setStatus(workspace, agent, 'input');
  };

  /** With nothing left to answer, the turn is going again. */
  const backToWork = async (workspace: WorkspaceId, agent: AgentId) => {
    if (claims.has(agent) && (await permissions.pendingOf(workspace, agent)).length === 0) {
      await records.setStatus(workspace, agent, 'running');
    }
  };

  /** Sends a nudge if the checks find one, keeping the agent claimed and running. False if the turn is really over. */
  const nudged = async (workspace: WorkspaceId, agent: AgentId, state: Live) => {
    state.checking = true;
    try {
      const nudge = await endOfTurn.review(workspace, agent, state.turn);
      // Stop was pressed while the checks ran.
      if (!nudge || state.stopping) return false;
      state.turn = newTurn(nudge.checks);
      await state.session.send(nudge.message);
      return true;
    } catch (error) {
      await records.addError(workspace, agent, error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      state.checking = false;
    }
  };

  const whenEnded = async (workspace: WorkspaceId, agent: AgentId, state: Live, event: Extract<AgentEvent, { type: 'turn.ended' }>) => {
    if (state.unproven && event.outcome === 'error' && !state.stopping) return startOver(workspace, agent, state);
    state.unproven = false;
    await permissions.expireAll(workspace, agent);
    // Stop, a failed turn and a turn that ends by asking the user all run no checks.
    if (event.outcome === 'success' && !state.stopping && !state.wantsInput && (await nudged(workspace, agent, state))) return undefined;
    claims.release(agent);
    const { stopping, wantsInput } = state;
    state.stopping = false;
    state.wantsInput = false;
    if (stopping) return records.setStatus(workspace, agent, 'idle');
    if (event.outcome === 'error') {
      await records.addError(workspace, agent, event.error ?? 'The turn failed.');
      return records.setStatus(workspace, agent, 'idle');
    }
    return records.setStatus(workspace, agent, wantsInput ? 'input' : 'review');
  };

  const handle = async (workspace: WorkspaceId, agent: AgentId, state: Live, event: AgentEvent): Promise<void> => {
    const at = clock.now().toISOString();
    if (event.type === 'session') {
      state.unproven = false;
      return void (await records.patch(workspace, agent, { sessionId: event.sessionId }));
    }
    if (event.type === 'step') {
      state.turn.writes.push(...(event.writes ?? []));
      return records.addStep(workspace, { kind: 'tool', agent, at, tool: event.tool, summary: event.summary });
    }
    if (event.type === 'text') return records.addStep(workspace, { kind: 'text', agent, at, text: event.text });
    if (event.type === 'permission.requested') return whenRequested(workspace, agent, event);
    if (event.type === 'permission.cancelled') {
      await permissions.settle(workspace, event.id, 'expired');
      return backToWork(workspace, agent);
    }
    return whenEnded(workspace, agent, state, event);
  };

  /** Runs for the life of a session. If it dies mid-turn the agent goes idle and the next message resumes it. */
  const consume = async (workspace: WorkspaceId, agent: AgentId, state: Live) => {
    let failure: string | undefined;
    try {
      for await (const event of state.session.events) {
        if (state.abandoned) return;
        await handle(workspace, agent, state, event);
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    if (state.abandoned) return;
    if (state.unproven && claims.has(agent)) return void (await startOver(workspace, agent, state));
    if (live.get(agent) === state) live.delete(agent);
    await permissions.expireAll(workspace, agent);
    if (!claims.release(agent) && !failure) return;
    await records.addError(workspace, agent, failure ?? 'The session ended unexpectedly.');
    await records.setStatus(workspace, agent, 'idle');
  };

  const open = async (workspace: WorkspaceId, agent: Agent) => {
    const existing = live.get(agent.id);
    if (existing) return existing;
    const sessionOptions = options(workspace, agent);
    const session = agent.sessionId ? await backend.resume(agent.sessionId, sessionOptions) : await backend.start(sessionOptions);
    const state: Live = { session, stopping: false, wantsInput: false, checking: false, unproven: !!agent.sessionId, abandoned: false, turn: newTurn() };
    live.set(agent.id, state);
    void consume(workspace, agent.id, state);
    return state;
  };

  const send = async (state: Live, text: string) => {
    state.turn = newTurn();
    state.sent = text;
    await state.session.send(text);
  };

  /** Forgets the stored session, so a session that can't resume never wedges its agent. Its message goes to a new one. */
  const forget = async (workspace: WorkspaceId, agent: AgentId, sent: string | undefined) => {
    await records.patch(workspace, agent, { sessionId: undefined });
    await records.addStep(workspace, { kind: 'tool', agent, at: clock.now().toISOString(), tool: 'drums', summary: 'The stored session could not resume, so this agent starts a new one. It keeps the workspace but not its earlier conversation.' });
    return sent === undefined ? undefined : `${await overview(workspace, agent)}\n\n${sent}`;
  };

  /** Claimed throughout: as far as the user can tell this is still the turn they started. */
  async function startOver(workspace: WorkspaceId, agent: AgentId, state: Live) {
    state.abandoned = true;
    if (live.get(agent) === state) live.delete(agent);
    state.session.close();
    await permissions.expireAll(workspace, agent);
    const text = await forget(workspace, agent, state.sent);
    if (text !== undefined) return void (await deliver(workspace, agent, text));
    claims.release(agent);
    await records.setStatus(workspace, agent, 'idle');
  }

  /** False if the session could not take it; the failure is then in the thread as an error step. */
  async function deliver(workspace: WorkspaceId, id: AgentId, text: string): Promise<boolean> {
    try {
      await records.setStatus(workspace, id, 'running');
      const agent = await records.find(workspace, id);
      try {
        await send(await open(workspace, agent), text);
      } catch (error) {
        if (!agent.sessionId || live.has(id)) throw error;
        const again = (await forget(workspace, id, text)) as string;
        await send(await open(workspace, await records.find(workspace, id)), again);
      }
      return true;
    } catch (error) {
      claims.release(id);
      await records.addError(workspace, id, error instanceof Error ? error.message : String(error));
      await records.setStatus(workspace, id, 'idle');
      return false;
    }
  }

  return {
    deliver,
    async stop(workspace: WorkspaceId, id: AgentId) {
      await records.find(workspace, id);
      const state = live.get(id);
      if (!state || !claims.has(id)) return;
      state.stopping = true;
      if (!state.checking) await state.session.interrupt();
    },
    wantsInput(id: AgentId) {
      const state = live.get(id);
      if (state) state.wantsInput = true;
    },
    async answer(workspace: WorkspaceId, agent: AgentId, id: string, decision: PermissionDecision) {
      const request = (await permissions.pendingOf(workspace, agent)).find((pending) => pending.id === id);
      if (!request) throw new NotFoundError('Nothing is waiting for that answer.');
      const accepted = await live.get(agent)?.session.respondPermission(id, decision);
      if (!accepted) {
        await permissions.settle(workspace, id, 'expired');
        await records.setStatus(workspace, agent, 'idle');
        claims.release(agent);
        throw new ConflictError('The session that asked is gone. Send a message to carry on.');
      }
      await permissions.settle(workspace, id, decision === 'allow' ? 'allowed' : 'denied');
      await backToWork(workspace, agent);
    },
    /** Ends the session without a word from it. A stored one resumes with the next message. */
    close(id: AgentId) {
      const state = live.get(id);
      if (state) {
        state.abandoned = true;
        state.session.close();
      }
      live.delete(id);
      claims.release(id);
    },
    closeAll() {
      // What they say while closing changes nothing: `recover` sets things straight at the next start.
      for (const state of live.values()) {
        state.abandoned = true;
        state.session.close();
      }
      live.clear();
      claims.clear();
    },
  };
}
