import { createRegistry, type Registry } from '../registry/registry.js';
import { artifactCreateTool } from './artifact-create.js';
import { artifactListTool } from './artifact-list.js';
import { artifactReadTool } from './artifact-read.js';
import { artifactUpdateTool } from './artifact-update.js';
import { checkpointTool } from './checkpoint.js';
import { feedTool } from './feed.js';
import { handoverTool } from './handover.js';
import { impactTool } from './impact.js';
import { postTool } from './post.js';
import { requestInputTool } from './request-input.js';
import type { ToolDefinition } from './tool-definition.js';

/** Add a tool: one new file in this folder, one line here. */
export const tools: readonly ToolDefinition[] = [
  postTool,
  artifactListTool,
  artifactReadTool,
  artifactCreateTool,
  artifactUpdateTool,
  requestInputTool,
  handoverTool,
  feedTool,
  checkpointTool,
  impactTool,
];

export type ToolRegistry = Registry<ToolDefinition>;

export function createToolRegistry(entries: readonly ToolDefinition[] = tools): ToolRegistry {
  return createRegistry('tool', entries);
}
