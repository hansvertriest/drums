import type { AgentId, PermissionRequest, PermissionStatus, WorkspaceId } from '@drums/protocol';
import type { EventBus } from '../events/event-bus.js';
import type { Clock } from '../ports/clock.js';
import type { Store } from '../ports/store.js';

export type AgentPermissions = ReturnType<typeof createAgentPermissions>;

/** The allow/deny rows: stored with the workspace, so a reload shows them. */
export function createAgentPermissions({ store, events, clock }: { store: Store; events: EventBus; clock: Clock }) {
  const save = async (workspace: WorkspaceId, change: (requests: PermissionRequest[]) => PermissionRequest[]) => {
    const updated = await store.updateWorkspace(workspace, (w) => ({ ...w, permissions: change(w.permissions) }));
    return updated.permissions;
  };

  const announce = (workspace: WorkspaceId, request: PermissionRequest) =>
    events.emit({ type: 'permission.changed', workspace, request });

  const settle = async (workspace: WorkspaceId, id: string, status: PermissionStatus) => {
    let settled: PermissionRequest | undefined;
    await save(workspace, (requests) =>
      requests.map((request) => {
        if (request.id !== id || request.status !== 'pending') return request;
        settled = { ...request, status };
        return settled;
      }),
    );
    if (settled) announce(workspace, settled);
    return settled;
  };

  const pendingOf = async (workspace: WorkspaceId, agent: AgentId) =>
    ((await store.getWorkspace(workspace))?.permissions ?? []).filter((r) => r.agent === agent && r.status === 'pending');

  return {
    pendingOf,
    settle,
    async add(workspace: WorkspaceId, agent: AgentId, call: { id: string; tool: string; title: string; detail: string }) {
      const request: PermissionRequest = { ...call, agent, at: clock.now().toISOString(), status: 'pending' };
      await save(workspace, (requests) => [...requests, request]);
      announce(workspace, request);
    },
    /** Nobody can answer these any more. Says how many there were. */
    async expireAll(workspace: WorkspaceId, agent: AgentId) {
      const pending = await pendingOf(workspace, agent);
      for (const { id } of pending) await settle(workspace, id, 'expired');
      return pending.length;
    },
  };
}
