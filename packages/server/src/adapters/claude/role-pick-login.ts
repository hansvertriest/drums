import { tmpdir } from 'node:os';
import { query, type Options, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { PickCall } from './role-pick-prompt.js';

/** The answer arrives through a tool the SDK adds for it, so this takes a model turn more than one. */
const MAX_TURNS = 3;

export type RunOneShot = (params: { prompt: string; options: Options }) => Query | AsyncIterable<SDKMessage>;

/**
 * One no-tools query on the machine's Claude Code login, for when there is no API key.
 * Nothing of the user's gets in, it works in no project, and it leaves no session behind.
 */
export function createLoginCall({ model, runQuery = query }: { model: string; runQuery?: RunOneShot | undefined }) {
  return async ({ system, user, schema }: PickCall, signal: AbortSignal): Promise<unknown> => {
    const abortController = new AbortController();
    signal.addEventListener('abort', () => abortController.abort(), { once: true });
    const messages = runQuery({
      prompt: user,
      options: {
        abortController,
        cwd: tmpdir(),
        model,
        effort: 'low',
        systemPrompt: system,
        tools: [],
        allowedTools: [],
        settingSources: [],
        strictMcpConfig: true,
        permissionMode: 'dontAsk',
        permissionPrompts: 'none',
        persistSession: false,
        maxTurns: MAX_TURNS,
        outputFormat: { type: 'json_schema', schema },
      },
    });
    for await (const message of messages) {
      if (message.type !== 'result') continue;
      return message.subtype === 'success' && !message.is_error ? message.structured_output : undefined;
    }
    return undefined;
  };
}
