import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, BoundTool } from '@drums/core';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createClaudeBackend } from './backend.js';
import { denyOtherTools } from './options.js';

const tool: BoundTool = {
  id: 'post',
  description: 'Call it.',
  input: z.object({ title: z.string() }),
  call: async () => ({ text: 'ok' }),
};
const session = { cwd: '/w', prompt: 'You are a test.', tools: [tool] };

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
