export interface WorktreeRequest {
  repo: string;
  path: string;
  branch: string;
  base: string;
}

export interface Git {
  addWorktree(request: WorktreeRequest): Promise<void>;
  push(worktree: string, branch: string): Promise<void>;
}
