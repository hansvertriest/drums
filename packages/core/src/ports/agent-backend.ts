import type { PermissionDecision, ToolId } from '@drums/protocol';
import type { z } from 'zod';

/** What a session reports while it runs. */
export type AgentEvent =
  /** The backend's id for this session, stored so the agent can resume. */
  | { type: 'session'; sessionId: string }
  /**
   * A tool call. `writes` holds the files it is known to write: relative to the session's
   * working directory when inside it, absolute when not. Best effort for a shell command.
   */
  | { type: 'step'; tool: string; summary: string; writes?: string[] }
  | { type: 'text'; text: string }
  /** A call only the user can decide. The turn waits for `respondPermission`. */
  | { type: 'permission.requested'; id: string; tool: string; title: string; detail: string }
  /** The backend stopped waiting for that answer, because its turn was cancelled. */
  | { type: 'permission.cancelled'; id: string }
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

/**
 * What a session can touch besides its tools.
 * - `tools-only`: exactly `tools`, and everything else is denied.
 * - `read-files`: also reading and searching the workspace folder, and nothing outside it. Never asks.
 * - `shell-and-files`: also a shell and file tools. The backend decides what it approves by
 *   itself, and sends the rest as `permission.requested`. The folder is not a security boundary.
 */
export type SystemAccess = 'tools-only' | 'read-files' | 'shell-and-files';

export interface AgentSessionOptions {
  cwd: string;
  /** The role prompt, which carries the artifact contract. */
  prompt: string;
  /** The tools drums gives this session. */
  tools: BoundTool[];
  access: SystemAccess;
}

export interface AgentSession {
  readonly events: AsyncIterable<AgentEvent>;
  send(message: string): Promise<void>;
  interrupt(): Promise<void>;
  /** Answers a `permission.requested`. False if nothing is waiting under that id. */
  respondPermission(id: string, decision: PermissionDecision): Promise<boolean>;
  close(): void;
}

export interface AgentBackend {
  start(options: AgentSessionOptions): Promise<AgentSession>;
  resume(sessionId: string, options: AgentSessionOptions): Promise<AgentSession>;
}
