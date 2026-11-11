import type { CodeReview, CodeReviewEventType, CodeReviewSession, ImpactResult, OpenSessionRequest, PendingReview } from '../ports/code-review.js';
import type { Dependencies } from '../ports/dependencies.js';
import type { BranchChanges, Git, WorktreeRequest } from '../ports/git.js';
import type { Project, Projects } from '../ports/projects.js';

export interface FakeReviewSession extends CodeReviewSession {
  request: OpenSessionRequest;
  stopped: boolean;
  emit(event: CodeReviewEventType): void;
}

/** Git, `gh`, dyffle and the project list, all in memory. A test sets what they answer. */
export function createFakeCode() {
  const state = {
    projectList: [{ name: 'api', path: '/repos/api' }, { name: 'web', path: '/repos/web' }] as Project[],
    worktrees: [] as WorktreeRequest[],
    removed: [] as string[],
    installs: [] as string[],
    sessions: [] as FakeReviewSession[],
    /** Per worktree. */
    changes: new Map<string, BranchChanges>(),
    /** Worktrees with uncommitted changes: add one to act as an edit, delete it to act as a commit. */
    uncommitted: new Set<string>(),
    impact: { status: 'found', markdown: '## impact' } as ImpactResult,
    pending: new Map<string, PendingReview>(),
    failAdd: undefined as string | undefined,
    failOpen: undefined as string | undefined,
    failInstall: undefined as string | undefined,
  };

  const git: Git = {
    async addWorktree(request) {
      if (state.failAdd && request.repo.endsWith(state.failAdd)) throw new Error(`fatal: cannot add ${state.failAdd}`);
      state.worktrees.push(request);
      return { createdBranch: true };
    },
    removeWorktree: async ({ path }) => void state.removed.push(path),
    branches: async (repo) => ({ names: ['dev', 'main'], current: repo.endsWith('web') ? 'dev' : 'main' }),
    changes: async (worktree) => state.changes.get(worktree) ?? { files: 1, additions: 2, deletions: 1 },
    hasUncommitted: async (worktree) => state.uncommitted.has(worktree),
  };

  const dependencies: Dependencies = {
    async install(worktree) {
      if (state.failInstall && worktree.endsWith(state.failInstall)) throw new Error('npm is not installed');
      state.installs.push(worktree);
    },
  };

  const projects: Projects = { list: () => state.projectList };

  const codeReview: CodeReview = {
    async open(request) {
      if (state.failOpen && request.worktree.endsWith(state.failOpen)) throw new Error('missing object');
      const listeners = new Set<(event: CodeReviewEventType) => void>();
      const session: FakeReviewSession = {
        request,
        stopped: false,
        map: {
          labels: () => ['Branch (live)'],
          index: () => '{}',
          views: () => '{"views":[]}',
          source: () => undefined,
          review: () => '{}',
          saveReview: () => {},
          subscribe: () => () => {},
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        impact: async () => state.impact,
        async stop() {
          session.stopped = true;
        },
        emit(event) {
          for (const listener of listeners) listener(event);
        },
      };
      state.sessions.push(session);
      return session;
    },
    viewerHtml: () => '<!doctype html><title>viewer</title>',
    async pendingReview(worktree, delivered) {
      const pending = state.pending.get(worktree);
      const marks = pending?.marks.filter((mark) => !delivered.includes(mark)) ?? [];
      return marks.length > 0 ? { markdown: pending!.markdown, comments: marks.length, marks } : { markdown: '', comments: 0, marks: [] };
    },
  };

  return { ...state, state, git, dependencies, projects, codeReview };
}
