import type { Agent, AgentId, AgentStatus, Focus, RoleId, StepDraft, WorkspaceId } from '@drums/protocol';
import type { ArtifactService } from '../artifacts/artifact-service.js';
import { ConflictError, NotFoundError } from '../errors.js';
import type { EventBus } from '../events/event-bus.js';
import { focusBlock } from '../focus/focus-block.js';
import { workspaceOverview } from '../overview/overview.js';
import type { AgentBackend, AgentEvent, AgentSession, AgentSessionOptions } from '../ports/agent-backend.js';
import type { Clock } from '../ports/clock.js';
import type { Ids } from '../ports/ids.js';
import type { RolePicker } from '../ports/role-picker.js';
import type { Store } from '../ports/store.js';
import type { PostService } from '../posts/post-service.js';
import { pickOneRole } from '../roles/pick-role.js';
import type { RoleRegistry } from '../roles/registry.js';
import { bindTool } from '../tools/bind.js';
import type { ToolRegistry } from '../tools/registry.js';
import { uniqueAgentName } from './agent-name.js';

export interface AgentService {
  /** Adds an agent of this role to the workspace and gives it its first message, after an overview. */
  start(workspace: WorkspaceId, role: RoleId, instruction: string): Promise<Agent>;
  /** Add agent: drums picks the role from the instruction. */
  add(workspace: WorkspaceId, instruction: string): Promise<Agent>;
  /** A message from the composer: it shows in the thread and goes to the agent. Refused while the agent runs. */
  send(workspace: WorkspaceId, agent: AgentId, text: string, focus?: Focus): Promise<void>;
  /** Holds these agents for a `deliver`, all or none: refused if any of them runs, so nothing is half sent. */
  reserve(workspace: WorkspaceId, agents: AgentId[]): Promise<void>;
  release(agents: AgentId[]): void;
  /**
   * Delivers text to a reserved agent without a thread entry.
   * False if the session could not take it; the failure is then in the thread as an error step.
   */
  deliver(workspace: WorkspaceId, agent: AgentId, text: string): Promise<boolean>;
  stop(workspace: WorkspaceId, agent: AgentId): Promise<void>;
  requestInput(workspace: WorkspaceId, agent: AgentId, reason: string): Promise<void>;
  /** How tools name agents to each other. Ids mean nothing to a model. */
  namer(workspace: WorkspaceId): Promise<(agent: AgentId) => string>;
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
  rolePicker: RolePicker;
  /** What Add agent falls back on when the picker returns nothing usable. */
  firstRole: RoleId;
}

/** What only exists while the server runs. */
interface Live {
  session: AgentSession;
  stopping: boolean;
  /** `request_input` was called this turn, so ending it means Needs input, not review. */
  wantsInput: boolean;
}

export function createAgentService(deps: AgentServiceDeps): AgentService {
  const { store, backend, events, clock, ids, roles, tools, posts, artifacts, rolePicker, firstRole } = deps;
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

  const workingMessage = (names: string[]) => {
    const [verb, pronoun] = names.length === 1 ? ['is', 'it'] : ['are', 'them'];
    return `${names.join(' and ')} ${verb} working. Wait for ${pronoun} to finish, or stop ${pronoun}.`;
  };

  /** Synchronous from the check to the claim, so two callers can never both hold an agent. */
  const claim = (agent: Agent) => {
    if (busy.has(agent.id)) throw new ConflictError(workingMessage([agent.name]));
    busy.add(agent.id);
  };

  const deliver: AgentService['deliver'] = async (workspace, id, text) => {
    try {
      await setStatus(workspace, id, 'running');
      const state = await open(workspace, await findAgent(workspace, id));
      await state.session.send(text);
      return true;
    } catch (error) {
      busy.delete(id);
      await addError(workspace, id, error instanceof Error ? error.message : String(error));
      await setStatus(workspace, id, 'idle');
      return false;
    }
  };

  /** The thread entry goes in before the agent can answer. If it can't be written, the agent is free again. */
  const claimedPrepare = async <T>(id: AgentId, prepare: () => Promise<T>) => {
    try {
      return await prepare();
    } catch (error) {
      busy.delete(id);
      throw error;
    }
  };

  const service: AgentService = {
    async start(workspace, roleId, instruction) {
      const role = roles.get(roleId);
      const id = ids.next();
      const added = await store.updateWorkspace(workspace, (w) => ({
        ...w,
        agents: [...w.agents, { id, role: role.id, name: uniqueAgentName(role.name, w.agents), status: 'idle' }],
      }));
      const agent = added.agents.find((a) => a.id === id) as Agent;
      busy.add(id);
      const message = await claimedPrepare(id, async () => {
        events.emit({ type: 'agent.added', workspace, agent });
        await posts.add(workspace, id, { kind: 'message', text: instruction });
        return `${await workspaceOverview({ store, artifacts, posts }, workspace, id)}\n\n${instruction}`;
      });
      await deliver(workspace, id, message);
      return agent;
    },
    async add(workspace, instruction) {
      const overview = await workspaceOverview({ store, artifacts, posts }, workspace);
      // No workspace has repos until M3.
      const pick = await pickOneRole({ picker: rolePicker, roles, fallback: firstRole }, { instruction, overview, hasRepos: false });
      return service.start(workspace, pick.role, pick.instruction);
    },
    async send(workspace, id, text, focus) {
      const agent = await findAgent(workspace, id);
      claim(agent);
      const message = await claimedPrepare(id, async () => {
        const block = focus && focusBlock(focus, await artifacts.get(workspace, focus.artifact), await service.namer(workspace));
        await posts.add(workspace, id, { kind: 'message', text, ...(focus ? { focus } : {}) });
        return block ? `${block}\n${text}` : text;
      });
      await deliver(workspace, id, message);
    },
    async reserve(workspace, wanted) {
      const found = await Promise.all(wanted.map((id) => findAgent(workspace, id)));
      const running = found.filter((agent) => busy.has(agent.id));
      if (running.length > 0) throw new ConflictError(workingMessage(running.map((agent) => agent.name)));
      for (const id of wanted) busy.add(id);
    },
    release(agents) {
      for (const id of agents) busy.delete(id);
    },
    deliver,
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
    async namer(workspace) {
      const members = (await store.getWorkspace(workspace))?.agents ?? [];
      return (id) => members.find((agent) => agent.id === id)?.name ?? id;
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
