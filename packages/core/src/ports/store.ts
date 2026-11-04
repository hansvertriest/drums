import type { Workspace, WorkspaceId } from '@drums/protocol';

/** Workspaces for now; agents, posts, artifacts and answers land with their milestones. */
export interface Store {
  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: WorkspaceId): Promise<Workspace | undefined>;
  saveWorkspace(workspace: Workspace): Promise<void>;
}
