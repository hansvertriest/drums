export interface WorktreeRequest {
  /** The repo itself. */
  repo: string;
  path: string;
  branch: string;
  base: string;
}

export interface BranchChanges {
  files: number;
  additions: number;
  deletions: number;
}

/** Throw `ConflictError` with git's own words when git refuses. */
export interface Git {
  /** Creates `branch` from `base`, or checks it out if it exists. Says which, so undoing it knows what to remove. */
  addWorktree(request: WorktreeRequest): Promise<{ createdBranch: boolean }>;
  /** Undoes `addWorktree`. */
  removeWorktree(request: { repo: string; path: string; branch?: string | undefined }): Promise<void>;
  /** Local branches, and the one to offer first. */
  branches(repo: string): Promise<{ names: string[]; current: string | undefined }>;
  /** The branch against its merge base with `base`, uncommitted and untracked files included. */
  changes(worktree: string, base: string): Promise<BranchChanges>;
  /**
   * Identifies what is in the worktree, uncommitted and untracked files included. The same
   * content gives the same id, committed or not. Changes nothing the user can see.
   */
  contentId(worktree: string): Promise<string>;
  /** Commits whatever is uncommitted. False if there was nothing. */
  commitAll(worktree: string, message: string): Promise<boolean>;
  /** To `origin`, never forced. */
  push(worktree: string, branch: string): Promise<void>;
}
