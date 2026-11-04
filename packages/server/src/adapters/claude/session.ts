import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, AgentSession } from '@drums/core';
import { createInputQueue } from './input-queue.js';
import { toAgentEvents } from './messages.js';

export type RunQuery = (prompt: AsyncIterable<SDKUserMessage>) => Query;

/** One long-lived streaming query per agent: `send` starts a turn, a `result` message ends it. */
export function createClaudeSession(run: RunQuery): AgentSession {
  const input = createInputQueue<SDKUserMessage>();
  const query = run(input.iterable);

  async function* events(): AsyncGenerator<AgentEvent> {
    for await (const message of query) yield* toAgentEvents(message);
  }

  return {
    events: events(),
    send: async (text) => {
      input.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null });
    },
    interrupt: async () => {
      await query.interrupt();
    },
    close() {
      input.close();
      query.close();
    },
  };
}
