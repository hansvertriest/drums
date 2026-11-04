import type { BoundTool } from '@drums/core';
import type { z } from 'zod';

/** A tool as MCP sees it: a flat input shape and a handler answering with content blocks. */
export interface McpTool {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  handler(args: unknown): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>;
}

/**
 * The tool registry in MCP's terms. The Agent SDK's in-process server is built from this in
 * `adapters/claude`, the one folder that may name the SDK, and `stdio.ts` will use the same list.
 */
export function toMcpTools(tools: readonly BoundTool[]): McpTool[] {
  return tools.map((tool) => ({
    name: tool.id,
    description: tool.description,
    shape: tool.input.shape,
    async handler(args) {
      const { text, isError } = await tool.call(args);
      return { content: [{ type: 'text', text }], ...(isError ? { isError } : {}) };
    },
  }));
}
