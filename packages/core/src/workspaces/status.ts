import type { Agent, WorkspaceStatus } from '@drums/protocol';

const BY_URGENCY: readonly WorkspaceStatus[] = ['input', 'review', 'running'];

/** The state that most needs you. */
export function workspaceStatus(agents: readonly Agent[]): WorkspaceStatus {
  const urgent = BY_URGENCY.find((status) => agents.some((agent) => agent.status === status));
  return urgent ?? 'idle';
}
