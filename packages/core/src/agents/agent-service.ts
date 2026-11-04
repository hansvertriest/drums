import type { Agent, AgentId, AgentStatus, RoleId, StepDraft, WorkspaceId } from '@drums/protocol';
import type { ArtifactService } from '../artifacts/artifact-service.js';
import { ConflictError, NotFoundError } from '../errors.js';
import type { EventBus } from '../events/event-bus.js';
import type { AgentBackend, AgentEvent, AgentSession, AgentSessionOptions } from '../ports/agent-backend.js';
import type { Clock } from '../ports/clock.js';
import type { Ids } from '../ports/ids.js';
import type { Store } from '../ports/store.js';
import type { PostService } from '../posts/post-service.js';
import type { RoleRegistry } from '../roles/registry.js';
import { bindTool } from '../tools/bind.js';
import type { ToolRegistry } from '../tools/registry.js';

export interface AgentService {
  /** Adds an agent to the workspace and gives it its first message. */
  start(workspace: WorkspaceId, role: RoleId, instruction: string): Promise<Agent>;
  /** A message from the composer: it shows in the thread and goes to the agent. Refused while the agent runs. */
  send(workspace: WorkspaceId, agent: AgentId, text: string): Promise<void>;
  /**
   * Delivers text to the agent without a thread entry. Refused while the agent runs.
   * False if the session could not take it; the failure is then in the thread as an error step.
   */
  deliver(workspace: WorkspaceId, agent: AgentId, text: string): Promise<boolean>;
  isBusy(agent: AgentId): boolean;
  stop(workspace: WorkspaceId, agent: AgentId): Promise<void>;
  requestInput(workspace: WorkspaceId, agent: AgentId, reason: string): Promise<void>;
  /** After a restart nothing is running, whatever the files say. */
  recover(): Promise<void>;
  closeAll(): void;
}

export interface AgentServiceDeps {
  store: Store;
  backend: AgentBackend;
  events: EventBus;
  clock: Clock;
  ids: Ids;
  roles: RoleRegistry;
  tools: ToolRegistry;
  posts: PostService;
  artifacts: ArtifactService;
}

/** What only exists while the server runs. */
interface Live {
  session: AgentSession;
  stopping: boolean;
  /** `request_input` was called this turn, so ending it means Needs input, not review. */
  wantsInput: boolean;
}

