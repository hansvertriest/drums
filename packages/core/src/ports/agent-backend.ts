import type { ToolId } from '@drums/protocol';
import type { z } from 'zod';

/** What a session reports while it runs. */
export type AgentEvent =
  /** The backend's id for this session, stored so the agent can resume. */
  | { type: 'session'; sessionId: string }
  | { type: 'step'; tool: string; summary: string }
  | { type: 'text'; text: string }
  | { type: 'turn.ended'; outcome: 'success' | 'error'; error?: string };

export interface ToolCallResult {
  text: string;
  isError?: boolean;
}

/** A registered tool tied to one agent, so attribution is automatic. Validates its own input. */
export interface BoundTool {
  id: ToolId;
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  call(args: unknown): Promise<ToolCallResult>;
}

export interface AgentSessionOptions {
  cwd: string;
  /** The role prompt, which carries the artifact contract. */
  prompt: string;
  /** The session gets exactly these tools. Everything else is denied. */
  tools: BoundTool[];
}

export interface AgentSession {
  readonly events: AsyncIterable<AgentEvent>;
  send(message: string): Promise<void>;
  interrupt(): Promise<void>;
  close(): void;
}

export interface AgentBackend {
  start(options: AgentSessionOptions): Promise<AgentSession>;
  resume(sessionId: string, options: AgentSessionOptions): Promise<AgentSession>;
}
