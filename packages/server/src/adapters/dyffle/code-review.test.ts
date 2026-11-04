import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDyffleCodeReview } from './code-review.js';

const dirs: string[] = [];

function tempRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'drums-dyffle-')));
  dirs.push(dir);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-b', 'main');
  writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'init');
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('createDyffleCodeReview', () => {
  it('opens and stops a live session on a worktree', async () => {
    const repo = tempRepo();
    const session = await createDyffleCodeReview().open(repo, 'main');
    session.subscribe(() => {})();
    expect(existsSync(join(repo, '.dyffle'))).toBe(true);
    await expect(session.stop()).resolves.toBeUndefined();
  }, 30_000);
});
