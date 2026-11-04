import type { AgentId, ArtifactKindId, ToolId, WorkspaceId } from '@drums/protocol';
import type { z } from 'zod';
import type { ArtifactService } from '../artifacts/artifact-service.js';
import type { ToolCallResult } from '../ports/agent-backend.js';
import type { PostService } from '../posts/post-service.js';

/** What tools may call. Services only, never adapters. */
export interface ToolServices {
  posts: PostService;
  artifacts: ArtifactService;
  agents: {
    requestInput(workspace: WorkspaceId, agent: AgentId, reason: string): Promise<void>;
    /** Agent ids mean nothing to another agent: this is how a tool names them. */
    namer(workspace: WorkspaceId): Promise<(agent: AgentId) => string>;
  };
}

/** Knows the calling agent, so attribution is automatic. */
export interface ToolContext {
  workspace: WorkspaceId;
  agent: AgentId;
  /** The calling role's kind for new artifacts. */
  defaultArtifactKind?: ArtifactKindId;
  services: ToolServices;
}

export type ToolResult = ToolCallResult;

export interface ToolDefinition<I = unknown> {
  id: ToolId;
  /** Says WHEN to use it, not only what it does (spec §6.1). */
  description: string;
  input: z.ZodObject<z.ZodRawShape> & z.ZodType<I>;
  handle(input: I, ctx: ToolContext): Promise<ToolResult>;
}

/**
 * Keeps a tool's input type and handler together while erasing `I` for the
 * registry list. The cast is safe if callers parse with `tool.input` first.
 */
export function defineTool<S extends z.ZodRawShape>(tool: {
  id: ToolId;
  description: string;
  input: z.ZodObject<S>;
  handle(input: z.infer<z.ZodObject<S>>, ctx: ToolContext): Promise<ToolResult>;
}): ToolDefinition {
  return tool as unknown as ToolDefinition;
}

export const jsonResult = (value: unknown, isError = false): ToolResult => ({
  text: JSON.stringify(value),
  ...(isError ? { isError } : {}),
});
