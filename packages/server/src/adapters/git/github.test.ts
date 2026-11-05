import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDirs } from '../../testing/temp-repo.js';
import { createGhPullRequests } from './github.js';

const dirs = tempDirs();
const PATH = process.env.PATH;
let bin: string;
let log: string;

/** A `gh` first on `PATH` that records its arguments and stdin. Never the real one. */
function stubGh(script: string) {
  const path = join(bin, 'gh');
  writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\ncat >> "${log}"\n${script}\n`);
  chmodSync(path, 0o755);
}

beforeEach(() => {
  bin = dirs.make('drums-gh-');
  log = join(bin, 'calls.log');
  process.env.PATH = `${bin}${delimiter}${PATH}`;
});
afterEach(() => {
  process.env.PATH = PATH;
  dirs.cleanup();
});

describe('createGhPullRequests', () => {
  it('opens a PR with the body on stdin, and reads the URL', async () => {
    stubGh('echo https://github.example/o/r/pull/12');
    const pr = await createGhPullRequests().open({ worktree: bin, base: 'main', head: 'drums/x', title: 'A title', body: 'The body' });
    expect(pr).toEqual({ number: 12, url: 'https://github.example/o/r/pull/12' });
    const calls = readFileSync(log, 'utf8');
    expect(calls).toContain('pr create --base main --head drums/x --title A title --body-file -');
    expect(calls).toContain('The body');
  });

  it('edits a body', async () => {
    stubGh('exit 0');
    await createGhPullRequests().editBody({ worktree: bin, number: 12, body: 'New body' });
    const calls = readFileSync(log, 'utf8');
    expect(calls).toContain('pr edit 12 --body-file -');
    expect(calls).toContain('New body');
  });

  it('passes on what gh says when it refuses', async () => {
    stubGh('echo "no such repo" >&2; exit 1');
    await expect(createGhPullRequests().open({ worktree: bin, base: 'main', head: 'x', title: 'T', body: '' })).rejects.toThrow(/no such repo/);
  });

  it('refuses output without a PR in it', async () => {
    stubGh('echo done');
    await expect(createGhPullRequests().open({ worktree: bin, base: 'main', head: 'x', title: 'T', body: '' })).rejects.toThrow(/didn't say/);
  });
});
