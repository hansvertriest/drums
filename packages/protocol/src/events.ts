import { z } from 'zod';
import { AgentStatus } from './agent.js';
import { AnswerSet, Artifact } from './artifact.js';
import { AgentId, ArtifactId, VersionNumber, WorkspaceId } from './ids.js';
import { Post, Step } from './post.js';

export const AgentStatusEvent = z.object({
  type: z.literal('agent.status'),
  workspace: WorkspaceId,
  agent: AgentId,
  status: AgentStatus,
});
export type AgentStatusEvent = z.infer<typeof AgentStatusEvent>;

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

export const AnswersChangedEvent = z.object({
  type: z.literal('answers.changed'),
  workspace: WorkspaceId,
  artifact: ArtifactId,
  set: AnswerSet,
});
export type AnswersChangedEvent = z.infer<typeof AnswersChangedEvent>;

/** Everything `core` announces. Add a member here to add an event. */
export const DomainEvent = z.discriminatedUnion('type', [
  AgentStatusEvent,
  AgentStepEvent,
  PostCreatedEvent,
  ArtifactVersionEvent,
  AnswersChangedEvent,
]);
export type DomainEvent = z.infer<typeof DomainEvent>;
