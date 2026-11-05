import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ConflictError, type BranchChanges, type Git } from '@drums/core';
import { execa } from 'execa';

/** Runs git, turning its refusal into a `ConflictError` in its own words. */
async function run(cwd: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await execa('git', args, { cwd, stripFinalNewline: false, maxBuffer: 256 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new ConflictError(stderr || (error instanceof Error ? error.message : String(error)));
  }
}

const lines = (text: string) => text.split('\n').filter(Boolean);

const branchExists = (repo: string, branch: string) =>
  run(repo, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`).then(
    () => true,
    () => false,
  );

async function countLines(path: string): Promise<number> {
  const text = await readFile(path, 'utf8').catch(() => '');
  return text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

async function changes(worktree: string, base: string): Promise<BranchChanges> {
  const mergeBase = (await run(worktree, 'merge-base', base, 'HEAD')).trim();
  const numstat = lines(await run(worktree, 'diff', '--numstat', mergeBase, '--'));
  const untracked = lines(await run(worktree, 'ls-files', '--others', '--exclude-standard'));
  let additions = 0;
  let deletions = 0;
  for (const line of numstat) {
    const [added, removed] = line.split('\t');
    // Binary files say `-`.
    additions += Number(added) || 0;
    deletions += Number(removed) || 0;
  }
  const added = await Promise.all(untracked.map((path) => countLines(join(worktree, path))));
  return { files: numstat.length + untracked.length, additions: additions + added.reduce((a, b) => a + b, 0), deletions };
}

/**
 * The tree the worktree would commit, written through a copy of its index so nothing the user can
 * see moves. A tree says nothing about commits, so committing doesn't look like a change. The copy
 * keeps git from having to hash every file again.
 */
async function contentId(worktree: string): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'drums-index-'));
  try {
    const index = join(folder, 'index');
    const own = resolve(worktree, (await run(worktree, 'rev-parse', '--git-path', 'index')).trim());
    await copyFile(own, index);
    const env = { GIT_INDEX_FILE: index };
    await execa('git', ['add', '-A'], { cwd: worktree, env });
    const { stdout } = await execa('git', ['write-tree'], { cwd: worktree, env });
    return stdout.trim();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** `Git` via execa. Branch names are checked at the HTTP edge; they still go after `--` where git allows it. */
export function createExecaGit(): Git {
  return {
    async addWorktree({ repo, path, branch, base }) {
      if (await branchExists(repo, branch)) {
        await run(repo, 'worktree', 'add', '--', path, branch);
        return { createdBranch: false };
      }
      await run(repo, 'worktree', 'add', '-b', branch, '--', path, base);
      return { createdBranch: true };
    },
    async removeWorktree({ repo, path, branch }) {
      await run(repo, 'worktree', 'remove', '--force', '--', path);
      if (branch) await run(repo, 'branch', '-D', '--', branch);
    },
    async branches(repo) {
      const names = lines(await run(repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'));
      const current = (await run(repo, 'branch', '--show-current')).trim() || undefined;
      return { names, current };
    },
    changes,
    contentId,
    async commitAll(worktree, message) {
      await run(worktree, 'add', '-A');
      if (lines(await run(worktree, 'diff', '--cached', '--name-only')).length === 0) return false;
      await run(worktree, 'commit', '-m', message);
      return true;
    },
    async push(worktree, branch) {
      await run(worktree, 'push', '-u', 'origin', `refs/heads/${branch}:refs/heads/${branch}`);
    },
  };
}
