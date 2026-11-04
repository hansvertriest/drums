import type { AgentId, ToolId, WorkspaceId } from '@drums/protocol';
import type { z } from 'zod';

/** Handlers call services through this, never adapters. Services join it as they are built. */
export interface ToolContext {
  workspace: WorkspaceId;
  agent: AgentId;
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

export interface ToolDefinition<I = unknown> {
  id: ToolId;
  /** Says WHEN to use it, not only what it does (spec §6.1). */
  description: string;
  input: z.ZodType<I>;
  handle(input: I, ctx: ToolContext): Promise<ToolResult>;
}

/**
 * Keeps a tool's input type and handler together while erasing `I` for the
 * registry list. The cast is safe if callers parse with `tool.input` first.
 */
export function defineTool<I>(tool: ToolDefinition<I>): ToolDefinition {
  return tool as unknown as ToolDefinition;
}
