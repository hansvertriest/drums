import { z } from 'zod';
import { Agent } from './agent.js';
import { BranchName, RepoName, RoleId, WorkspaceId } from './ids.js';
import { PermissionRequest } from './permission.js';

export const PullRequest = z.object({
  number: z.number().int().positive(),
  url: z.string().min(1),
});
export type PullRequest = z.infer<typeof PullRequest>;

/** A repo attached to a workspace: a worktree of `source`, in the folder named `name`. */
export const WorkspaceRepo = z.object({
  name: RepoName,
  /** Where the repo itself is. Never shown. */
  source: z.string().min(1),
  /** The branch this one was started from. */
  base: BranchName,
  pr: PullRequest.optional(),
  /** The description as the user wrote it: each link added later goes on top of this. */
  prBody: z.string().optional(),
  /** Marks of the review comments Send already delivered, so they go once. */
  delivered: z.array(z.string()).default([]),
});
export type WorkspaceRepo = z.infer<typeof WorkspaceRepo>;

export const Workspace = z.object({
  id: WorkspaceId,
  goal: z.string().min(1),
  createdAt: z.iso.datetime(),
  agents: z.array(Agent),
  repos: z.array(WorkspaceRepo).default([]),
  /** Shared by all its repos; absent without repos. */
  branch: BranchName.optional(),
  /** Every permission request, answered or not: the thread shows them as rows. */
  permissions: z.array(PermissionRequest).default([]),
});
export type Workspace = z.infer<typeof Workspace>;

/** The state that most needs you. */
export const WorkspaceStatus = z.enum(['input', 'review', 'running', 'pr', 'idle']);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatus>;

export const WorkspaceSummary = z.object({
  id: WorkspaceId,
  goal: z.string(),
  status: WorkspaceStatus,
  /** The role that posted last, for the strip. */
  lastRole: RoleId.optional(),
  /** Line counts of the branch, on code. */
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
  /** The open PR's number, when there is exactly one. */
  pr: z.number().int().positive().optional(),
  prCount: z.number().int().nonnegative().optional(),
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummary>;
