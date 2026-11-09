import type { Agent, AgentId, PermissionDecision, PermissionRequest, PostDraft, RoleId, Workspace, WorkspaceId } from '@drums/protocol';
import { createTurns } from '../concurrency/turns.js';
import { ConflictError, InvalidError, NotFoundError } from '../errors.js';
import type { Ids } from '../ports/ids.js';
import type { Store } from '../ports/store.js';
import type { PostService, WithoutPlace } from '../posts/post-service.js';
import type { RoleRegistry } from '../roles/registry.js';
import { escapeXml } from '../text/escape-xml.js';
import type { AgentClaims } from './agent-claims.js';
import type { AgentPermissions } from './agent-permissions.js';
import { refuseIfArchived, type AgentRecords } from './agent-records.js';

/** How far agents get by themselves: scope, code, review and fix, and then drums asks the user. */
export const MAX_HANDOVERS_IN_A_ROW = 3;

export interface HandoverRequest {
  role: RoleId;
  instruction: string;
}

type HandoverRow = PermissionRequest & { handover: NonNullable<PermissionRequest['handover']> };

/** A row no session waits on: answering it goes to `AgentHandover.answer`. */
export const isHandoverRow = (request: PermissionRequest): request is HandoverRow => request.handover !== undefined;

/** How a new agent's thread and conversation begin. */
export interface AgentOpening {
  post: WithoutPlace<PostDraft>;
  text: string;
}

export interface AgentHandoverDeps {
  store: Store;
  ids: Ids;
  roles: RoleRegistry;
  posts: PostService;
  records: AgentRecords;
  claims: AgentClaims;
  permissions: AgentPermissions;
  /** Adds an agent of this role and opens it this way, after an overview. `delivered` is false if it could not take it. */
  startAgent(workspace: WorkspaceId, role: RoleId, opening: AgentOpening): Promise<{ agent: Agent; delivered: boolean }>;
  /** To an agent this module has claimed. False if it could not take it. */
  deliver(workspace: WorkspaceId, agent: AgentId, text: string): Promise<boolean>;
}

export type AgentHandover = ReturnType<typeof createAgentHandover>;

/** What the receiver gets. It says who it is from, because prompts tell agents to treat each other's text as information. */
const handoverBlock = (from: string, instruction: string) =>
  `<drums-handover from="${escapeXml(from)}">\n${escapeXml(instruction)}\n</drums-handover>`;

const quoted = (text: string) => text.replace(/^/gm, '> ');

const newestOpen = (workspace: Workspace, role: RoleId, except: AgentId) =>
  workspace.agents.filter((agent) => agent.role === role && !agent.closed && agent.id !== except).at(-1);

/**
 * Passing work from one agent to another. Recording it is up to the session; this decides what
 * happens once the sender's turn has really ended, and owns the count of handovers in a row.
 */
