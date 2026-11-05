import type { MapState, ProjectList, Workspace, WorkspaceId, WorkspaceRepo } from '@drums/protocol';
import { ConflictError, InvalidError, NotFoundError } from '../errors.js';
import type { BranchChanges, Git } from '../ports/git.js';
import type { CodeReview, ImpactResult, MapSource, PendingReview } from '../ports/code-review.js';
import type { Projects } from '../ports/projects.js';
import type { Store } from '../ports/store.js';
import type { Checkpoints } from './checkpoints.js';
import { findRepo } from './code-sessions.js';
import type { KeptSessions } from './session-keeper.js';

export type { CheckpointResult } from './checkpoints.js';

export interface PendingCode extends PendingReview {
  repo: string;
}

export interface CodeService extends Checkpoints {
  projects(): Promise<ProjectList>;
  /** Worktrees for a new workspace: all or none. Sessions start with `openAll`, once the workspace exists. */
  attach(workspace: WorkspaceId, requested: ReadonlyArray<{ name: string; base: string }>, branch: string): Promise<WorkspaceRepo[]>;
  /** Starts the sessions now, so the first checkpoint measures from here. Those that can't run try again on demand. */
  openAll(workspace: WorkspaceId): Promise<void>;
  impact(workspace: WorkspaceId, target?: string): Promise<{ found: boolean; text: string }>;
  mapState(workspace: WorkspaceId): Promise<MapState>;
  /** What the frame of one repo reads and writes. */
  mapSource(workspace: WorkspaceId, repo: string): Promise<MapSource>;
  viewerHtml(): string;
  /** Someone has this workspace open, so its sessions stay. Call what it returns when they leave. */
  view(workspace: WorkspaceId): () => void;
  changes(workspace: Workspace): Promise<BranchChanges>;
  /** Comments Send hasn't delivered, per repo that has any. */
  pendingReviews(workspace: WorkspaceId): Promise<PendingCode[]>;
  markDelivered(workspace: WorkspaceId, repo: string, marks: readonly string[]): Promise<void>;
}

export interface CodeServiceDeps {
  store: Store;
  git: Git;
  projects: Projects;
  codeReview: CodeReview;
  sessions: KeptSessions;
  checkpoints: Checkpoints;
}