export function createAgentService(deps: AgentServiceDeps): AgentService {
  const { store, backend, events, clock, ids, roles, tools, posts, artifacts } = deps;
  const live = new Map<AgentId, Live>();
  const busy = new Set<AgentId>();

  const setStatus = async (workspace: WorkspaceId, agent: AgentId, status: AgentStatus) => {
    await patchAgent(workspace, agent, { status });
    events.emit({ type: 'agent.status', workspace, agent, status });
  };

  const patchAgent = (workspace: WorkspaceId, agent: AgentId, patch: Partial<Agent>) =>
    store.updateWorkspace(workspace, (w) => ({
      ...w,
      agents: w.agents.map((a) => (a.id === agent ? { ...a, ...patch } : a)),
    }));

  const addStep = async (workspace: WorkspaceId, draft: StepDraft) => {
    const step = await store.appendStep(workspace, draft);
    events.emit({ type: 'agent.step', workspace, step });
  };

  const addError = (workspace: WorkspaceId, agent: AgentId, text: string) =>
    addStep(workspace, { kind: 'error', agent, at: clock.now().toISOString(), text });

  const findAgent = async (workspace: WorkspaceId, id: AgentId) => {
    const agent = (await store.getWorkspace(workspace))?.agents.find((a) => a.id === id);
    if (!agent) throw new NotFoundError(`No agent ${id} in this workspace.`);
    return agent;
  };

  const sessionOptions = (workspace: WorkspaceId, agent: Agent): AgentSessionOptions => {
    const role = roles.get(agent.role);
    const ctx = {
      workspace,
      agent: agent.id,
      ...(role.defaultArtifactKind ? { defaultArtifactKind: role.defaultArtifactKind } : {}),
      services: { posts, artifacts, agents: service },
    };
    return {
      cwd: store.workspacePath(workspace),
      prompt: role.prompt,
      tools: role.tools.map((id) => bindTool(tools.get(id), ctx)),
    };
  };

  const handle = async (workspace: WorkspaceId, agent: AgentId, state: Live, event: AgentEvent) => {
    const at = clock.now().toISOString();
    if (event.type === 'session') return void (await patchAgent(workspace, agent, { sessionId: event.sessionId }));
    if (event.type === 'step') return addStep(workspace, { kind: 'tool', agent, at, tool: event.tool, summary: event.summary });
    if (event.type === 'text') return addStep(workspace, { kind: 'text', agent, at, text: event.text });

    busy.delete(agent);
    const { stopping, wantsInput } = state;
    state.stopping = false;
    state.wantsInput = false;
    if (stopping) return setStatus(workspace, agent, 'idle');
    if (event.outcome === 'error') {
      await addError(workspace, agent, event.error ?? 'The turn failed.');
      return setStatus(workspace, agent, 'idle');
    }
    return setStatus(workspace, agent, wantsInput ? 'input' : 'review');
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
    if (!busy.delete(agent) && !failure) return;
    await addError(workspace, agent, failure ?? 'The session ended unexpectedly.');
    await setStatus(workspace, agent, 'idle');
  };

  const open = async (workspace: WorkspaceId, agent: Agent) => {
    const existing = live.get(agent.id);
    if (existing) return existing;
    const options = sessionOptions(workspace, agent);
    const session = agent.sessionId ? await backend.resume(agent.sessionId, options) : await backend.start(options);
    const state: Live = { session, stopping: false, wantsInput: false };
    live.set(agent.id, state);
    void consume(workspace, agent.id, state);
    return state;
  };

  const deliver: AgentService['deliver'] = async (workspace, id, text) => {
    const agent = await findAgent(workspace, id);
    if (busy.has(id)) throw new ConflictError(`${agent.name} is working. Wait for it to finish, or stop it.`);
    busy.add(id);
    try {
      await setStatus(workspace, id, 'running');
      const state = await open(workspace, agent);
      await state.session.send(text);
      return true;
    } catch (error) {
      busy.delete(id);
      await addError(workspace, id, error instanceof Error ? error.message : String(error));
      await setStatus(workspace, id, 'idle');
      return false;
    }
  };

  const service: AgentService = {
    async start(workspace, roleId, instruction) {
      const role = roles.get(roleId);
      const agent: Agent = { id: ids.next(), role: role.id, name: role.name, status: 'idle' };
      await store.updateWorkspace(workspace, (w) => ({ ...w, agents: [...w.agents, agent] }));
      await posts.add(workspace, agent.id, { kind: 'message', text: instruction });
      await deliver(workspace, agent.id, instruction);
      return agent;
    },
    async send(workspace, id, text) {
      const agent = await findAgent(workspace, id);
      if (busy.has(id)) throw new ConflictError(`${agent.name} is working. Wait for it to finish, or stop it.`);
      await posts.add(workspace, id, { kind: 'message', text });
      await deliver(workspace, id, text);
    },
    deliver,
    isBusy: (agent) => busy.has(agent),
    async stop(workspace, id) {
      await findAgent(workspace, id);
      const state = live.get(id);
      if (!state || !busy.has(id)) return;
      state.stopping = true;
      await state.session.interrupt();
    },
    async requestInput(workspace, id, reason) {
      const state = live.get(id);
      if (state) state.wantsInput = true;
      await posts.add(workspace, id, { kind: 'note', title: 'Needs input', message: reason });
      await setStatus(workspace, id, 'input');
    },
    async recover() {
      for (const workspace of await store.listWorkspaces()) {
        for (const agent of workspace.agents) {
          if (agent.status === 'running') await patchAgent(workspace.id, agent.id, { status: 'idle' });
        }
      }
    },
    closeAll() {
      for (const state of live.values()) state.session.close();
      live.clear();
      busy.clear();
    },
  };
  return service;
}