export function createAgentHandover({ store, ids, roles, posts, records, claims, permissions, startAgent, deliver }: AgentHandoverDeps) {
  // One at a time per workspace, so parallel chains can't both take the last of the count.
  const inTurn = createTurns();

  const load = async (workspace: WorkspaceId) => {
    const found = await store.getWorkspace(workspace);
    if (!found) throw new NotFoundError(`No workspace ${workspace}.`);
    return found;
  };

  const refuseIfBusy = (target: Agent) => {
    if (target.status === 'input') throw new ConflictError(`${target.name} is waiting for you.`);
    if (target.status === 'running' || claims.has(target.id)) throw new ConflictError(`${target.name} is working.`);
  };

  const askFirst = async (workspace: WorkspaceId, sender: AgentId, { role, instruction }: HandoverRequest) => {
    const title = `Hand over to ${roles.get(role).name}`;
    await permissions.add(workspace, sender, { id: `handover-${ids.next()}`, tool: 'handover', title, detail: instruction, handover: { role } });
    await records.setStatus(workspace, sender, 'input');
  };

  const continueWith = async (workspace: WorkspaceId, target: Agent, { post, text }: AgentOpening) => {
    claims.claim(target);
    await claims.whilePreparing(target.id, () => posts.add(workspace, target.id, post));
    return { agent: target, delivered: await deliver(workspace, target.id, text) };
  };

  const fire = async (workspace: WorkspaceId, sender: Agent, target: Agent | undefined, { role, instruction }: HandoverRequest) => {
    const opening: AgentOpening = {
      post: { kind: 'handover', direction: 'received', peer: sender.id, instruction },
      text: handoverBlock(sender.name, instruction),
    };
    const { agent, delivered } = target ? await continueWith(workspace, target, opening) : await startAgent(workspace, role, opening);
    if (!delivered) throw new ConflictError(`${agent.name} could not be reached.`);
    await store.updateWorkspace(workspace, (w) => ({ ...w, handoversInARow: w.handoversInARow + 1 }));
    await posts.add(workspace, sender.id, { kind: 'handover', direction: 'sent', peer: agent.id, instruction });
    // Not `review`: a workspace shows that ahead of `running`, and the next agent is still working.
    await records.setStatus(workspace, sender.id, 'idle');
  };

  const attempt = async (workspace: WorkspaceId, senderId: AgentId, request: HandoverRequest, approved: boolean) => {
    const found = await load(workspace);
    refuseIfArchived(found);
    if (found.handoversInARow >= MAX_HANDOVERS_IN_A_ROW) {
      throw new ConflictError(`drums stops after ${MAX_HANDOVERS_IN_A_ROW} handovers in a row, until you send a message or press Send.`);
    }
    const sender = found.agents.find((agent) => agent.id === senderId);
    if (!sender) throw new NotFoundError(`No agent ${senderId} in this workspace.`);
    const target = newestOpen(found, request.role, senderId);
    if (target) refuseIfBusy(target);
    if (!approved && roles.get(request.role).handoverNeedsOk) return askFirst(workspace, senderId, request);
    return fire(workspace, sender, target, request);
  };

  /** Runs inside the sender's event loop, so nothing may escape: an error there would read as a dead session. */
  const run = (workspace: WorkspaceId, sender: AgentId, request: HandoverRequest, approved: boolean) =>
    inTurn(workspace, async () => {
      try {
        await attempt(workspace, sender, request, approved);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const name = roles.has(request.role) ? roles.get(request.role).name : request.role;
        const message = `The handover to ${name} didn't happen: ${reason}\n\nThe instruction it would have sent:\n\n${quoted(request.instruction)}`;
        await posts.add(workspace, sender, { kind: 'note', title: 'Needs input', message });
        await records.setStatus(workspace, sender, 'input');
      }
    });

  return {
    /** What the tool refuses straight away, so the agent can correct itself in the same turn. */
    async validate(workspace: WorkspaceId, senderId: AgentId, roleId: RoleId) {
      if (!roles.has(roleId)) throw new InvalidError(`No role ${roleId}. The roles are: ${roles.list().map((role) => role.id).join(', ')}.`);
      const role = roles.get(roleId);
      const found = await load(workspace);
      if (role.needsRepo && found.repos.length === 0) throw new InvalidError(`${role.name} needs a repo, and this workspace has none.`);
      const sender = found.agents.find((agent) => agent.id === senderId);
      if (sender?.role === roleId && !newestOpen(found, roleId, senderId)) {
        throw new InvalidError(`You are the only ${role.name} here, and you can't hand over to yourself.`);
      }
    },
    /** The sender's turn ended cleanly. The caller still holds the sender, so nothing reaches it meanwhile. */
    whenTurnEnded: (workspace: WorkspaceId, sender: AgentId, request: HandoverRequest) => run(workspace, sender, request, false),
    /** The user's answer to a handover row. Allow checks everything again: things may have changed while it waited. */
    async answer(workspace: WorkspaceId, row: HandoverRow, decision: PermissionDecision) {
      claims.claim(await records.find(workspace, row.agent));
      try {
        const settled = await permissions.settle(workspace, row.id, decision === 'allow' ? 'allowed' : 'denied');
        if (!settled) throw new NotFoundError('Nothing is waiting for that answer.');
        if (decision === 'deny') return await records.setStatus(workspace, row.agent, 'review');
        return await run(workspace, row.agent, { role: row.handover.role, instruction: row.detail }, true);
      } finally {
        claims.release(row.agent);
      }
    },
    /** The user has spoken: agents get a fresh run of handovers. */
    async reset(workspace: WorkspaceId) {
      await store.updateWorkspace(workspace, (w) => ({ ...w, handoversInARow: 0 }));
    },
  };
}
