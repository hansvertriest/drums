import { ConflictError, InvalidError, NotFoundError } from '../errors.js';
import type { BoundTool } from '../ports/agent-backend.js';
import type { ToolContext, ToolDefinition } from './tool-definition.js';

const isRefusal = (error: unknown): error is Error =>
  error instanceof InvalidError || error instanceof NotFoundError || error instanceof ConflictError;

/** Ties a tool to its caller. Validates the input, and turns a refusal into text the agent can act on. */
export function bindTool(tool: ToolDefinition, ctx: ToolContext): BoundTool {
  return {
    id: tool.id,
    description: tool.description,
    input: tool.input,
    async call(args) {
      const parsed = tool.input.safeParse(args);
      if (!parsed.success) return { text: `Invalid input: ${parsed.error.message}`, isError: true };
      try {
        return await tool.handle(parsed.data, ctx);
      } catch (error) {
        if (isRefusal(error)) return { text: error.message, isError: true };
        throw error;
      }
    },
  };
}
