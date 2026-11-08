import { z } from 'zod';
import { AgentId, RoleId } from './ids.js';

export const PermissionDecision = z.enum(['allow', 'deny']);
export type PermissionDecision = z.infer<typeof PermissionDecision>;

/** `expired`: nobody can answer it any more, because the turn or the session it belonged to ended. */
export const PermissionStatus = z.enum(['pending', 'allowed', 'denied', 'expired']);
export type PermissionStatus = z.infer<typeof PermissionStatus>;

/** A call an agent may only make with the user's say-so: an allow/deny row in its thread. */
export const PermissionRequest = z.object({
  id: z.string().min(1).max(200),
  agent: AgentId,
  tool: z.string(),
  /** One sentence: what it wants to do. */
  title: z.string(),
  /** The call itself, such as the command. */
  detail: z.string(),
  at: z.iso.datetime(),
  status: PermissionStatus,
  /** Set when this asks to hand over to a role. No session waits on such a row: drums itself acts on the answer. */
  handover: z.object({ role: RoleId }).optional(),
});
export type PermissionRequest = z.infer<typeof PermissionRequest>;
