import type { Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, AgentSession } from '@drums/core';
import { createInputQueue } from './input-queue.js';
import { toAgentEvents } from './messages.js';
import type { PermissionGate } from './permission-gate.js';

export type RunQuery = (io: { prompt: AsyncIterable<SDKUserMessage>; emit(event: AgentEvent): void }) => {
  query: Query;
  gate?: PermissionGate | undefined;
};

/** The permission mode a message says the session is in, if it says. */
function reportedMode(message: SDKMessage) {
  if (message.type !== 'system') return undefined;
  if (message.subtype === 'init' || message.subtype === 'status') return message.permissionMode;
  return undefined;
}

/**
 * One long-lived streaming query per agent: `send` starts a turn, a `result` message ends it.
 * Permission requests arrive beside the query's messages, so one queue carries both.
 */
export function createClaudeSession(run: RunQuery, cwd: string): AgentSession {
  const input = createInputQueue<SDKUserMessage>();
  const output = createInputQueue<AgentEvent>();
  const { query, gate } = run({ prompt: input.iterable, emit: output.push });

  const pump = async () => {
    try {
      for await (const message of query) {
        const mode = gate && reportedMode(message);
        for (const event of mode ? gate.observeMode(mode) : []) output.push(event);
        for (const event of toAgentEvents(message, cwd)) output.push(event);
      }
      output.close();
    } catch (error) {
      output.fail(error);
    }
  };
  void pump();

  return {
    events: output.iterable,
    send: async (text) => {
      input.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null });
    },
    interrupt: async () => {
      gate?.denyAll('The user stopped this turn.');
      await query.interrupt();
    },
    respondPermission: async (id, decision) => gate?.respond(id, decision) ?? false,
    close() {
      gate?.denyAll('The session is closing.');
      input.close();
      query.close();
    },
  };
}
