import { createAgentService, type AgentService } from './agents/agent-service.js';
import { createArtifactService, type ArtifactService } from './artifacts/artifact-service.js';
import type { ArtifactKindRegistry } from './artifacts/registry.js';
import { createCodeService, type CodeService } from './code/code-service.js';
import { createCodeSessions } from './code/code-sessions.js';
import { createPrService, type PrService } from './code/pr-service.js';
import type { EventBus } from './events/event-bus.js';
import { createFeedbackService, type FeedbackService } from './feedback/feedback-service.js';
import type { AgentBackend } from './ports/agent-backend.js';
import type { Clock } from './ports/clock.js';
import type { CodeReview } from './ports/code-review.js';
import type { Git } from './ports/git.js';
import type { Ids } from './ports/ids.js';
import type { Projects } from './ports/projects.js';
import type { PullRequests } from './ports/pull-requests.js';
import type { RolePicker } from './ports/role-picker.js';
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
  rolePicker: RolePicker;
  git: Git;
  pullRequests: PullRequests;
  projects: Projects;
  codeReview: CodeReview;
  /** Where the map's frame of a repo is served. */
  viewerUrl(workspace: string, repo: string): string;
  /** The role a new workspace starts with, and the one Add agent falls back on. */
  firstRole: string;
}

export interface Services {
  posts: PostService;
  artifacts: ArtifactService;
  agents: AgentService;
  feedback: FeedbackService;
  workspaces: WorkspaceService;
  code: CodeService;
  prs: PrService;
  /** Ends what keeps running in the background. */
  close(): Promise<void>;
}

/** The services need each other in rings (artifacts → feedback → agents → artifacts, agents → code → agents), so one place ties them. */
export function createServices(deps: ServiceDeps): Services {
  const { store, backend, events, clock, ids, roles, tools, artifactKinds, rolePicker, firstRole } = deps;
  const { git, pullRequests, projects, codeReview, viewerUrl } = deps;
  const posts = createPostService({ store, events, clock });
  const artifacts = createArtifactService({
    store,
    events,
    clock,
    kinds: artifactKinds,
    posts,
    onNewVersion: (workspace, artifact, previous, next) => feedback.carryOver(workspace, artifact, previous, next),
  });
  const agents = createAgentService({ store, backend, events, clock, ids, roles, tools, posts, artifacts, rolePicker, firstRole, code: () => code });
  const sessions = createCodeSessions({ codeReview, store, events, viewerUrl });
  const code = createCodeService({ store, git, projects, codeReview, sessions, artifacts, namer: agents.namer });
  const prs = createPrService({ store, events, git, pullRequests, sessions, agents: () => agents });
  const feedback = createFeedbackService({ store, events, clock, artifacts, posts, agents: () => agents, code: () => code, roles });
  const workspaces = createWorkspaceService({ store, clock, ids, agents, artifacts, posts, feedback, code, roles, firstRole });
  return {
    posts,
    artifacts,
    agents,
    feedback,
    workspaces,
    code,
    prs,
    async close() {
      agents.closeAll();
      await sessions.stopAll();
    },
  };
}
