import type { Agent, AgentId, Focus, NudgeCounts, PermissionDecision, RoleId, WorkspaceId } from '@drums/protocol';
import type { ArtifactService } from '../artifacts/artifact-service.js';
import type { CodeService } from '../code/code-service.js';
import type { EventBus } from '../events/event-bus.js';
import { focusBlock } from '../focus/focus-block.js';
import { imagesBlock, savePastedImages, type PastedImage } from '../images/pasted-images.js';
import { workspaceOverview } from '../overview/overview.js';
import type { AgentBackend } from '../ports/agent-backend.js';
import type { Clock } from '../ports/clock.js';
import type { Ids } from '../ports/ids.js';
import type { RolePicker } from '../ports/role-picker.js';
import type { Store } from '../ports/store.js';
import type { PostService } from '../posts/post-service.js';
import { pickOneRole } from '../roles/pick-role.js';
import type { RoleRegistry } from '../roles/registry.js';
import { bindTool } from '../tools/bind.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolServices } from '../tools/tool-definition.js';
import { createAgentClaims } from './agent-claims.js';
import { createAgentHandover, isHandoverRow, type AgentOpening, type HandoverRequest } from './agent-handover.js';
import { uniqueAgentName } from './agent-name.js';
import { createAgentPermissions } from './agent-permissions.js';
import { createAgentRecords, refuseIfArchived } from './agent-records.js';
import { createAgentSessions } from './agent-sessions.js';
import { createEndOfTurn } from './turn-checks/end-of-turn.js';
import type { TurnCheckRegistry } from './turn-checks/registry.js';

export interface AgentService {
  /** Adds an agent of this role to the workspace and gives it its first message, after an overview. */
  start(workspace: WorkspaceId, role: RoleId, instruction: string): Promise<Agent>;
  /** A line in this agent's thread about something that went wrong around it. */
  reportError(workspace: WorkspaceId, agent: AgentId, text: string): Promise<void>;
  /** Add agent: drums picks the role from the instruction. */
  add(workspace: WorkspaceId, instruction: string): Promise<Agent>;
  /** A message from the composer: it shows in the thread and goes to the agent. Refused while the agent runs. */
  send(workspace: WorkspaceId, agent: AgentId, text: string, focus?: Focus, images?: PastedImage[]): Promise<void>;
  /** Holds these agents for a `deliver`, all or none: refused if any of them runs, so nothing is half sent. */
  reserve(workspace: WorkspaceId, agents: AgentId[]): Promise<void>;
  release(agents: AgentId[]): void;
  /**
   * Delivers text to a reserved agent without a thread entry.
   * False if the session could not take it; the failure is then in the thread as an error step.
   */
  deliver(workspace: WorkspaceId, agent: AgentId, text: string): Promise<boolean>;
  stop(workspace: WorkspaceId, agent: AgentId): Promise<void>;
  /** Ends the agent's session, whatever it was doing, and takes it out of the workspace. What it posted stays. */
  close(workspace: WorkspaceId, agent: AgentId): Promise<void>;
  /** Ends every session in the workspace, as for archiving. The agents resume with their next message. */
  pause(workspace: WorkspaceId): Promise<void>;
  requestInput(workspace: WorkspaceId, agent: AgentId, reason: string): Promise<void>;
  /** Records a handover, to fire when the agent's turn really ends. A refusal says why, so the agent can correct it. */
  handover(workspace: WorkspaceId, agent: AgentId, request: HandoverRequest): Promise<void>;
  /** The user sent something, so agents get a fresh run of handovers. */
  resetHandovers(workspace: WorkspaceId): Promise<void>;
  /** Allow or deny a call the agent's turn is waiting on, or a handover waiting for the user's OK. */
  answerPermission(workspace: WorkspaceId, agent: AgentId, id: string, decision: PermissionDecision): Promise<void>;
  /** How tools name agents to each other. Ids mean nothing to a model. */
  namer(workspace: WorkspaceId): Promise<(agent: AgentId) => string>;
  /** How often the end-of-turn checks had to nudge each role, over all workspaces. */
  nudges(): Promise<NudgeCounts>;
  /**
   * After a restart nothing is running, whatever the files say. A permission request whose session
   * is gone can't be answered: its row says so, and the agent goes idle instead of waiting forever.
   */
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
  turnChecks: TurnCheckRegistry;
  /** Supplied lazily: the code service is made after this one. */
  code: () => CodeService;
  /** What Add agent falls back on when the picker returns nothing usable. */
  firstRole: RoleId;
}

