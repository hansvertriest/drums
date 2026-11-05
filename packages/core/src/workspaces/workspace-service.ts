import type { CreateWorkspaceRequest, RoleId, WorkspaceId, WorkspaceState, WorkspaceSummary } from '@drums/protocol';
import type { AgentService } from '../agents/agent-service.js';
import type { ArtifactService } from '../artifacts/artifact-service.js';
import { branchMapArtifactKind } from '../artifacts/branch-map.js';
import type { CodeService } from '../code/code-service.js';
import { NotFoundError } from '../errors.js';
import type { FeedbackService } from '../feedback/feedback-service.js';
import type { Clock } from '../ports/clock.js';
import type { Ids } from '../ports/ids.js';
import type { RolePick, RolePicker } from '../ports/role-picker.js';
import type { Store } from '../ports/store.js';
import { isAuthored } from '../posts/feed.js';
import type { PostService } from '../posts/post-service.js';
import { pickRoles } from '../roles/pick-role.js';
import type { RoleRegistry } from '../roles/registry.js';
import { workspaceSlug } from './slug.js';
import { workspaceStatus } from './status.js';

export interface WorkspaceService {
  /** Creates the workspace, with its worktrees if repos are attached, and starts the agents drums picks for the goal. */
  create(request: Pick<CreateWorkspaceRequest, 'goal'> & Partial<CreateWorkspaceRequest>): Promise<WorkspaceState>;
  list(): Promise<WorkspaceSummary[]>;
  state(id: WorkspaceId): Promise<WorkspaceState>;
  /** Stops its agents and takes it out of the strip. Worktrees, branches and everything posted stay. */
  archive(id: WorkspaceId): Promise<void>;
  restore(id: WorkspaceId): Promise<void>;
}

export interface WorkspaceServiceDeps {
  store: Store;
  clock: Clock;
  ids: Ids;
  agents: AgentService;
  artifacts: ArtifactService;
  posts: PostService;
  feedback: FeedbackService;
  code: CodeService;
  roles: RoleRegistry;
  rolePicker: RolePicker;
  /** What a workspace starts with when the picker returns nothing usable (spec §4.4). */
  firstRole: RoleId;
}

export function createWorkspaceService(deps: WorkspaceServiceDeps): WorkspaceService {
  const { store, clock, ids, agents, artifacts, posts, feedback, code, roles, rolePicker, firstRole } = deps;

  const pick = (goal: string, hasRepos: boolean) => pickRoles({ picker: rolePicker, roles, fallback: firstRole }, { goal, hasRepos });

  const startAll = async (id: WorkspaceId, picks: readonly RolePick[]) => {
    const started = [];
    for (const { role, instruction } of picks) started.push(await agents.start(id, role, instruction));
    return started;
  };

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
    async create({ goal, repos: requested = [], branch }) {
      const id = workspaceSlug(goal, ids.next());
      const createdAt = clock.now().toISOString();
      if (requested.length === 0) {
        const { picks, title } = await pick(goal, false);
        await store.createWorkspace({ id, goal, ...(title ? { title } : {}), createdAt, agents: [], repos: [], permissions: [], nudges: {} });
        await startAll(id, picks);
        return state(id);
      }
      const name = branch ?? `drums/${id}`;
      const { repos, failedInstalls } = await code.attach(id, requested, name);
      await store.createWorkspace({ id, goal, createdAt, agents: [], repos, branch: name, permissions: [], nudges: {} });
      await artifacts.createEmpty(id, { title: branchMapArtifactKind.name, kind: branchMapArtifactKind.id });
      const { picks, title } = await pick(goal, true);
      if (title) await store.updateWorkspace(id, (w) => ({ ...w, title }));
      await code.openAll(id);
      const [first] = await startAll(id, picks);
      if (first) {
        for (const { repo, error } of failedInstalls) {
          await agents.reportError(id, first.id, `Could not install the dependencies of ${repo}: ${error}`);
        }
      }
      return state(id);
    },
    async list() {
      const workspaces = await store.listWorkspaces();
      return Promise.all(
        workspaces.map(async (workspace) => {
          const { id, goal, title, agents: members, repos, archivedAt } = workspace;
          const last = (await posts.list(id)).filter(isAuthored).at(-1);
          const lastRole = members.find((agent) => agent.id === last?.agent)?.role;
          const prs = repos.flatMap(({ pr }) => (pr ? [pr] : []));
          const counts = repos.length > 0 ? await code.changes(workspace) : undefined;
          return {
            id,
            goal,
            ...(title ? { title } : {}),
            status: workspaceStatus(members, prs.length > 0),
            ...(lastRole ? { lastRole } : {}),
            ...(last ? { lastPost: last.seq } : {}),
            ...(counts ? { additions: counts.additions, deletions: counts.deletions } : {}),
            ...(prs.length > 0 ? { prCount: prs.length, ...(prs.length === 1 ? { pr: prs[0]!.number } : {}) } : {}),
            ...(archivedAt ? { archived: true } : {}),
          };
        }),
      );
    },
    state,
    async archive(id) {
      await state(id);
      await store.updateWorkspace(id, (w) => ({ ...w, archivedAt: clock.now().toISOString() }));
      await agents.pause(id);
    },
    async restore(id) {
      await state(id);
      await store.updateWorkspace(id, (w) => ({ ...w, archivedAt: undefined }));
    },
  };
}
