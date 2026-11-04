import type { Agent, WorkspaceStatus } from '@drums/protocol';

const BY_URGENCY: readonly WorkspaceStatus[] = ['input', 'review', 'running', 'idle'];

/** The state that most needs you. */
export function workspaceStatus(agents: readonly Agent[]): WorkspaceStatus {
  return BY_URGENCY.find((status) => agents.some((agent) => agent.status === status)) ?? 'idle';
}
