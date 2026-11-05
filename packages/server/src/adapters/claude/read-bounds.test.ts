import type { AgentSessionOptions } from '@drums/core';
import { roles } from '@drums/core';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sessionOptions } from './options.js';
import { boundReads, grepWithoutClosedFiles, refusedRead } from './read-bounds.js';

const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'drums-read-')));
const outside = realpathSync(mkdtempSync(join(tmpdir(), 'drums-read-out-')));
mkdirSync(join(cwd, 'repo', 'src'), { recursive: true });
writeFileSync(join(cwd, 'repo', 'src', 'a.ts'), '');
writeFileSync(join(cwd, 'repo', '.env'), '');
writeFileSync(join(outside, 'secret.txt'), '');
symlinkSync(outside, join(cwd, 'repo', 'out'));
symlinkSync(join(outside, 'secret.txt'), join(cwd, 'repo', 'notes.txt'));
symlinkSync(join(cwd, 'repo', '.env'), join(cwd, 'repo', 'settings.txt'));

afterAll(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('refusedRead', () => {
  const allowed: Array<[string, string, Record<string, unknown>]> = [
    ['an absolute path inside', 'Read', { file_path: join(cwd, 'repo', 'src', 'a.ts') }],
    ['a relative path', 'Read', { file_path: 'repo/src/a.ts' }],
    ['a file that does not exist', 'Read', { file_path: 'repo/new/a.ts' }],
    ['a `..` that stays inside', 'Read', { file_path: 'repo/src/../src/a.ts' }],
    ['a name like a secret but not one', 'Read', { file_path: 'repo/environment.ts' }],
    ['Glob with no path', 'Glob', { pattern: '**/*.ts' }],
    ['Glob in a folder', 'Glob', { pattern: 'src/*.ts', path: 'repo' }],
    ['Glob with an absolute pattern inside', 'Glob', { pattern: join(cwd, 'repo', '*.ts') }],
    ['Grep with no path', 'Grep', { pattern: 'x' }],
    ['Grep in the working directory', 'Grep', { pattern: 'x', path: cwd }],
    ['Grep in a folder', 'Grep', { pattern: 'x', path: 'repo/src' }],
  ];
  it.each(allowed)('allows %s', (_name, tool, input) => {
    expect(refusedRead(cwd, tool, input)).toBeUndefined();
  });

  const refused: Array<[string, string, Record<string, unknown>]> = [
    ['an absolute path outside', 'Read', { file_path: '/etc/hosts' }],
    ['a home path', 'Read', { file_path: '~/.ssh/id_rsa' }],
    ['`..` out', 'Read', { file_path: '../secret.txt' }],
    ['`..` out from an absolute path', 'Read', { file_path: join(cwd, 'repo', '..', '..', 'secret.txt') }],
    ['a link to a file outside', 'Read', { file_path: 'repo/notes.txt' }],
    ['a path through a linked folder', 'Read', { file_path: 'repo/out/secret.txt' }],
    ['a link to a secret', 'Read', { file_path: 'repo/settings.txt' }],
    ['.env', 'Read', { file_path: 'repo/.env' }],
    ['.env in another case', 'Read', { file_path: 'repo/.ENV' }],
    ['.env.local', 'Read', { file_path: 'repo/.env.local' }],
    ['a .pem', 'Read', { file_path: 'repo/certs/server.pem' }],
    ['a .key', 'Read', { file_path: 'repo/server.key' }],
    ['.git/config', 'Read', { file_path: 'repo/.git/config' }],
    ['.GIT/config', 'Read', { file_path: 'repo/.GIT/config' }],
    ['.drums', 'Read', { file_path: '.drums/workspace.json' }],
    ['.dyffle', 'Read', { file_path: 'repo/.dyffle/live.json' }],
    ['no file_path', 'Read', {}],
    ['a file_path that is not text', 'Read', { file_path: 1 }],
    ['Glob with a path outside', 'Glob', { pattern: '*', path: outside }],
    ['Glob through a linked folder', 'Glob', { pattern: '*', path: 'repo/out' }],
    ['Glob with an absolute pattern outside', 'Glob', { pattern: '/etc/*' }],
    ['Glob on the root', 'Glob', { pattern: '/*' }],
    ['Glob with a home pattern', 'Glob', { pattern: '~/.ssh/*' }],
    ['Glob with `..` in the pattern', 'Glob', { pattern: '../*' }],
    ['Glob with `..` in braces', 'Glob', { pattern: '{../..,src}/*' }],
    ['Glob with an absolute brace', 'Glob', { pattern: '{src,/etc}/*' }],
    ['Glob through a link in its pattern', 'Glob', { pattern: 'repo/out/*' }],
    ['Glob into .git', 'Glob', { pattern: 'repo/.git/*' }],
    ['Glob with no pattern', 'Glob', {}],
    ['Grep with a path outside', 'Grep', { pattern: 'x', path: '/etc' }],
    ['Grep through a linked folder', 'Grep', { pattern: 'x', path: 'repo/out' }],
    ['Grep on a home path', 'Grep', { pattern: 'x', path: '~' }],
    ['Grep on .env', 'Grep', { pattern: 'x', path: 'repo/.env' }],
    ['Grep in .git', 'Grep', { pattern: 'x', path: 'repo/.git' }],
    ['Grep with a path that is not text', 'Grep', { pattern: 'x', path: ['/etc'] }],
  ];
  it.each(refused)('refuses %s', (_name, tool, input) => {
    expect(refusedRead(cwd, tool, input)).toBeTypeOf('string');
  });
});

describe('grepWithoutClosedFiles', () => {
  it('keeps the closed files out of a recursive search, after any glob of its own', () => {
    expect(grepWithoutClosedFiles({ pattern: 'x' }).glob).toBe('!.git !.drums !.dyffle !.env !.env.* !*.pem !*.key');
    expect(grepWithoutClosedFiles({ pattern: 'x', glob: '*.ts' }).glob).toMatch(/^\*\.ts !\.git /);
  });
});

describe('boundReads', () => {
  const run = (tool_name: string, tool_input: unknown) =>
    boundReads(cwd)({ hook_event_name: 'PreToolUse', tool_name, tool_input } as never, undefined, { signal: new AbortController().signal });

  it('denies what the check refuses, and leaves other tools and allowed reads alone', async () => {
    expect(await run('Read', { file_path: '/etc/hosts' })).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
    expect(await run('Read', { file_path: 'repo/src/a.ts' })).toEqual({});
    expect(await run('mcp__drums__post', { title: 'x' })).toEqual({});
  });

  it('narrows a Grep it allows', async () => {
    const output = await run('Grep', { pattern: 'x' });
    expect(output).toMatchObject({ hookSpecificOutput: { updatedInput: { pattern: 'x', glob: expect.stringContaining('!.env') } } });
    expect(output).not.toMatchObject({ hookSpecificOutput: { permissionDecision: expect.anything() } });
  });
});

describe('session options by access', () => {
  const session = (access: AgentSessionOptions['access']): AgentSessionOptions => ({ cwd, prompt: 'p', tools: [], access });

  it.each(['scoper', 'researcher', 'designer', 'reviewer'])('%s gets exactly the read tools, and no way to a row', async (id) => {
    const role = roles.find((entry) => entry.id === id)!;
    expect(role.access).toBe('read-files');
    const options = sessionOptions(session(role.access!), 'm', { classifier: true, canUseTool: async () => ({ behavior: 'deny', message: 'no' }) });
    expect(options.tools).toEqual(['Read', 'Glob', 'Grep']);
    expect(options.allowedTools).toEqual(['Read', 'Glob', 'Grep']);
    expect(options.permissionMode).toBe('dontAsk');
    expect(options.permissionPrompts).toBe('none');
    expect(options.settingSources).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
    expect(options.canUseTool).toBeUndefined();
    expect(options.allowDangerouslySkipPermissions).toBeFalsy();
    const [others] = options.hooks!.PreToolUse![0]!.hooks;
    for (const tool of ['Bash', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Agent']) {
      const input = { hook_event_name: 'PreToolUse', tool_name: tool } as never;
      expect(await others!(input, undefined, { signal: new AbortController().signal }), tool).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
    }
  });

  it('leaves the Coder as it was', () => {
    const canUseTool = async () => ({ behavior: 'deny', message: 'no' }) as const;
    const coder = roles.find((entry) => entry.id === 'coder')!;
    expect(coder.access).toBe('shell-and-files');
    const options = sessionOptions(session(coder.access!), 'm', { classifier: true, canUseTool });
    expect(options.tools).toEqual(['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep']);
    expect(options.allowedTools).toEqual([]);
    expect(options.permissionMode).toBe('auto');
    expect(options.permissionPrompts).toBeUndefined();
    expect(options.canUseTool).toBe(canUseTool);
    expect(options.hooks!.PreToolUse![0]!.hooks).toHaveLength(1);
  });
});
