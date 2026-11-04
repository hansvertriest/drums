import { z } from 'zod';
import { AgentId, RoleId } from './ids.js';

export const AgentStatus = z.enum(['running', 'input', 'review', 'idle']);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const Agent = z.object({
  id: AgentId,
  role: RoleId,
  name: z.string().min(1),
  status: AgentStatus,
  /** Stored so the agent can resume; absent until the backend reports one. */
  sessionId: z.string().min(1).optional(),
});
export type Agent = z.infer<typeof Agent>;
