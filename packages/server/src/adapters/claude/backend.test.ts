import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, AgentSessionOptions, BoundTool } from '@drums/core';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createClaudeBackend } from './backend.js';
import { denyOtherTools } from './options.js';
import { isWorkspaceEdit } from './permission-gate.js';

const tool: BoundTool = {
  id: 'post',
  description: 'Call it.',
  input: z.object({ title: z.string() }),
  call: async () => ({ text: 'ok' }),
};
const session: AgentSessionOptions = { cwd: '/w', prompt: 'You are a test.', tools: [tool], access: 'tools-only' };

/** Stands in for `query`: yields the scripted messages, then ends. The model is never reached. */
function fakeQuery(messages: unknown[]) {
  const calls: Array<{ prompt: AsyncIterable<SDKUserMessage>; options: Options }> = [];
  const interrupt = vi.fn(async () => undefined);
  const close = vi.fn();
  const runQuery = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }): Query => {
    calls.push(params);
    async function* run() {
      for (const message of messages) yield message as SDKMessage;
    }
    return Object.assign(run(), { interrupt, close }) as unknown as Query;
  };
  return { calls, runQuery, interrupt, close };
}

const collect = async (events: AsyncIterable<AgentEvent>) => {
  const seen: AgentEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
};

const start = (messages: unknown[]) => {
  const fake = fakeQuery(messages);
  return { ...fake, backend: createClaudeBackend({ model: 'test-model', runQuery: fake.runQuery }) };
};

describe('permissions', () => {
  it('gives a session exactly its tools, with every prompt turned into a denial', async () => {
    const { backend, calls } = start([]);
    await backend.start(session);
    const { options } = calls[0]!;
    expect(options.tools).toEqual([]);
    expect(options.allowedTools).toEqual(['mcp__drums__post']);
    expect(options.permissionMode).toBe('dontAsk');
    expect(options.permissionPrompts).toBe('none');
    expect(options.settingSources).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
    expect(options.canUseTool).toBeUndefined();
    expect(Object.keys(options.mcpServers ?? {})).toEqual(['drums']);
  });

  it('never bypasses permissions, when starting or resuming', async () => {
    const { backend, calls } = start([]);
    await backend.start(session);
    await backend.resume('s-1', session);
    for (const { options } of calls) {
      expect(options.permissionMode).not.toBe('bypassPermissions');
      expect(options.allowDangerouslySkipPermissions).toBeFalsy();
    }
  });

  it('denies other tools in a hook too', async () => {
    const hook = denyOtherTools(['mcp__drums__post']);
    const signal = new AbortController().signal;
    const input = (tool_name: string) => ({ hook_event_name: 'PreToolUse', tool_name }) as never;
    expect(await hook(input('mcp__drums__post'), undefined, { signal })).toEqual({});
    expect(await hook(input('Bash'), undefined, { signal })).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'deny' },
    });
  });

  it('takes the model, prompt and folder from what it is given', async () => {
    const { backend, calls } = start([]);
    await backend.start(session);
    expect(calls[0]!.options).toMatchObject({ model: 'test-model', systemPrompt: 'You are a test.', cwd: '/w' });
  });

  it('resumes by session id', async () => {
    const { backend, calls } = start([]);
    await backend.resume('s-1', session);
    expect(calls[0]!.options.resume).toBe('s-1');
  });
});

