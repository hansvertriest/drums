import type { RoleId, WorkspaceId, WorkspaceState, WorkspaceSummary } from '@drums/protocol';
import type { AgentService } from '../agents/agent-service.js';
import type { ArtifactService } from '../artifacts/artifact-service.js';
import { NotFoundError } from '../errors.js';
import type { FeedbackService } from '../feedback/feedback-service.js';
import type { Clock } from '../ports/clock.js';
import type { Ids } from '../ports/ids.js';
import type { Store } from '../ports/store.js';
import { isAuthored } from '../posts/feed.js';
import type { PostService } from '../posts/post-service.js';
import { workspaceSlug } from './slug.js';
import { workspaceStatus } from './status.js';

export interface WorkspaceService {
  /** Creates the workspace and starts its first agent on the goal. */
  create(goal: string): Promise<WorkspaceState>;
  list(): Promise<WorkspaceSummary[]>;
  state(id: WorkspaceId): Promise<WorkspaceState>;
}

export interface WorkspaceServiceDeps {
  store: Store;
  clock: Clock;
  ids: Ids;
  agents: AgentService;
  artifacts: ArtifactService;
  posts: PostService;
  feedback: FeedbackService;
  /** The role every workspace starts with, until the role picker arrives. */
  firstRole: RoleId;
}

export function createWorkspaceService(deps: WorkspaceServiceDeps): WorkspaceService {
  const { store, clock, ids, agents, artifacts, posts, feedback, firstRole } = deps;

  const state: WorkspaceService['state'] = async (id) => {
    const workspace = await store.getWorkspace(id);
    if (!workspace) throw new NotFoundError(`No workspace ${id}.`);
    const [threadPosts, steps, artifactViews, answers] = await Promise.all([
      posts.list(id),
      store.listSteps(id),
      artifacts.list(id),
      feedback.latestAnswers(id),
    ]);
    return { workspace, posts: threadPosts, steps, artifacts: artifactViews, answers };
  };

  return {
    async create(goal) {
      const id = workspaceSlug(goal, ids.next());
      await store.createWorkspace({ id, goal, createdAt: clock.now().toISOString(), agents: [] });
      await agents.start(id, firstRole, goal);
      return state(id);
    },
    async list() {
      const workspaces = await store.listWorkspaces();
      return Promise.all(
        workspaces.map(async ({ id, goal, agents: members }) => {
          const author = (await posts.list(id)).filter(isAuthored).at(-1)?.agent;
          const lastRole = members.find((agent) => agent.id === author)?.role;
          return { id, goal, status: workspaceStatus(members), ...(lastRole ? { lastRole } : {}) };
        }),
      );
    },
    state,
  };
}