export function createAgentService(deps: AgentServiceDeps): AgentService {
  const { store, backend, events, clock, ids, roles, tools, posts, artifacts, rolePicker, turnChecks, firstRole } = deps;
  const records = createAgentRecords({ store, events, clock });
  const claims = createAgentClaims();
  const permissions = createAgentPermissions({ store, events, clock });
  const endOfTurn = createEndOfTurn({ checks: turnChecks, store, clock, roles, posts, records, services: () => ({ code: deps.code() }) });
  const sessions = createAgentSessions({
    backend,
    clock,
    records,
    claims,
    permissions,
    endOfTurn,
    overview: (workspace, agent) => overview(workspace, agent),
    handOver: (workspace, sender, request) => handover.whenTurnEnded(workspace, sender, request),
    options(workspace, agent) {
      const role = roles.get(agent.role);
      const ctx = {
        workspace,
        agent: agent.id,
        ...(role.defaultArtifactKind ? { defaultArtifactKind: role.defaultArtifactKind } : {}),
        services: { posts, artifacts, agents: service, code: lazyCode },
      };
      return {
        cwd: store.workspacePath(workspace),
        prompt: role.prompt,
        tools: role.tools.map((id) => bindTool(tools.get(id), ctx)),
        access: role.access ?? 'tools-only',
      };
    },
  });
  const lazyCode: ToolServices['code'] = {
    impact: (...args) => deps.code().impact(...args),
  };
  const overview = (workspace: WorkspaceId, reader?: AgentId) =>
    workspaceOverview({ store, artifacts, posts, roles, code: deps.code }, workspace, reader);

  /** The agent is new, so the overview goes in front of what it is told. */
  const startAgent = async (workspace: WorkspaceId, roleId: RoleId, { post, text }: AgentOpening) => {
    const role = roles.get(roleId);
    const id = ids.next();
    const added = await store.updateWorkspace(workspace, (w) => ({
      ...w,
      agents: [...w.agents, { id, role: role.id, name: uniqueAgentName(role.name, w.agents), status: 'idle' }],
    }));
    const agent = added.agents.find((a) => a.id === id) as Agent;
    claims.add(id);
    const message = await claims.whilePreparing(id, async () => {
      events.emit({ type: 'agent.added', workspace, agent });
      await posts.add(workspace, id, post);
      return `${await overview(workspace, id)}\n\n${text}`;
    });
    return { agent, delivered: await sessions.deliver(workspace, id, message) };
  };

  const handover = createAgentHandover({ store, ids, roles, posts, records, claims, permissions, startAgent, deliver: sessions.deliver });

  const service: AgentService = {
    async start(workspace, roleId, instruction) {
      const { agent } = await startAgent(workspace, roleId, { post: { kind: 'message', text: instruction }, text: instruction });
      return agent;
    },
    reportError: (workspace, agent, text) => records.addError(workspace, agent, text),
    async add(workspace, instruction) {
      const [view, found] = await Promise.all([overview(workspace), store.getWorkspace(workspace)]);
      refuseIfArchived(found);
      const hasRepos = (found?.repos.length ?? 0) > 0;
      const pick = await pickOneRole({ picker: rolePicker, roles, fallback: firstRole }, { instruction, overview: view, hasRepos });
      return service.start(workspace, pick.role, pick.instruction);
    },
    async send(workspace, id, text, focus, images = []) {
      const agent = await records.findOpen(workspace, id);
      claims.claim(agent);
      const message = await claims.whilePreparing(id, async () => {
        await handover.reset(workspace);
        const block = focus && focusBlock(focus, await artifacts.get(workspace, focus.artifact), await service.namer(workspace));
        const saved = await savePastedImages(store, ids, workspace, images);
        await posts.add(workspace, id, { kind: 'message', text, ...(focus ? { focus } : {}), ...(saved.length > 0 ? { images: saved.map(({ name }) => name) } : {}) });
        return `${block ? `${block}\n` : ''}${text}${imagesBlock(saved)}`;
      });
      await sessions.deliver(workspace, id, message);
    },
    async reserve(workspace, wanted) {
      claims.claimAll(await Promise.all(wanted.map((id) => records.findOpen(workspace, id))));
    },
    release(agents) {
      for (const id of agents) claims.release(id);
    },
    deliver: sessions.deliver,
    stop: sessions.stop,
    async close(workspace, id) {
      await records.findOpen(workspace, id);
      sessions.close(id);
      await permissions.expireAll(workspace, id);
      await records.patch(workspace, id, { closed: true, status: 'idle' });
      events.emit({ type: 'agent.closed', workspace, agent: id });
    },
    async pause(workspace) {
      for (const agent of (await store.getWorkspace(workspace))?.agents ?? []) {
        sessions.close(agent.id);
        const expired = await permissions.expireAll(workspace, agent.id);
        if (agent.status === 'running' || expired > 0) await records.setStatus(workspace, agent.id, 'idle');
      }
    },
    async requestInput(workspace, id, reason) {
      sessions.wantsInput(id);
      await posts.add(workspace, id, { kind: 'note', title: 'Needs input', message: reason });
      await records.setStatus(workspace, id, 'input');
    },
    async handover(workspace, id, request) {
      await handover.validate(workspace, id, request.role);
      sessions.requestHandover(id, request);
    },
    resetHandovers: (workspace) => handover.reset(workspace),
    async answerPermission(workspace, agent, id, decision) {
      const row = (await permissions.pendingOf(workspace, agent)).find((request) => request.id === id);
      if (row && isHandoverRow(row)) return handover.answer(workspace, row, decision);
      return sessions.answer(workspace, agent, id, decision);
    },
    async namer(workspace) {
      const members = (await store.getWorkspace(workspace))?.agents ?? [];
      return (id) => members.find((agent) => agent.id === id)?.name ?? id;
    },
    async recover() {
      for (const workspace of await store.listWorkspaces()) {
        for (const agent of workspace.agents) {
          const expired = await permissions.expireAll(workspace.id, agent.id);
          if (expired > 0) {
            await records.addError(workspace.id, agent.id, 'drums restarted while this waited for your answer, so the call never ran. Send a message to carry on.');
          }
          if (agent.status === 'running' || expired > 0) await records.patch(workspace.id, agent.id, { status: 'idle' });
        }
      }
    },
    nudges: endOfTurn.counts,
    closeAll: sessions.closeAll,
  };
  return service;
}
