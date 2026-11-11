import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempRepo, runGit, tempDirs, writeFile } from '../../testing/temp-repo.js';
import { createExecaGit } from './git.js';

const dirs = tempDirs();
const git = createExecaGit();
let parent: string;
let repo: string;
let origin: string;

beforeEach(() => {
  parent = dirs.make('drums-git-');
  ({ path: repo, origin } = createTempRepo(parent, 'repo', { withOrigin: true }) as { path: string; origin: string });
});
afterEach(() => dirs.cleanup());

const worktree = () => join(parent, 'ws', 'repo');

describe('worktrees', () => {
  it('creates the branch from the base', async () => {
    expect(await git.addWorktree({ repo, path: worktree(), branch: 'drums/x', base: 'main' })).toEqual({ createdBranch: true });
    expect(runGit(worktree(), 'branch', '--show-current').trim()).toBe('drums/x');
    expect(runGit(repo, 'branch', '--show-current').trim()).toBe('main');
  });

  it('checks out a branch that exists', async () => {
    runGit(repo, 'branch', 'existing');
    expect(await git.addWorktree({ repo, path: worktree(), branch: 'existing', base: 'main' })).toEqual({ createdBranch: false });
  });

  it('refuses in git\'s own words, and with a bad base', async () => {
    await expect(git.addWorktree({ repo, path: worktree(), branch: 'main', base: 'main' })).rejects.toMatchObject({ name: 'ConflictError' });
    await expect(git.addWorktree({ repo, path: worktree(), branch: 'y', base: 'no-such-base' })).rejects.toThrow(/no-such-base/);
  });

  it('removes one, with the branch if asked', async () => {
    await git.addWorktree({ repo, path: worktree(), branch: 'drums/x', base: 'main' });
    await git.removeWorktree({ repo, path: worktree(), branch: 'drums/x' });
    expect(existsSync(worktree())).toBe(false);
    expect(runGit(repo, 'branch').trim()).not.toContain('drums/x');
  });

  it('lists branches and the current one', async () => {
    runGit(repo, 'branch', 'dev');
    expect(await git.branches(repo)).toEqual({ names: ['dev', 'main'], current: 'main' });
  });
});

describe('changes', () => {
  beforeEach(() => git.addWorktree({ repo, path: worktree(), branch: 'drums/x', base: 'main' }));

  it('counts nothing on a new branch', async () => {
    expect(await git.changes(worktree(), 'main')).toEqual({ files: 0, additions: 0, deletions: 0 });
  });

  it('counts commits, uncommitted edits and untracked files', async () => {
    writeFile(worktree(), 'committed.ts', 'a\nb\n');
    runGit(worktree(), 'add', '.');
    runGit(worktree(), 'commit', '-m', 'c');
    writeFile(worktree(), 'untracked.ts', 'one\ntwo\nthree\n');
    writeFile(worktree(), 'src/math.ts', 'export const replaced = 1;\n');
    const changes = await git.changes(worktree(), 'main');
    expect(changes.files).toBe(3);
    expect(changes.additions).toBe(2 + 3 + 1);
    expect(changes.deletions).toBe(7);
  });

  it('ignores what main did since', async () => {
    writeFile(repo, 'later.ts', 'x\n');
    runGit(repo, 'add', '.');
    runGit(repo, 'commit', '-m', 'later');
    expect((await git.changes(worktree(), 'main')).files).toBe(0);
  });
});

describe('commit and push', () => {
  beforeEach(() => git.addWorktree({ repo, path: worktree(), branch: 'drums/x', base: 'main' }));

  it('commits what is uncommitted, untracked included, or says there was nothing', async () => {
    expect(await git.commitAll(worktree(), 'nothing')).toBe(false);
    writeFile(worktree(), 'new.ts', 'x\n');
    expect(await git.commitAll(worktree(), 'Add it')).toBe(true);
    expect(runGit(worktree(), 'log', '-1', '--format=%s').trim()).toBe('Add it');
    expect(runGit(worktree(), 'status', '--porcelain').trim()).toBe('');
  });

  it('pushes the branch to origin, a local bare repo here', async () => {
    writeFile(worktree(), 'new.ts', 'x\n');
    await git.commitAll(worktree(), 'Add it');
    await git.push(worktree(), 'drums/x');
    expect(runGit(origin, 'log', '-1', '--format=%s', 'drums/x').trim()).toBe('Add it');
    expect(runGit(origin, 'branch', '--list', 'main').trim()).toContain('main');
  });

  it('refuses a push that is not a fast-forward instead of forcing it', async () => {
    writeFile(worktree(), 'a.ts', 'x\n');
    await git.commitAll(worktree(), 'one');
    await git.push(worktree(), 'drums/x');
    runGit(worktree(), 'reset', '--hard', 'main');
    writeFile(worktree(), 'b.ts', 'x\n');
    await git.commitAll(worktree(), 'two');
    await expect(git.push(worktree(), 'drums/x')).rejects.toMatchObject({ name: 'ConflictError' });
    expect(runGit(origin, 'log', '-1', '--format=%s', 'drums/x').trim()).toBe('one');
  });
});

describe('hasUncommitted', () => {
  const add = () => git.addWorktree({ repo, path: worktree(), branch: 'drums/x', base: 'main' });

  it('sees new, changed, deleted and staged files, and nothing once they are committed', async () => {
    await add();
    expect(await git.hasUncommitted(worktree())).toBe(false);
    writeFile(worktree(), 'new.ts', 'x\n');
    expect(await git.hasUncommitted(worktree())).toBe(true);
    await git.commitAll(worktree(), 'one');
    expect(await git.hasUncommitted(worktree())).toBe(false);
    writeFile(worktree(), 'src/math.ts', 'changed\n');
    expect(await git.hasUncommitted(worktree())).toBe(true);
    runGit(worktree(), 'checkout', '--', 'src/math.ts');
    expect(await git.hasUncommitted(worktree())).toBe(false);
    runGit(worktree(), 'rm', '-q', 'src/math.ts');
    expect(await git.hasUncommitted(worktree())).toBe(true);
  });

  it('ignores what git ignores', async () => {
    await add();
    writeFile(worktree(), '.gitignore', 'built/\n');
    await git.commitAll(worktree(), 'ignore built');
    writeFile(worktree(), 'built/x.js', 'x\n');
    expect(await git.hasUncommitted(worktree())).toBe(false);
  });
});
