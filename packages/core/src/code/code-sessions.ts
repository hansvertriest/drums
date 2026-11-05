import type { WorkspaceId, WorkspaceRepo } from '@drums/protocol';
import { ConflictError, NotFoundError } from '../errors.js';
import type { EventBus } from '../events/event-bus.js';
import type { CodeReview, CodeReviewSession } from '../ports/code-review.js';
import type { Store } from '../ports/store.js';

export interface CodeSessions {
  /** The repo's running session, resuming or starting it if there is none. `ConflictError` if it can't run. */
  session(workspace: WorkspaceId, repo: WorkspaceRepo): Promise<CodeReviewSession>;
  /** Stops a workspace's sessions. The next `session` resumes them where they were. */
  stop(workspace: WorkspaceId): Promise<void>;
  stopAll(): Promise<void>;
  worktree(workspace: WorkspaceId, repo: string): string;
}

export interface CodeSessionsDeps {
  codeReview: CodeReview;
  store: Store;
  events: EventBus;
  viewerUrl(workspace: WorkspaceId, repo: string): string;
}

/** One session per worktree (spec §7). Failing to start is not remembered: the next request tries again. */
export function createCodeSessions({ codeReview, store, events, viewerUrl }: CodeSessionsDeps): CodeSessions {
  const running = new Map<string, { workspace: WorkspaceId; opening: Promise<CodeReviewSession>; unsubscribe?: () => void }>();

  const worktree: CodeSessions['worktree'] = (workspace, repo) => `${store.workspacePath(workspace)}/${repo}`;

  const stopEntry = async (key: string) => {
    const entry = running.get(key);
    if (!entry) return;
    running.delete(key);
    entry.unsubscribe?.();
    const session = await entry.opening.catch(() => undefined);
    await session?.stop();
  };

  const keysOf = (workspace?: WorkspaceId) =>
    [...running].filter(([, entry]) => workspace === undefined || entry.workspace === workspace).map(([key]) => key);

  return {
    worktree,
    session(workspace, repo) {
      const key = `${workspace}/${repo.name}`;
      const found = running.get(key);
      if (found) return found.opening;
      const entry: { workspace: WorkspaceId; opening: Promise<CodeReviewSession>; unsubscribe?: () => void } = {
        workspace,
        opening: codeReview
          .open({ worktree: worktree(workspace, repo.name), baseRef: repo.base, viewerUrl: viewerUrl(workspace, repo.name) })
          .then((session) => {
            entry.unsubscribe = session.subscribe((aspect) => events.emit({ type: 'map.changed', workspace, repo: repo.name, aspect }));
            return session;
          })
          .catch((error: unknown) => {
            running.delete(key);
            const reason = error instanceof Error ? error.message : String(error);
            throw new ConflictError(`The code session of ${repo.name} could not start: ${reason}`);
          }),
      };
      running.set(key, entry);
      return entry.opening;
    },
    stop: async (workspace) => void (await Promise.all(keysOf(workspace).map(stopEntry))),
    stopAll: async () => void (await Promise.all(keysOf().map(stopEntry))),
  };
}

export const findRepo = (repos: readonly WorkspaceRepo[], name: string): WorkspaceRepo => {
  const repo = repos.find((candidate) => candidate.name === name);
  if (!repo) throw new NotFoundError(`This workspace has no repo ${name}.`);
  return repo;
};
