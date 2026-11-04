import type { RoleId, ToolId } from '@drums/protocol';

/** What a session reports while it runs. Grows with M1. */
export type AgentEvent =
  | { type: 'turn.started' }
  | { type: 'turn.ended' }
  | { type: 'step'; tool: string; summary: string };

export interface AgentSessionOptions {
  cwd: string;
  role: RoleId;
  prompt: string;
  tools: ToolId[];
}

export interface AgentSession {
  /** Stored so the agent can resume after a restart. */
  readonly id: string;
  readonly events: AsyncIterable<AgentEvent>;
  send(message: string): Promise<void>;
  interrupt(): Promise<void>;
}

export interface AgentBackend {
  start(options: AgentSessionOptions): Promise<AgentSession>;
  resume(sessionId: string, options: AgentSessionOptions): Promise<AgentSession>;
}
