import type { AgentId, ArtifactId, WorkspaceId } from '@drums/protocol';

export interface LastTabs {
  agent?: AgentId | undefined;
  artifact?: ArtifactId | undefined;
}

const key = (workspace: WorkspaceId) => `drums.tabs.${workspace}`;

/** The agent and artifact last on screen in a workspace. Per tab or window, so a new one starts on the defaults. */
export function recallTabs(workspace: WorkspaceId): LastTabs {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key(workspace)) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as LastTabs) : {};
  } catch {
    return {};
  }
}

export function rememberTabs(workspace: WorkspaceId, tabs: LastTabs): void {
  try {
    sessionStorage.setItem(key(workspace), JSON.stringify(tabs));
  } catch {
    /* Only the way back to these tabs is at stake. */
  }
}
