import type { AgentId, NudgeCounts, RoleId, WorkspaceId } from '@drums/protocol';
import { NotFoundError } from '../../errors.js';
import type { Clock } from '../../ports/clock.js';
import type { Store } from '../../ports/store.js';
import type { PostService } from '../../posts/post-service.js';
import type { RoleRegistry } from '../../roles/registry.js';
import type { AgentRecords } from '../agent-records.js';
import type { TurnCheckRegistry } from './registry.js';
import type { EndedTurn, TurnCheck, TurnCheckServices } from './turn-check.js';

/** What a session remembers about the turn in progress. */
export interface TurnRecord {
  startedAt: string;
  writes: string[];
  /** The checks whose nudge this turn answers. Such a turn is never nudged again. */
  answering: string[];
}

export interface Nudge {
  /** Goes to the agent as one message. */
  message: string;
  checks: string[];
}

export interface EndOfTurnDeps {
  checks: TurnCheckRegistry;
  store: Store;
  clock: Clock;
  roles: RoleRegistry;
  posts: PostService;
  records: AgentRecords;
  /** Supplied lazily: the code service is built after the agents. */
  services(): TurnCheckServices;
}

export type EndOfTurn = ReturnType<typeof createEndOfTurn>;

const asSystemMessage = (lines: readonly string[]) => `<drums-system>\n${lines.join('\n')}\n</drums-system>`;

/**
 * Runs the checks when a turn ends normally. A turn gets at most one nudge per check, all in one
 * message, and the turn that answers it gets none: there it is only settled what the agent left
 * undone. So one turn of the agent can cause one more, and never a loop.
 */
export function createEndOfTurn({ checks, store, clock, roles, posts, records, services }: EndOfTurnDeps) {
  const note = (workspace: WorkspaceId, agent: AgentId, summary: string) =>
    records.addStep(workspace, { kind: 'tool', agent, at: clock.now().toISOString(), tool: 'drums', summary });

  const endedTurn = async (workspace: WorkspaceId, id: AgentId, turn: TurnRecord): Promise<EndedTurn> => {
    const found = await store.getWorkspace(workspace);
    if (!found) throw new NotFoundError(`No workspace ${workspace}.`);
    const agent = await records.find(workspace, id);
    const all = await posts.list(workspace);
    return {
      workspace: found,
      agent,
      role: roles.get(agent.role),
      writes: turn.writes,
      posts: all.filter((post) => post.agent === id && post.at >= turn.startedAt),
    };
  };

  /** A check that can't tell (a worktree that is gone, say) must not hold up the agent. */
  const holds = async (check: TurnCheck, ended: EndedTurn) => {
    try {
      return await check.detect(ended, services());
    } catch (error) {
      await note(ended.workspace.id, ended.agent.id, `${check.id} could not run: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const count = (workspace: WorkspaceId, role: RoleId, fired: readonly TurnCheck[]) =>
    store.updateWorkspace(workspace, (w) => {
      const counts = { ...w.nudges[role] };
      for (const { id } of fired) counts[id] = (counts[id] ?? 0) + 1;
      return { ...w, nudges: { ...w.nudges, [role]: counts } };
    });

  const settle = async (ended: EndedTurn, answering: readonly string[]) => {
    for (const id of answering) {
      const check = checks.get(id);
      if (!check.whenIgnored || !(await holds(check, ended))) continue;
      try {
        await check.whenIgnored(ended, services());
        await note(ended.workspace.id, ended.agent.id, `${id}: nudged and still not done, so drums did it`);
      } catch (error) {
        await records.addError(ended.workspace.id, ended.agent.id, error instanceof Error ? error.message : String(error));
      }
    }
  };

  return {
    /** A turn ended normally. Says what to nudge the agent with, if anything. */
    async review(workspace: WorkspaceId, agent: AgentId, turn: TurnRecord): Promise<Nudge | undefined> {
      const ended = await endedTurn(workspace, agent, turn);
      if (turn.answering.length > 0) {
        await settle(ended, turn.answering);
        return undefined;
      }
      const fired: TurnCheck[] = [];
      for (const check of checks.list()) if (await holds(check, ended)) fired.push(check);
      if (fired.length === 0) return undefined;
      await count(workspace, ended.agent.role, fired);
      const ids = fired.map((check) => check.id);
      await note(workspace, agent, `Nudged: ${ids.join(', ')}`);
      return { message: asSystemMessage(fired.map((check) => check.nudge)), checks: ids };
    },
    /** Each role's nudges, over all workspaces. */
    async counts(): Promise<NudgeCounts> {
      const total: NudgeCounts = {};
      for (const { nudges } of await store.listWorkspaces()) {
        for (const [role, byCheck] of Object.entries(nudges)) {
          const sum = (total[role] ??= {});
          for (const [check, times] of Object.entries(byCheck)) sum[check] = (sum[check] ?? 0) + times;
        }
      }
      return total;
    },
  };
}