const NONE: BranchChanges = { files: 0, additions: 0, deletions: 0 };
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createCodeService(deps: CodeServiceDeps): CodeService {
  const { store, git, projects, codeReview, sessions, checkpoints } = deps;

  const load = async (id: WorkspaceId) => {
    const workspace = await store.getWorkspace(id);
    if (!workspace) throw new NotFoundError(`No workspace ${id}.`);
    return workspace;
  };

  const withRepos = async (id: WorkspaceId) => {
    const workspace = await load(id);
    if (workspace.repos.length === 0) throw new InvalidError('This workspace has no repos attached.');
    return workspace;
  };

  /** Quiet about a worktree that isn't there: this is for a count on screen. */
  const repoChanges = (id: WorkspaceId, repo: WorkspaceRepo) =>
    git.changes(sessions.worktree(id, repo.name), repo.base).catch(() => NONE);

  const undo = async (id: WorkspaceId, added: ReadonlyArray<{ source: string; name: string; branch?: string | undefined }>) => {
    for (const { source, name, branch } of added) {
      await git.removeWorktree({ repo: source, path: sessions.worktree(id, name), branch }).catch(() => undefined);
    }
  };

  const nothingFound = (results: ReadonlyArray<{ repo: string; result: ImpactResult }>, target: string) => {
    const reasons = results.map(({ repo, result }) => (result.status === 'not-found' ? `${repo}: ${result.message}` : repo));
    return `Nothing matches "${target}". ${reasons.join(' ')}\nTry a Class.method, Class or function name, or a file path relative to its repo. A symbol in a file dyffle doesn't index can't be found; read the file instead. With no target you get a summary of the branch.`;
  };

  return {
    async projects() {
      const listed = await Promise.all(
        projects.list().map(async ({ name, path }) => {
          const { names, current } = await git.branches(path).catch(() => ({ names: [] as string[], current: undefined }));
          const base = names.find((branch) => branch === 'main') ?? names.find((branch) => branch === 'master') ?? current ?? names[0];
          return base ? [{ name, branches: names, base }] : [];
        }),
      );
      return listed.flat();
    },
    async attach(id, requested, branch) {
      const known = projects.list();
      const names = new Set(requested.map((repo) => repo.name));
      if (names.size !== requested.length) throw new InvalidError('A repo can only be attached once.');
      const wanted = requested.map(({ name, base }) => {
        const project = known.find((candidate) => candidate.name === name);
        if (!project) throw new InvalidError(`There is no project called ${name}.`);
        return { name, base, source: project.path };
      });
      const added: Array<{ source: string; name: string; branch?: string | undefined }> = [];
      /** What "changed since" is measured from, until the first checkpoint. */
      const contents = new Map<string, string>();
      try {
        for (const { name, base, source } of wanted) {
          const path = sessions.worktree(id, name);
          const { createdBranch } = await git.addWorktree({ repo: source, path, branch, base });
          added.push({ source, name, branch: createdBranch ? branch : undefined });
          contents.set(name, await git.contentId(path));
        }
      } catch (error) {
        // Dyffle has made nothing to clean up yet: sessions only start once every worktree exists.
        await undo(id, added);
        throw error instanceof ConflictError ? error : new ConflictError(message(error));
      }
      return wanted.map(({ name, base, source }) => ({ name, base, source, delivered: [], checkpointed: contents.get(name) as string }));
    },
    async openAll(id) {
      const { repos } = await load(id);
      await Promise.all(repos.map((repo) => sessions.session(id, repo).catch(() => undefined)));
    },
    ...checkpoints,
    async impact(id, target) {
      const { repos } = await withRepos(id);
      const results = await Promise.all(
        repos.map(async (repo) => {
          const prefix = `${repo.name}/`;
          // A path may come with its repo's folder, as the agent sees it from the workspace folder.
          const local = target?.startsWith(prefix) ? target.slice(prefix.length) : target;
          try {
            const session = await sessions.session(id, repo);
            return { repo: repo.name, result: await session.impact(local) };
          } catch (error) {
            return { repo: repo.name, result: { status: 'not-found', message: message(error) } satisfies ImpactResult as ImpactResult };
          }
        }),
      );
      const hits = results.flatMap(({ repo, result }) => (result.status === 'not-found' ? [] : [{ repo, markdown: result.markdown }]));
      if (hits.length === 0) {
        const text = target ? nothingFound(results, target) : results.map(({ repo, result }) => `${repo}: ${result.status === 'not-found' ? result.message : ''}`).join('\n');
        return { found: false, text };
      }
      if (repos.length === 1) return { found: true, text: hits[0]!.markdown };
      return { found: true, text: hits.map(({ repo, markdown }) => `# ${repo}\n\n${markdown}`).join('\n\n') };
    },
    async mapState(id) {
      const { repos, branch } = await load(id);
      const states = await Promise.all(
        repos.map(async (repo) => {
          const [changes, pending, session] = await Promise.all([
            repoChanges(id, repo),
            codeReview.pendingReview(sessions.worktree(id, repo.name), repo.delivered),
            sessions.session(id, repo).then(
              () => ({}),
              (error: unknown) => ({ error: message(error) }),
            ),
          ]);
          return { name: repo.name, base: repo.base, ...changes, pendingComments: pending.comments, ...session, ...(repo.pr ? { pr: repo.pr } : {}) };
        }),
      );
      return { ...(branch ? { branch } : {}), repos: states };
    },
    async mapSource(id, name) {
      const { repos } = await load(id);
      return (await sessions.session(id, findRepo(repos, name))).map;
    },
    viewerHtml: () => codeReview.viewerHtml(),
    view: sessions.view,
    async changes(workspace) {
      const counts = await Promise.all(workspace.repos.map((repo) => repoChanges(workspace.id, repo)));
      return counts.reduce(
        (sum, one) => ({ files: sum.files + one.files, additions: sum.additions + one.additions, deletions: sum.deletions + one.deletions }),
        NONE,
      );
    },
    async pendingReviews(id) {
      const { repos } = await load(id);
      const reviews = await Promise.all(
        repos.map(async (repo) => ({ repo: repo.name, ...(await codeReview.pendingReview(sessions.worktree(id, repo.name), repo.delivered)) })),
      );
      return reviews.filter((review) => review.marks.length > 0);
    },
    async markDelivered(id, name, marks) {
      await store.updateWorkspace(id, (workspace) => ({
        ...workspace,
        repos: workspace.repos.map((repo) => (repo.name === name ? { ...repo, delivered: [...new Set([...repo.delivered, ...marks])] } : repo)),
      }));
    },
  };
}
