import type { OpenPrsRequest, OpenPrsResponse, PrDrafts, PullRequest, WorkspaceId, WorkspaceRepo } from '@drums/protocol';
import { createTurns } from '../concurrency/turns.js';
import { ConflictError, InvalidError, NotFoundError } from '../errors.js';
import type { EventBus } from '../events/event-bus.js';
import type { Git } from '../ports/git.js';
import type { PullRequests } from '../ports/pull-requests.js';
import type { Store } from '../ports/store.js';
import type { CodeSessions } from './code-sessions.js';

export interface PrService {
  /** What the dialog starts with: the goal as the title, and a body per repo. */
  drafts(workspace: WorkspaceId): Promise<PrDrafts>;
  /**
   * Pushes and opens one PR per named repo, then links them. A PR that was opened stays recorded if a
   * later one fails, so opening again only does the rest.
   */
  open(workspace: WorkspaceId, request: OpenPrsRequest): Promise<OpenPrsResponse>;
}

export interface PrServiceDeps {
  store: Store;
  events: EventBus;
  git: Git;
  pullRequests: PullRequests;
  sessions: CodeSessions;
  /** Agents ready for review go idle once the PRs are open. */
  agents: () => { settleReviews(workspace: WorkspaceId): Promise<void> };
}

const linksBlock = (self: string, all: ReadonlyArray<{ name: string; pr: PullRequest }>) => {
  const others = all.filter(({ name }) => name !== self);
  return others.length > 0 ? `\n\n**Part of the same change:**\n${others.map(({ name, pr }) => `- ${name}: ${pr.url}`).join('\n')}` : '';
};

export function createPrService({ store, events, git, pullRequests, sessions, agents }: PrServiceDeps): PrService {
  /** One at a time per workspace: a double click must not open a PR twice. */
  const inTurn = createTurns();

  const load = async (id: WorkspaceId) => {
    const workspace = await store.getWorkspace(id);
    if (!workspace) throw new NotFoundError(`No workspace ${id}.`);
    return workspace;
  };

  const record = (id: WorkspaceId, name: string, pr: PullRequest, prBody: string) =>
    store.updateWorkspace(id, (workspace) => ({
      ...workspace,
      repos: workspace.repos.map((repo) => (repo.name === name ? { ...repo, pr, prBody } : repo)),
    }));

  const openOne = async (id: WorkspaceId, repo: WorkspaceRepo, branch: string, title: string, body: string) => {
    const worktree = sessions.worktree(id, repo.name);
    if ((await git.changes(worktree, repo.base)).files === 0) throw new InvalidError('it has no changes.');
    await git.commitAll(worktree, title);
    await git.push(worktree, branch);
    const session = await sessions.session(id, repo);
    return pullRequests.open({ worktree, base: repo.base, head: branch, title, body: await session.withReport(body) });
  };

  return {
    async drafts(id) {
      const workspace = await load(id);
      const repos = await Promise.all(
        workspace.repos.map(async ({ name, base, pr }) => ({
          name,
          base,
          ...(await git.changes(sessions.worktree(id, name), base)),
          body: workspace.goal,
          ...(pr ? { pr } : {}),
        })),
      );
      return { title: workspace.goal.split('\n')[0]!.slice(0, 120), ...(workspace.branch ? { branch: workspace.branch } : {}), repos };
    },
    open: (id, { title, repos: wanted }) =>
      inTurn(id, async () => {
        const workspace = await load(id);
        const { branch } = workspace;
        if (!branch) throw new InvalidError('This workspace has no branch.');
        const opened: OpenPrsResponse['prs'] = [];
        const failures: string[] = [];
        for (const { name, body } of wanted) {
          const repo = workspace.repos.find((candidate) => candidate.name === name);
          if (!repo) throw new InvalidError(`This workspace has no repo ${name}.`);
          if (repo.pr) throw new ConflictError(`${name} already has PR #${repo.pr.number}.`);
          try {
            const pr = await openOne(id, repo, branch, title, body);
            await record(id, name, pr, body);
            opened.push({ repo: name, pr });
          } catch (error) {
            failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        const now = await load(id);
        const all = now.repos.flatMap(({ name, pr }) => (pr ? [{ name, pr }] : []));
        if (all.length > 1) {
          for (const { name, pr } of all) {
            const repo = now.repos.find((candidate) => candidate.name === name)!;
            const session = await sessions.session(id, repo);
            const linked = await session.withReport(`${repo.prBody ?? ''}${linksBlock(name, all)}`);
            await pullRequests.editBody({ worktree: sessions.worktree(id, name), number: pr.number, body: linked }).catch((error: unknown) => {
              failures.push(`${name}: the links could not be added: ${error instanceof Error ? error.message : String(error)}`);
            });
          }
        }
        if (opened.length > 0) {
          await agents().settleReviews(id);
          events.emit({ type: 'prs.opened', workspace: id, prs: opened });
        }
        if (failures.length > 0) throw new ConflictError(`Not everything opened. ${failures.join(' ')}`);
        return { prs: opened };
      }),
  };
}
