import type { PullRequest } from '@drums/protocol';

/** Outward-facing: opening PRs. `gh` today. */
export interface PullRequests {
  open(request: { worktree: string; base: string; head: string; title: string; body: string }): Promise<PullRequest>;
  editBody(request: { worktree: string; number: number; body: string }): Promise<void>;
}
