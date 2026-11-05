import { createAgentService, type AgentService } from './agents/agent-service.js';
import type { TurnCheckRegistry } from './agents/turn-checks/registry.js';
import { createArtifactService, type ArtifactService } from './artifacts/artifact-service.js';
import type { ArtifactKindRegistry } from './artifacts/registry.js';
import { createCodeService, type CodeService } from './code/code-service.js';
import { createCheckpoints } from './code/checkpoints.js';
import { createCodeSessions } from './code/code-sessions.js';
import { createSessionKeeper } from './code/session-keeper.js';
import { createPrService, type PrService } from './code/pr-service.js';
import type { EventBus } from './events/event-bus.js';
import { createFeedbackService, type FeedbackService } from './feedback/feedback-service.js';
import type { AgentBackend } from './ports/agent-backend.js';
import type { Clock } from './ports/clock.js';
import type { CodeReview } from './ports/code-review.js';
import type { Dependencies } from './ports/dependencies.js';
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
  turnChecks: TurnCheckRegistry;
  rolePicker: RolePicker;
  git: Git;
  dependencies: Dependencies;
  pullRequests: PullRequests;
  projects: Projects;
  codeReview: CodeReview;
  /** Where the map's frame of a repo is served. */
  viewerUrl(workspace: string, repo: string): string;
  /** The role drums falls back on when the picker returns nothing usable. */
  firstRole: string;
  /** How long a workspace's code sessions outlast the last reason to keep them, so a reload doesn't churn them. */
  sessionGraceMs: number;
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
  const { store, backend, events, clock, ids, roles, tools, artifactKinds, turnChecks, rolePicker, firstRole } = deps;
  const { git, dependencies, pullRequests, projects, codeReview, viewerUrl, sessionGraceMs } = deps;
  const posts = createPostService({ store, events, clock });
  const artifacts = createArtifactService({
    store,
    events,
    clock,
    kinds: artifactKinds,
    posts,
    onNewVersion: (workspace, artifact, previous, next) => feedback.carryOver(workspace, artifact, previous, next),
  });
  const agents = createAgentService({ store, backend, events, clock, ids, roles, tools, posts, artifacts, rolePicker, turnChecks, firstRole, code: () => code });
  const sessions = createSessionKeeper(createCodeSessions({ codeReview, store, events, viewerUrl }), { store, events, clock, graceMs: sessionGraceMs });
  const checkpoints = createCheckpoints({ store, git, sessions, artifacts, namer: agents.namer });
  const code = createCodeService({ store, git, dependencies, projects, codeReview, sessions, checkpoints });
  const prs = createPrService({ store, events, git, pullRequests, sessions, agents: () => agents });
  const feedback = createFeedbackService({ store, events, clock, artifacts, posts, agents: () => agents, code: () => code, roles });
  const workspaces = createWorkspaceService({ store, clock, ids, agents, artifacts, posts, feedback, code, roles, rolePicker, firstRole });
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
      await sessions.close();
    },
  };
}
