import { z } from 'zod';
import { Agent } from './agent.js';
import { RoleId, WorkspaceId } from './ids.js';

export const Workspace = z.object({
  id: WorkspaceId,
  goal: z.string().min(1),
  createdAt: z.iso.datetime(),
  agents: z.array(Agent),
});
export type Workspace = z.infer<typeof Workspace>;

/** The state that most needs you. `pr` joins with M3. */
export const WorkspaceStatus = z.enum(['input', 'review', 'running', 'idle']);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatus>;

export const WorkspaceSummary = z.object({
  id: WorkspaceId,
  goal: z.string(),
  status: WorkspaceStatus,
  /** The role that posted last, for the strip. */
  lastRole: RoleId.optional(),
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummary>;
