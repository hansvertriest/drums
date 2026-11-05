import type { Agent, AgentId, AgentStatus, StepDraft, Workspace, WorkspaceId } from '@drums/protocol';
import { ConflictError, NotFoundError } from '../errors.js';
import type { EventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Store } from '../ports/store.js';

export type AgentRecords = ReturnType<typeof createAgentRecords>;

/** Nothing new starts in an archived workspace. */
export function refuseIfArchived(workspace: Workspace | undefined): void {
  if (workspace?.archivedAt) throw new ConflictError('This workspace is archived. Restore it to carry on.');
}

/** What is stored about an agent, and the events that go with changing it. */
export function createAgentRecords({ store, events, clock }: { store: Store; events: EventBus; clock: Clock }) {
  const patch = (workspace: WorkspaceId, agent: AgentId, change: Partial<Agent>) =>
    store.updateWorkspace(workspace, (w) => ({
      ...w,
      agents: w.agents.map((a) => (a.id === agent ? { ...a, ...change } : a)),
    }));

  const locate = (workspace: Workspace | undefined, id: AgentId) => {
    const agent = workspace?.agents.find((a) => a.id === id);
    if (!agent) throw new NotFoundError(`No agent ${id} in this workspace.`);
    return agent;
  };

  const addStep = async (workspace: WorkspaceId, draft: StepDraft) => {
    const step = await store.appendStep(workspace, draft);
    events.emit({ type: 'agent.step', workspace, step });
  };

  return {
    patch,
    addStep,
    addError: (workspace: WorkspaceId, agent: AgentId, text: string) =>
      addStep(workspace, { kind: 'error', agent, at: clock.now().toISOString(), text }),
    async setStatus(workspace: WorkspaceId, agent: AgentId, status: AgentStatus) {
      await patch(workspace, agent, { status });
      events.emit({ type: 'agent.status', workspace, agent, status });
    },
    find: async (workspace: WorkspaceId, id: AgentId) => locate(await store.getWorkspace(workspace), id),
    /** The door for new work: refuses a closed agent, and every agent of an archived workspace. */
    async findOpen(workspace: WorkspaceId, id: AgentId) {
      const found = await store.getWorkspace(workspace);
      const agent = locate(found, id);
      if (agent.closed) throw new ConflictError(`${agent.name} is closed.`);
      refuseIfArchived(found);
      return agent;
    },
  };
}
