import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTempRepo, runGit, tempDirs, writeFile } from '../../testing/temp-repo.js';
import { createExecaGit } from '../git/git.js';
import { createLockfileDependencies } from './lockfile.js';

const LOCK = { name: 'x', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'x', version: '1.0.0' } } };
/** The root's own install script is how a lockfile with no dependencies shows it ran. */
const MANIFEST = { name: 'x', version: '1.0.0', scripts: { postinstall: "node -e \"require('fs').writeFileSync('installed', '')\"" } };

const dirs = tempDirs();
let parent: string;

beforeEach(() => {
  parent = dirs.make('drums-install-');
  // Nothing here may reach the network, whatever npm would like to check.
  vi.stubEnv('npm_config_offline', 'true');
  vi.stubEnv('npm_config_audit', 'false');
  vi.stubEnv('npm_config_update_notifier', 'false');
  vi.stubEnv('npm_config_cache', join(parent, 'npm-cache'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  dirs.cleanup();
});

/** A real worktree of a repo holding these files. */
async function worktree(files: Record<string, string>) {
  const { path: repo } = createTempRepo(parent);
  for (const [path, text] of Object.entries(files)) writeFile(repo, path, text);
  runGit(repo, 'add', '.');
  runGit(repo, 'commit', '--allow-empty', '-m', 'files');
  const path = join(parent, 'ws', 'repo');
  await createExecaGit().addWorktree({ repo, path, branch: 'drums/x', base: 'main' });
  return path;
}

/** A PATH holding only this script, named as the package manager. */
function onlyOnPath(command: string, script: string) {
  const bin = join(parent, 'bin');
  writeFile(bin, command, `#!/bin/sh\n${script}\n`);
  chmodSync(join(bin, command), 0o755);
  vi.stubEnv('PATH', bin);
}

describe('installing from the lockfile', () => {
  it('runs npm ci for a package-lock.json', async () => {
    const path = await worktree({ 'package.json': JSON.stringify(MANIFEST), 'package-lock.json': JSON.stringify(LOCK) });
    await createLockfileDependencies().install(path);
    expect(existsSync(join(path, 'installed'))).toBe(true);
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm', 'install --frozen-lockfile'],
    ['yarn.lock', 'yarn', 'install --immutable'],
  ])('for a %s runs %s %s', async (lockfile, command, args) => {
    const path = await worktree({ [lockfile]: '' });
    onlyOnPath(command, 'echo "$@" > ran');
    await createLockfileDependencies().install(path);
    expect(readFileSync(join(path, 'ran'), 'utf8').trim()).toBe(args);
  });

  it('skips a repo with no lockfile', async () => {
    const path = await worktree({ 'package.json': JSON.stringify(MANIFEST) });
    onlyOnPath('npm', 'echo ran > ran');
    await createLockfileDependencies().install(path);
    expect(existsSync(join(path, 'ran'))).toBe(false);
  });

  it('says what the package manager said when it fails', async () => {
    const path = await worktree({ 'package-lock.json': JSON.stringify(LOCK) });
    onlyOnPath('npm', 'echo lock is broken >&2\nexit 1');
    await expect(createLockfileDependencies().install(path)).rejects.toThrow(/npm ci failed: lock is broken/);
  });

  it('counts a missing package manager as a failure', async () => {
    const path = await worktree({ 'yarn.lock': '' });
    vi.stubEnv('PATH', join(parent, 'nothing-here'));
    await expect(createLockfileDependencies().install(path)).rejects.toThrow(/yarn is not installed/);
  });

  it('gives up after the timeout', async () => {
    const path = await worktree({ 'package-lock.json': JSON.stringify(LOCK) });
    onlyOnPath('npm', 'exec /bin/sleep 30');
    await expect(createLockfileDependencies({ timeoutMs: 100 }).install(path)).rejects.toThrow(/npm ci timed out/);
  });
});