describe('the session', () => {
  it('turns SDK messages into agent events', async () => {
    const { backend } = start([
      { type: 'system', subtype: 'init', session_id: 's-1' },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Looking' },
            { type: 'thinking', thinking: 'hm' },
            { type: 'tool_use', name: 'mcp__drums__artifact_create', input: { title: 'Scope', html: `<p>${'x'.repeat(500)}</p>` } },
          ],
        },
      },
      { type: 'user', message: { role: 'user', content: [] } },
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]);
    const events = await collect((await backend.start(session)).events);
    expect(events[0]).toEqual({ type: 'session', sessionId: 's-1' });
    expect(events[1]).toEqual({ type: 'text', text: 'Looking' });
    expect(events[2]).toMatchObject({ type: 'step', tool: 'artifact_create' });
    expect((events[2] as { summary: string }).summary.length).toBeLessThanOrEqual(120);
    expect(events[3]).toEqual({ type: 'turn.ended', outcome: 'success' });
  });

  it('reports failed turns', async () => {
    const { backend } = start([
      { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['boom'] },
      { type: 'result', subtype: 'success', is_error: true, result: 'Not logged in' },
    ]);
    expect(await collect((await backend.start(session)).events)).toEqual([
      { type: 'turn.ended', outcome: 'error', error: 'boom' },
      { type: 'turn.ended', outcome: 'error', error: 'Not logged in' },
    ]);
  });

  it('keeps the prompt open between turns and streams each message', async () => {
    const { backend, calls } = start([]);
    const agent = await backend.start(session);
    await agent.send('one');
    await agent.send('two');
    const prompt = calls[0]!.prompt[Symbol.asyncIterator]();
    expect((await prompt.next()).value).toMatchObject({ type: 'user', message: { role: 'user', content: 'one' } });
    expect((await prompt.next()).value).toMatchObject({ message: { content: 'two' } });
    const third = prompt.next();
    agent.close();
    expect((await third).done).toBe(true);
  });

  it('interrupts and closes the query', async () => {
    const { backend, interrupt, close } = start([]);
    const agent = await backend.start(session);
    await agent.interrupt();
    agent.close();
    expect(interrupt).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('a session with a shell and files', () => {
  const coder: AgentSessionOptions = { ...session, access: 'shell-and-files' };

  it('runs in auto mode with a place for what it cannot decide, and never bypasses', async () => {
    const { backend, calls } = start([]);
    await backend.start(coder);
    await backend.resume('s-1', coder);
    for (const { options } of calls) {
      expect(options.permissionMode).toBe('auto');
      expect(options.allowDangerouslySkipPermissions).toBeFalsy();
      expect(options.permissionPrompts).toBeUndefined();
      expect(options.canUseTool).toBeTypeOf('function');
      expect(options.tools).toEqual(['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep']);
      expect(options.settingSources).toEqual([]);
      expect(options.strictMcpConfig).toBe(true);
    }
  });

  it('still denies a tool it was not given', async () => {
    const { backend, calls } = start([]);
    await backend.start(coder);
    const hook = calls[0]!.options.hooks!.PreToolUse![0]!.hooks[0]!;
    const signal = new AbortController().signal;
    const input = (tool_name: string) => ({ hook_event_name: 'PreToolUse', tool_name }) as never;
    expect(await hook(input('Bash'), undefined, { signal })).toEqual({});
    expect(await hook(input('mcp__drums__post'), undefined, { signal })).toEqual({});
    expect(await hook(input('WebFetch'), undefined, { signal })).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });

  it('can run without the classifier from the start', async () => {
    const fake = fakeQuery([]);
    await createClaudeBackend({ model: 'm', runQuery: fake.runQuery, classifier: false }).start(coder);
    expect(fake.calls[0]!.options.permissionMode).toBe('default');
  });

  /** A query that stays open until `finish`, so a test can act during the turn. */
  function openQuery(mode: string) {
    const fake = fakeQuery([]);
    let finish = () => {};
    const done = new Promise<void>((resolve) => (finish = resolve));
    const runQuery = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }): Query => {
      fake.calls.push(params);
      async function* run() {
        yield { type: 'system', subtype: 'init', session_id: 's-1', permissionMode: mode } as SDKMessage;
        await done;
      }
      return Object.assign(run(), { interrupt: fake.interrupt, close: fake.close }) as unknown as Query;
    };
    return { calls: fake.calls, runQuery, finish };
  }

  const canUse = (options: Options) => options.canUseTool!;
  const callOptions = (extra: object = {}) => ({ signal: new AbortController().signal, toolUseID: 'tu-1', requestId: 'r', ...extra });

  async function opened(mode: string, cwd = '/w') {
    const query = openQuery(mode);
    const agent = await createClaudeBackend({ model: 'm', runQuery: query.runQuery }).start({ ...coder, cwd });
    const events = agent.events[Symbol.asyncIterator]();
    expect((await events.next()).value).toMatchObject({ type: 'step', tool: 'permissions' });
    expect((await events.next()).value).toEqual({ type: 'session', sessionId: 's-1' });
    return { ...query, agent, events, options: query.calls[0]!.options };
  }

  it('says which path it runs on', async () => {
    const onAuto = await opened('auto');
    expect(onAuto.options.permissionMode).toBe('auto');
    onAuto.finish();
  });

  it('in auto mode turns what reaches it into a request, and answers with the decision', async () => {
    const { options, events, agent, finish } = await opened('auto');
    const asked = canUse(options)('Edit', { file_path: '/w/a.ts' }, callOptions({ title: 'Claude wants to edit a.ts' }));
    const request = (await events.next()).value as Extract<AgentEvent, { type: 'permission.requested' }>;
    expect(request).toMatchObject({ type: 'permission.requested', tool: 'Edit', title: 'Claude wants to edit a.ts' });
    expect(request.detail).toContain('/w/a.ts');
    expect(await agent.respondPermission(request.id, 'allow')).toBe(true);
    expect(await asked).toEqual({ behavior: 'allow', updatedInput: { file_path: '/w/a.ts' }, toolUseID: 'tu-1' });
    expect(await agent.respondPermission(request.id, 'allow')).toBe(false);
    finish();
  });

  it('a denial goes back to the model and the turn goes on', async () => {
    const { options, events, agent, finish } = await opened('auto');
    const asked = canUse(options)('Bash', { command: 'curl x' }, callOptions());
    const request = (await events.next()).value as Extract<AgentEvent, { type: 'permission.requested' }>;
    await agent.respondPermission(request.id, 'deny');
    expect(await asked).toMatchObject({ behavior: 'deny', message: expect.stringMatching(/denied/) });
    expect((await asked) as object).not.toHaveProperty('interrupt');
    finish();
  });

  it('without auto, edits in the folder pass and everything else asks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'drums-gate-'));
    try {
      const { options, events, finish, agent } = await opened('default', dir);
      const allow = canUse(options);
      expect(await allow('Write', { file_path: join(dir, 'repo', 'a.ts') }, callOptions())).toMatchObject({ behavior: 'allow' });
      const outside = allow('Write', { file_path: join(dir, '..', 'b.ts') }, callOptions());
      const request = (await events.next()).value as Extract<AgentEvent, { type: 'permission.requested' }>;
      expect(request.tool).toBe('Write');
      await agent.respondPermission(request.id, 'deny');
      await outside;
      const shell = allow('Bash', { command: 'ls' }, callOptions());
      const asked = (await events.next()).value as Extract<AgentEvent, { type: 'permission.requested' }>;
      expect(asked.tool).toBe('Bash');
      await agent.respondPermission(asked.id, 'allow');
      await shell;
      finish();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stops waiting when the turn is cancelled, and on interrupt', async () => {
    const { options, events, agent, finish } = await opened('auto');
    const abort = new AbortController();
    const asked = canUse(options)('Bash', { command: 'x' }, callOptions({ signal: abort.signal }));
    const request = (await events.next()).value as Extract<AgentEvent, { type: 'permission.requested' }>;
    abort.abort();
    expect(await asked).toMatchObject({ behavior: 'deny' });
    expect((await events.next()).value).toEqual({ type: 'permission.cancelled', id: request.id });
    const second = canUse(options)('Bash', { command: 'y' }, callOptions());
    await events.next();
    await agent.interrupt();
    expect(await second).toMatchObject({ behavior: 'deny', interrupt: true });
    finish();
  });
});

