import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

export const SOURCE = `export function add(a: number, b: number): number {
  return a + b;
}

export function twice(a: number): number {
  return add(a, a);
}
`;

/** A throwaway folder that goes away with `cleanup`. */
export function tempDirs() {
  const made: string[] = [];
  return {
    make(prefix = 'drums-test-') {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
      made.push(dir);
      return dir;
    },
    cleanup() {
      for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const runGit = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...IDENTITY } });

export function writeFile(root: string, path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A real repo on `main` with one small TypeScript file. With `withOrigin`, a local bare repo is its `origin`. */
export function createTempRepo(parent: string, name = 'repo', { withOrigin = false } = {}) {
  const path = join(parent, name);
  mkdirSync(path, { recursive: true });
  runGit(path, 'init', '-b', 'main');
  runGit(path, 'config', 'user.name', 't');
  runGit(path, 'config', 'user.email', 't@t');
  writeFile(path, 'src/math.ts', SOURCE);
  writeFile(path, 'tsconfig.json', '{ "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext" } }\n');
  runGit(path, 'add', '.');
  runGit(path, 'commit', '-m', 'init');
  if (!withOrigin) return { path };
  const origin = join(parent, `${name}-origin.git`);
  runGit(parent, 'init', '--bare', '-b', 'main', origin);
  runGit(path, 'remote', 'add', 'origin', origin);
  runGit(path, 'push', 'origin', 'main');
  return { path, origin };
}
