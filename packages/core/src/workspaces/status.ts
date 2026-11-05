import type { Agent, WorkspaceStatus } from '@drums/protocol';

const BY_URGENCY: ReadonlyArray<Exclude<WorkspaceStatus, 'pr'>> = ['input', 'review', 'running'];

/** The state that most needs you. Open PRs only show once no agent wants you. */
export function workspaceStatus(agents: readonly Agent[], hasOpenPrs = false): WorkspaceStatus {
  const urgent = BY_URGENCY.find((status) => agents.some((agent) => agent.status === status));
  return urgent ?? (hasOpenPrs ? 'pr' : 'idle');
}
