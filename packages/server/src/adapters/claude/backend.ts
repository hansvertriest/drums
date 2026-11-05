import { query, type Options, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentBackend, AgentSessionOptions } from '@drums/core';
import { sessionOptions } from './options.js';
import { createPermissionGate } from './permission-gate.js';
import { createClaudeSession } from './session.js';

export interface ClaudeBackendOptions {
  /** From config, never from code. */
  model: string;
  /** The SDK's `query`; tests replace it so they never reach the model. */
  runQuery?: (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => Query;
  /** False skips `auto` mode and runs the fallback, as if the account didn't have it. */
  classifier?: boolean;
}

/** `AgentBackend` on the Claude Agent SDK. */
export function createClaudeBackend({ model, runQuery = query, classifier = true }: ClaudeBackendOptions): AgentBackend {
  const open = (session: AgentSessionOptions, extra: Partial<Options> = {}) =>
    createClaudeSession(({ prompt, emit }) => {
      const gate = session.access === 'shell-and-files' ? createPermissionGate(session.cwd, emit) : undefined;
      const options = { ...sessionOptions(session, model, { canUseTool: gate?.canUseTool, classifier }), ...extra };
      return { query: runQuery({ prompt, options }), gate };
    }, session.cwd);
  return {
    start: async (session) => open(session),
    resume: async (sessionId, session) => open(session, { resume: sessionId }),
  };
}
