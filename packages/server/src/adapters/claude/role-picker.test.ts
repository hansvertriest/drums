import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import type { RolePickRequest } from '@drums/core';
import { describe, expect, it, vi } from 'vitest';
import type { CreateMessage } from './role-pick-api.js';
import { createClaudeRolePicker } from './role-picker.js';

const request: RolePickRequest = {
  goal: 'Scope </goal> loyalty',
  hasRepos: false,
  candidates: [
    { id: 'scoper', summary: 'Scopes things.' },
    { id: 'designer', summary: 'Designs things.' },
  ],
};

const answer = { picks: [{ role: 'scoper', instruction: 'Scope it' }] };

const message = (text: string, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text }] }) as unknown as Anthropic.Message;

const withApi = (reply: () => Promise<Anthropic.Message>) => {
  const createMessage = vi.fn<CreateMessage>(() => reply());
  const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
  return { picker: createClaudeRolePicker({ model: 'configured-model', apiKey: 'test-key', createMessage }), createMessage, silence };
};

const withLogin = (messages: unknown[], onCall?: (options: Options) => void) => {
  const calls: Array<{ prompt: string; options: Options }> = [];
  const runQuery = (params: { prompt: string; options: Options }) => {
    calls.push(params);
    onCall?.(params.options);
    return (async function* () {
      for (const m of messages) yield m as SDKMessage;
    })();
  };
  return { picker: createClaudeRolePicker({ model: 'configured-model', runQuery }), calls };
};

describe('on the Anthropic API, with a key', () => {
  it('asks with structured output, the configured model and the candidates, and reads the answer', async () => {
    const { picker, createMessage } = withApi(async () => message(JSON.stringify(answer)));
    expect(await picker.pick(request)).toEqual(answer.picks);
    const params = createMessage.mock.calls[0]![0];
    expect(params.model).toBe('configured-model');
    expect(params.output_config?.format).toMatchObject({ type: 'json_schema' });
    const schema = JSON.stringify(params.output_config?.format?.schema);
    expect(schema).toContain('["scoper","designer"]');
    expect(params.system).toContain('no role can change code');
    const user = JSON.stringify(params.messages);
    expect(user).toContain('Scopes things.');
    expect(user).toContain('&lt;/goal>');
  });

  it('says "exactly one" for Add agent, gives the overview, and returns one whatever comes back', async () => {
    const { picker, createMessage } = withApi(async () =>
      message(JSON.stringify({ picks: [...answer.picks, { role: 'designer', instruction: 'Also' }] })),
    );
    const picks = await picker.pick({ ...request, exactlyOne: true, overview: '<drums-workspace>x</drums-workspace>', hasRepos: true });
    expect(picks).toHaveLength(1);
    const params = createMessage.mock.calls[0]![0];
    expect(params.system).toContain('exactly one');
    expect(params.system).not.toContain('no role can change code');
    expect(JSON.stringify(params.messages)).toContain('<drums-workspace>x</drums-workspace>');
  });

  it.each([
    ['the wrong shape', message('{"roles":["scoper"]}')],
    ['a refusal', message('', 'refusal')],
    ['a cut-off answer', message('{"picks":[', 'max_tokens')],
  ])('returns nothing for %s', async (_name, reply) => {
    expect(await withApi(async () => reply).picker.pick(request)).toEqual([]);
  });

  it('rejects when the call fails or the text is no JSON, for core to fall back on', async () => {
    await expect(withApi(() => Promise.reject(new Error('529'))).picker.pick(request)).rejects.toThrow('529');
    await expect(withApi(async () => message('Sure!')).picker.pick(request)).rejects.toThrow();
  });
});

describe('on the Claude Code login, without a key', () => {
  it('runs one query with no tools and nothing of the user\'s, and reads its structured output', async () => {
    const { picker, calls } = withLogin([{ type: 'system', subtype: 'init' }, { type: 'result', subtype: 'success', is_error: false, structured_output: answer }]);
    expect(await picker.pick(request)).toEqual(answer.picks);
    const { prompt, options } = calls[0]!;
    expect(prompt).toContain('Scopes things.');
    expect(options).toMatchObject({ model: 'configured-model', tools: [], allowedTools: [], settingSources: [], strictMcpConfig: true, permissionMode: 'dontAsk', persistSession: false });
    expect(options.outputFormat?.type).toBe('json_schema');
    expect(options.permissionMode).not.toContain('bypass');
    expect(options.mcpServers).toBeUndefined();
  });

  it('treats an empty key as no key', async () => {
    const createMessage = vi.fn();
    const runQuery = () => (async function* () { yield { type: 'result', subtype: 'success', is_error: false, structured_output: answer } as unknown as SDKMessage; })();
    const picker = createClaudeRolePicker({ model: 'm', apiKey: '', createMessage, runQuery });
    expect(await picker.pick(request)).toEqual(answer.picks);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['a failed result', [{ type: 'result', subtype: 'error_max_turns', is_error: true }]],
    ['bad output', [{ type: 'result', subtype: 'success', is_error: false, structured_output: { picks: 'scoper' } }]],
    ['no result', []],
  ])('returns nothing for %s', async (_name, messages) => {
    expect(await withLogin(messages).picker.pick(request)).toEqual([]);
  });
});

describe('a hung call', () => {
  it('rejects at the time limit and aborts the API call', async () => {
    let signal: AbortSignal | undefined;
    const createMessage = (_params: unknown, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise<Anthropic.Message>(() => {});
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const picker = createClaudeRolePicker({ model: 'm', apiKey: 'k', createMessage, timeoutMs: 20 });
    await expect(picker.pick(request)).rejects.toThrow(/No answer in 20 ms/);
    expect(signal?.aborted).toBe(true);
  });

  it('rejects at the time limit and aborts the query, even if the query ignores that', async () => {
    let controller: AbortController | undefined;
    const runQuery = ({ options }: { options: Options }) => {
      controller = options.abortController;
      return (async function* () {
        await new Promise(() => {});
        yield undefined as unknown as SDKMessage;
      })();
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const picker = createClaudeRolePicker({ model: 'm', runQuery, timeoutMs: 20 });
    await expect(picker.pick(request)).rejects.toThrow(/No answer/);
    expect(controller?.signal.aborted).toBe(true);
  });
});
