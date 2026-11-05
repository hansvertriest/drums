import type { Agent, AgentId, PermissionDecision, WorkspaceId } from '@drums/protocol';
import { ConflictError, NotFoundError } from '../errors.js';
import type { AgentBackend, AgentEvent, AgentSession, AgentSessionOptions } from '../ports/agent-backend.js';
import type { Clock } from '../ports/clock.js';
import type { AgentClaims } from './agent-claims.js';
import type { AgentPermissions } from './agent-permissions.js';
import type { AgentRecords } from './agent-records.js';

/** What only exists while the server runs. */
interface Live {
  session: AgentSession;
  stopping: boolean;
  /** `request_input` was called this turn, so ending it means Needs input, not review. */
  wantsInput: boolean;
}

export interface AgentSessionsDeps {
  backend: AgentBackend;
  clock: Clock;
  records: AgentRecords;
  claims: AgentClaims;
  permissions: AgentPermissions;
  options(workspace: WorkspaceId, agent: Agent): AgentSessionOptions;
}

export type AgentSessions = ReturnType<typeof createAgentSessions>;

/** Running sessions: opening them, following their events, and what those do to the agent's status. */
export function createAgentSessions({ backend, clock, records, claims, permissions, options }: AgentSessionsDeps) {
  const live = new Map<AgentId, Live>();

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

  const whenEnded = async (workspace: WorkspaceId, agent: AgentId, state: Live, event: Extract<AgentEvent, { type: 'turn.ended' }>) => {
    claims.release(agent);
    await permissions.expireAll(workspace, agent);
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
    if (event.type === 'session') return void (await records.patch(workspace, agent, { sessionId: event.sessionId }));
    if (event.type === 'step') return records.addStep(workspace, { kind: 'tool', agent, at, tool: event.tool, summary: event.summary });
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
      for await (const event of state.session.events) await handle(workspace, agent, state, event);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
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
    const state: Live = { session, stopping: false, wantsInput: false };
    live.set(agent.id, state);
    void consume(workspace, agent.id, state);
    return state;
  };

  return {
    /** False if the session could not take it; the failure is then in the thread as an error step. */
    async deliver(workspace: WorkspaceId, id: AgentId, text: string) {
      try {
        await records.setStatus(workspace, id, 'running');
        const state = await open(workspace, await records.find(workspace, id));
        await state.session.send(text);
        return true;
      } catch (error) {
        claims.release(id);
        await records.addError(workspace, id, error instanceof Error ? error.message : String(error));
        await records.setStatus(workspace, id, 'idle');
        return false;
      }
    },
    async stop(workspace: WorkspaceId, id: AgentId) {
      await records.find(workspace, id);
      const state = live.get(id);
      if (!state || !claims.has(id)) return;
      state.stopping = true;
      await state.session.interrupt();
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
    closeAll() {
      for (const state of live.values()) state.session.close();
      live.clear();
      claims.clear();
    },
  };
}
