import { query, type Options, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentBackend } from '@drums/core';
import { sessionOptions } from './options.js';
import { createClaudeSession } from './session.js';

export interface ClaudeBackendOptions {
  /** From config, never from code. */
  model: string;
  /** The SDK's `query`; tests replace it so they never reach the model. */
  runQuery?: (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => Query;
}

/** `AgentBackend` on the Claude Agent SDK. */
export function createClaudeBackend({ model, runQuery = query }: ClaudeBackendOptions): AgentBackend {
  return {
    start: async (session) => {
      const options = sessionOptions(session, model);
      return createClaudeSession((prompt) => runQuery({ prompt, options }));
    },
    resume: async (sessionId, session) => {
      const options = { ...sessionOptions(session, model), resume: sessionId };
      return createClaudeSession((prompt) => runQuery({ prompt, options }));
    },
  };
}
