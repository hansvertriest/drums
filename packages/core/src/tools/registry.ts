import { createRegistry, type Registry } from '../registry/registry.js';
import { dummyTool } from './dummy.js';
import type { ToolDefinition } from './tool-definition.js';

/** Add a tool: one new file in this folder, one line here. */
export const tools: readonly ToolDefinition[] = [dummyTool];

export type ToolRegistry = Registry<ToolDefinition>;

export function createToolRegistry(entries: readonly ToolDefinition[] = tools): ToolRegistry {
  return createRegistry('tool', entries);
}
