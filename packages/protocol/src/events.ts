import { z } from 'zod';
import { Agent, AgentStatus } from './agent.js';
import { AnswerSet, Artifact } from './artifact.js';
import { AgentId, ArtifactId, RepoName, VersionNumber, WorkspaceId } from './ids.js';
import { PermissionRequest } from './permission.js';
import { Post, Step } from './post.js';

export const AgentAddedEvent = z.object({
  type: z.literal('agent.added'),
  workspace: WorkspaceId,
  agent: Agent,
});
export type AgentAddedEvent = z.infer<typeof AgentAddedEvent>;

export const AgentStatusEvent = z.object({
  type: z.literal('agent.status'),
  workspace: WorkspaceId,
  agent: AgentId,
  status: AgentStatus,
});
export type AgentStatusEvent = z.infer<typeof AgentStatusEvent>;

export const AgentClosedEvent = z.object({
  type: z.literal('agent.closed'),
  workspace: WorkspaceId,
  agent: AgentId,
});
export type AgentClosedEvent = z.infer<typeof AgentClosedEvent>;

export const AgentStepEvent = z.object({
  type: z.literal('agent.step'),
  workspace: WorkspaceId,
  step: Step,
});
export type AgentStepEvent = z.infer<typeof AgentStepEvent>;

export const PostCreatedEvent = z.object({
  type: z.literal('post.created'),
  workspace: WorkspaceId,
  post: Post,
});
export type PostCreatedEvent = z.infer<typeof PostCreatedEvent>;

export const ArtifactVersionEvent = z.object({
  type: z.literal('artifact.version'),
  workspace: WorkspaceId,
  artifact: Artifact,
  version: VersionNumber,
});
export type ArtifactVersionEvent = z.infer<typeof ArtifactVersionEvent>;

export const ArtifactArchivedEvent = z.object({
  type: z.literal('artifact.archived'),
  workspace: WorkspaceId,
  artifact: Artifact,
});
export type ArtifactArchivedEvent = z.infer<typeof ArtifactArchivedEvent>;

export const AnswersChangedEvent = z.object({
  type: z.literal('answers.changed'),
  workspace: WorkspaceId,
  artifact: ArtifactId,
  set: AnswerSet,
});
export type AnswersChangedEvent = z.infer<typeof AnswersChangedEvent>;

/** A permission request appeared, or its answer changed. */
export const PermissionChangedEvent = z.object({
  type: z.literal('permission.changed'),
  workspace: WorkspaceId,
  request: PermissionRequest,
});
export type PermissionChangedEvent = z.infer<typeof PermissionChangedEvent>;

/** Something changed in a repo's dyffle session: a dyffle (the branch, a commit, the uncommitted changes), a build, or a review. */
export const MapChangedEvent = z.object({
  type: z.literal('map.changed'),
  workspace: WorkspaceId,
  repo: RepoName,
  aspect: z.enum(['views', 'status', 'review']),
});
export type MapChangedEvent = z.infer<typeof MapChangedEvent>;

/** Everything `core` announces. Add a member here to add an event. */
export const DomainEvent = z.discriminatedUnion('type', [
  AgentAddedEvent,
  AgentStatusEvent,
  AgentClosedEvent,
  AgentStepEvent,
  PostCreatedEvent,
  ArtifactVersionEvent,
  ArtifactArchivedEvent,
  AnswersChangedEvent,
  PermissionChangedEvent,
  MapChangedEvent,
]);
export type DomainEvent = z.infer<typeof DomainEvent>;

/**
 * The name of a second, content-free event on each workspace's stream: some workspace's line
 * in the strip changed, so fetch `GET /api/workspaces` again. It keeps the strip live with no
 * extra connection, and other workspaces' content stays off this stream.
 */
export const WORKSPACES_CHANGED = 'workspaces.changed';
