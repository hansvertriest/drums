import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Dependencies } from '@drums/core';
import { execa } from 'execa';

/** The first lockfile found decides. */
const MANAGERS = [
  { lockfile: 'package-lock.json', command: 'npm', args: ['ci'] },
  { lockfile: 'pnpm-lock.yaml', command: 'pnpm', args: ['install', '--frozen-lockfile'] },
  { lockfile: 'yarn.lock', command: 'yarn', args: ['install', '--immutable'] },
];

const DEFAULT_TIMEOUT_MS = 5 * 60_000;
/** Enough of the end of the output to hold the error, which is all a step line needs. */
const OUTPUT_TAIL = 800;

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** `Dependencies` via execa. No input, so a package manager that asks a question fails instead of waiting. */
export function createLockfileDependencies({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}): Dependencies {
  return {
    async install(worktree) {
      const found = await Promise.all(MANAGERS.map((manager) => exists(join(worktree, manager.lockfile))));
      const manager = MANAGERS[found.indexOf(true)];
      if (!manager) return;
      const { command, args } = manager;
      const name = [command, ...args].join(' ');
      try {
        await execa(command, args, { cwd: worktree, stdin: 'ignore', all: true, timeout: timeoutMs });
      } catch (error) {
        const { timedOut, code, all, message } = error as { timedOut?: boolean; code?: string; all?: string; message: string };
        if (timedOut) throw new Error(`${name} timed out after ${timeoutMs / 1000}s`);
        if (code === 'ENOENT') throw new Error(`${command} is not installed`);
        throw new Error(`${name} failed: ${(all?.trim() || message).slice(-OUTPUT_TAIL)}`);
      }
    },
  };
}
