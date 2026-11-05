import type { CodeChange, CodeReview, CodeReviewEventType, CodeReviewSession, ImpactResult, OpenSessionRequest, PendingReview } from '../ports/code-review.js';
import type { BranchChanges, Git, WorktreeRequest } from '../ports/git.js';
import type { Project, Projects } from '../ports/projects.js';
import type { PullRequests } from '../ports/pull-requests.js';

export interface FakeReviewSession extends CodeReviewSession {
  request: OpenSessionRequest;
  posts: Array<{ title: string; message: string; author: string }>;
  stopped: boolean;
  emit(event: CodeReviewEventType): void;
}

/** Git, `gh`, dyffle and the project list, all in memory. A test sets what they answer. */
export function createFakeCode() {
  const state = {
    projectList: [{ name: 'api', path: '/repos/api' }, { name: 'web', path: '/repos/web' }] as Project[],
    worktrees: [] as WorktreeRequest[],
    removed: [] as string[],
    pushes: [] as Array<{ worktree: string; branch: string }>,
    commits: [] as Array<{ worktree: string; message: string }>,
    opened: [] as Array<{ worktree: string; base: string; head: string; title: string; body: string; number: number }>,
    edits: [] as Array<{ worktree: string; number: number; body: string }>,
    sessions: [] as FakeReviewSession[],
    /** Per worktree. */
    changes: new Map<string, BranchChanges>(),
    change: { post: 1, stats: { files: 1, additions: 2, deletions: 1, symbols: 1 } } as CodeChange,
    impact: { status: 'found', markdown: '## impact' } as ImpactResult,
    pending: new Map<string, PendingReview>(),
    failAdd: undefined as string | undefined,
    failOpen: undefined as string | undefined,
    failPr: undefined as string | undefined,
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
    commitAll: async (worktree, message) => {
      state.commits.push({ worktree, message });
      return true;
    },
    push: async (worktree, branch) => void state.pushes.push({ worktree, branch }),
  };

  const pullRequests: PullRequests = {
    async open({ worktree, base, head, title, body }) {
      if (state.failPr && worktree.endsWith(state.failPr)) throw new Error(`gh: refused ${state.failPr}`);
      const number = state.opened.length + 1;
      state.opened.push({ worktree, base, head, title, body, number });
      return { number, url: `https://example.test/pull/${number}` };
    },
    editBody: async (edit) => void state.edits.push(edit),
  };

  const projects: Projects = { list: () => state.projectList };

  const codeReview: CodeReview = {
    async open(request) {
      if (state.failOpen && request.worktree.endsWith(state.failOpen)) throw new Error('missing object');
      const listeners = new Set<(event: CodeReviewEventType) => void>();
      const session: FakeReviewSession = {
        request,
        posts: [],
        stopped: false,
        map: {
          labels: () => ['Branch (live)'],
          index: () => '{}',
          feed: () => '{"live":{},"posts":[]}',
          source: () => undefined,
          review: () => '{}',
          saveReview: () => {},
          subscribe: () => () => {},
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        async checkpoint(input) {
          session.posts.push(input);
          return { post: session.posts.length, ...(state.change.stats ? { stats: state.change.stats } : {}) };
        },
        impact: async () => state.impact,
        withReport: async (body) => `${body}\n<!-- dyffle:start -->\nreport\n<!-- dyffle:end -->`,
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

  return { ...state, state, git, pullRequests, projects, codeReview };
}
