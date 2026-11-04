import { z } from 'zod';
import { AnswerSet, Answers, Artifact, ArtifactVersion } from './artifact.js';
import { ArtifactKindId, RoleId, ToolId, VersionNumber } from './ids.js';
import { Post, Step } from './post.js';
import { Workspace, WorkspaceSummary } from './workspace.js';

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

/** `POST /api/workspaces`. Repos and branch join with M3. */
export const CreateWorkspaceRequest = z.object({ goal: z.string().trim().min(1).max(20_000) });
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

/** `POST /api/workspaces/:ws/agents/:a/messages`. `focus` joins with M2. */
export const SendMessageRequest = z.object({ text: z.string().trim().min(1).max(100_000) });
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
export const SendFeedbackRequest = z.object({ overall: z.string().trim().max(100_000).optional() });
export type SendFeedbackRequest = z.infer<typeof SendFeedbackRequest>;