describe('isWorkspaceEdit', () => {
  it('follows links and keeps out guarded folders', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'drums-edit-')));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'drums-out-')));
    try {
      mkdirSync(join(dir, 'repo'));
      symlinkSync(outside, join(dir, 'repo', 'out'));
      expect(isWorkspaceEdit(dir, 'Edit', { file_path: join(dir, 'repo', 'a.ts') })).toBe(true);
      expect(isWorkspaceEdit(dir, 'Write', { file_path: 'repo/new/a.ts' })).toBe(true);
      expect(isWorkspaceEdit(dir, 'Edit', { file_path: join(dir, 'repo', 'out', 'a.ts') })).toBe(false);
      expect(isWorkspaceEdit(dir, 'Edit', { file_path: join(outside, 'a.ts') })).toBe(false);
      expect(isWorkspaceEdit(dir, 'Edit', { file_path: join(dir, '..', 'a.ts') })).toBe(false);
      expect(isWorkspaceEdit(dir, 'Edit', { file_path: join(dir, '.drums', 'workspace.json') })).toBe(false);
      expect(isWorkspaceEdit(dir, 'Edit', { file_path: join(dir, 'repo', '.git', 'config') })).toBe(false);
      expect(isWorkspaceEdit(dir, 'Bash', { file_path: join(dir, 'a.ts') })).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
