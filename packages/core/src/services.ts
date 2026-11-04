import { createAgentService, type AgentService } from './agents/agent-service.js';
import { createArtifactService, type ArtifactService } from './artifacts/artifact-service.js';
import type { ArtifactKindRegistry } from './artifacts/registry.js';
import type { EventBus } from './events/event-bus.js';
import { createFeedbackService, type FeedbackService } from './feedback/feedback-service.js';
import type { AgentBackend } from './ports/agent-backend.js';
import type { Clock } from './ports/clock.js';
import type { Ids } from './ports/ids.js';
import type { Store } from './ports/store.js';
import { createPostService, type PostService } from './posts/post-service.js';
import type { RoleRegistry } from './roles/registry.js';
import type { ToolRegistry } from './tools/registry.js';
import { createWorkspaceService, type WorkspaceService } from './workspaces/workspace-service.js';

export interface ServiceDeps {
  store: Store;
  backend: AgentBackend;
  events: EventBus;
  clock: Clock;
  ids: Ids;
  roles: RoleRegistry;
  tools: ToolRegistry;
  artifactKinds: ArtifactKindRegistry;
  firstRole: string;
}

export interface Services {
  posts: PostService;
  artifacts: ArtifactService;
  agents: AgentService;
  feedback: FeedbackService;
  workspaces: WorkspaceService;
}

/** The services need each other in a ring (artifacts → feedback → agents → artifacts), so one place ties it. */
export function createServices(deps: ServiceDeps): Services {
  const { store, backend, events, clock, ids, roles, tools, artifactKinds, firstRole } = deps;
  const posts = createPostService({ store, events, clock });
  const artifacts = createArtifactService({
    store,
    events,
    clock,
    kinds: artifactKinds,
    posts,
    onNewVersion: (workspace, artifact, previous, next) => feedback.carryOver(workspace, artifact, previous, next),
  });
  const agents = createAgentService({ store, backend, events, clock, ids, roles, tools, posts, artifacts });
  const feedback = createFeedbackService({ store, events, clock, artifacts, posts, agents: () => agents });
  const workspaces = createWorkspaceService({ store, clock, ids, agents, artifacts, posts, feedback, firstRole });
  return { posts, artifacts, agents, feedback, workspaces };
}
