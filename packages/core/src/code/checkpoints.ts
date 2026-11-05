import type { AgentId, CheckpointRepo, WorkspaceId, WorkspaceRepo } from '@drums/protocol';
import type { ArtifactService } from '../artifacts/artifact-service.js';
import { branchMapArtifactKind } from '../artifacts/branch-map.js';
import { createTurns } from '../concurrency/turns.js';
import { ConflictError, InvalidError, NotFoundError } from '../errors.js';
import type { Git } from '../ports/git.js';
import type { Store } from '../ports/store.js';
import type { CodeSessions } from './code-sessions.js';

export interface CheckpointResult {
  /** The branch map's new version. Absent when nothing changed, and then there is no version. */
  version?: number;
  repos: Array<Pick<CheckpointRepo, 'name' | 'files' | 'additions' | 'deletions'>>;
  note?: string;
  /** Repos that couldn't take part; the rest did. */
  failed?: Array<{ repo: string; error: string }>;
}

export interface Checkpoints {
  checkpoint(workspace: WorkspaceId, agent: AgentId, input: { title: string; message: string }): Promise<CheckpointResult>;
  /** Whether any repo's files differ from its last checkpoint. Needs no running session. */
  uncheckpointed(workspace: WorkspaceId): Promise<boolean>;
}

export interface CheckpointsDeps {
  store: Store;
  git: Git;
  sessions: CodeSessions;
  artifacts: ArtifactService;
  /** How a checkpoint names its author. */
  namer(workspace: WorkspaceId): Promise<(agent: AgentId) => string>;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createCheckpoints({ store, git, sessions, artifacts, namer }: CheckpointsDeps): Checkpoints {
  /** One checkpoint at a time per workspace, so versions and each repo's posts stay in the same order. */
  const inTurn = createTurns();

  const reposOf = async (id: WorkspaceId) => {
    const workspace = await store.getWorkspace(id);
    if (!workspace) throw new NotFoundError(`No workspace ${id}.`);
    return workspace.repos;
  };

  const mapId = async (workspace: WorkspaceId) => {
    const metas = await store.listArtifacts(workspace);
    const found = metas.find((meta) => meta.kind === branchMapArtifactKind.id);
    return found?.id ?? (await artifacts.createEmpty(workspace, { title: branchMapArtifactKind.name, kind: branchMapArtifactKind.id })).id;
  };

  /** Workspaces from before this was recorded have no id to compare with: there, any change on the branch counts. */
  const differs = async (id: WorkspaceId, repo: WorkspaceRepo) => {
    const worktree = sessions.worktree(id, repo.name);
    return repo.checkpointed ? (await git.contentId(worktree)) !== repo.checkpointed : (await git.changes(worktree, repo.base)).files > 0;
  };

  const remember = (id: WorkspaceId, contents: ReadonlyMap<string, string>) =>
    store.updateWorkspace(id, (workspace) => ({
      ...workspace,
      repos: workspace.repos.map((repo) => {
        const checkpointed = contents.get(repo.name);
        return checkpointed ? { ...repo, checkpointed } : repo;
      }),
    }));

  return {
    async uncheckpointed(id) {
      const repos = await reposOf(id);
      return (await Promise.all(repos.map((repo) => differs(id, repo)))).some(Boolean);
    },
    checkpoint: (id, agent, { title, message: text }) =>
      inTurn(id, async () => {
        const repos = await reposOf(id);
        if (repos.length === 0) throw new InvalidError('This workspace has no repos attached.');
        const author = (await namer(id))(agent);
        const failed: NonNullable<CheckpointResult['failed']> = [];
        const changed: CheckpointRepo[] = [];
        const contents = new Map<string, string>();
        for (const repo of repos) {
          try {
            const session = await sessions.session(id, repo);
            // Read first: what an agent writes while the post is made still counts as changed since.
            const content = await git.contentId(sessions.worktree(id, repo.name));
            const { post, stats } = await session.checkpoint({ title, message: text, author });
            contents.set(repo.name, content);
            if (stats) changed.push({ name: repo.name, post, ...stats });
          } catch (error) {
            failed.push({ repo: repo.name, error: message(error) });
          }
        }
        await remember(id, contents);
        const summary = changed.map(({ name, files, additions, deletions }) => ({ name, files, additions, deletions }));
        const partial = failed.length > 0 ? { failed } : {};
        if (changed.length === 0) {
          if (failed.length === repos.length) throw new ConflictError(`The checkpoint failed. ${failed.map((f) => `${f.repo}: ${f.error}`).join(' ')}`);
          return { repos: [], note: 'Nothing changed since your last checkpoint, so there is no new version.', ...partial };
        }
        const map = await mapId(id);
        const { version } = await artifacts.record(id, agent, {
          id: map,
          content: JSON.stringify({ repos: changed }),
          note: title,
          post: (number) => ({ kind: 'checkpoint', title, message: text, artifact: map, version: number, repos: changed }),
        });
        return { version, repos: summary, ...partial };
      }),
  };
}
