import { z } from 'zod';
import { AnswerSet, Answers, Artifact, ArtifactVersion } from './artifact.js';
import { Focus } from './focus.js';
import { AgentId, ArtifactKindId, BranchName, RepoName, RoleId, ToolId, VersionNumber } from './ids.js';
import { PermissionDecision } from './permission.js';
import { Post, Step } from './post.js';
import { PullRequest, Workspace, WorkspaceSummary } from './workspace.js';

/** `GET /api/health` */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  time: z.iso.datetime(),
  roles: z.array(RoleId),
  tools: z.array(ToolId),
  artifactKinds: z.array(ArtifactKindId),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Every refused request answers with this. */
export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;

/** `GET /api/workspaces` */
export const WorkspaceList = z.array(WorkspaceSummary);
export type WorkspaceList = z.infer<typeof WorkspaceList>;

/** `POST /api/workspaces` */
export const CreateWorkspaceRequest = z.object({
  goal: z.string().trim().min(1).max(20_000),
  repos: z.array(z.object({ name: RepoName, base: BranchName })).max(20).default([]),
  branch: BranchName.optional(),
});
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequest>;

/** `GET /api/workspaces/:ws`: everything the page needs but version content. */
export const WorkspaceState = z.object({
  workspace: Workspace,
  posts: z.array(Post),
  steps: z.array(Step),
  artifacts: z.array(Artifact),
  /** The latest version's answers per artifact, pending or sent. */
  answers: z.array(AnswerSet),
});
export type WorkspaceState = z.infer<typeof WorkspaceState>;

/** `POST /api/workspaces/:ws/agents`: drums picks the role. Answers with the new `Agent`. */
export const AddAgentRequest = z.object({ instruction: z.string().trim().min(1).max(20_000) });
export type AddAgentRequest = z.infer<typeof AddAgentRequest>;

/** `POST /api/workspaces/:ws/agents/:a/messages` */
export const SendMessageRequest = z.object({
  text: z.string().trim().min(1).max(100_000),
  focus: Focus.optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

/** `GET /api/workspaces/:ws/artifacts/:id/versions/:v` */
export const VersionResponse = z.object({
  version: ArtifactVersion,
  content: z.string(),
  /** Answers given on this version, so an old version shows what was sent. */
  answers: Answers,
});
export type VersionResponse = z.infer<typeof VersionResponse>;

/** `PUT /api/workspaces/:ws/artifacts/:id/answers` */
export const SaveAnswersRequest = z.object({ version: VersionNumber, answers: Answers });
export type SaveAnswersRequest = z.infer<typeof SaveAnswersRequest>;

/** `POST /api/workspaces/:ws/send` */
export const SendFeedbackRequest = z.object({
  overall: z.string().trim().max(100_000).optional(),
  /** Who gets the note when there are no answers to go with: the tab the user has open. */
  to: AgentId.optional(),
});
export type SendFeedbackRequest = z.infer<typeof SendFeedbackRequest>;

/** `GET /api/projects`: the repos a new workspace can attach, by name. No folder paths. */
export const ProjectList = z.array(
  z.object({
    name: RepoName,
    branches: z.array(BranchName),
    /** The branch to offer first. */
    base: BranchName,
  }),
);
export type ProjectList = z.infer<typeof ProjectList>;

const Changes = {
  files: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
};

/** `GET /api/workspaces/:ws/map`: what the page needs around the map's frames. */
export const MapState = z.object({
  branch: BranchName.optional(),
  /** Who Send gives the code comments to. */
  commentsTo: AgentId.optional(),
  repos: z.array(
    z.object({
      name: RepoName,
      base: BranchName,
      ...Changes,
      /** Where the frame goes; absent while the repo's session can't run. */
      viewer: z.string().optional(),
      /** Why it can't. */
      error: z.string().optional(),
      /** Comments Send hasn't delivered yet. */
      pendingComments: z.number().int().nonnegative(),
      pr: PullRequest.optional(),
    }),
  ),
});
export type MapState = z.infer<typeof MapState>;

/** `GET /api/workspaces/:ws/prs`: what the Open PRs dialog starts with. */
export const PrDrafts = z.object({
  title: z.string(),
  branch: BranchName.optional(),
  repos: z.array(z.object({ name: RepoName, base: BranchName, ...Changes, body: z.string(), pr: PullRequest.optional() })),
});
export type PrDrafts = z.infer<typeof PrDrafts>;

/** `POST /api/workspaces/:ws/prs`: one per repo, all with this title. */
export const OpenPrsRequest = z.object({
  title: z.string().trim().min(1).max(300),
  repos: z.array(z.object({ name: RepoName, body: z.string().max(100_000) })).min(1).max(20),
});
export type OpenPrsRequest = z.infer<typeof OpenPrsRequest>;

export const OpenPrsResponse = z.object({ prs: z.array(z.object({ repo: RepoName, pr: PullRequest })) });
export type OpenPrsResponse = z.infer<typeof OpenPrsResponse>;

/** `POST /api/workspaces/:ws/agents/:a/permissions/:id` */
export const AnswerPermissionRequest = z.object({ decision: PermissionDecision });
export type AnswerPermissionRequest = z.infer<typeof AnswerPermissionRequest>;
