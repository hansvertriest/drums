import { z } from 'zod';
import { AgentStatus } from './agent.js';
import { AgentId, WorkspaceId } from './ids.js';

export const AgentStatusEvent = z.object({
  type: z.literal('agent.status'),
  workspace: WorkspaceId,
  agent: AgentId,
  status: AgentStatus,
});
export type AgentStatusEvent = z.infer<typeof AgentStatusEvent>;

/** Everything `core` announces. Add a member here to add an event. */
export const DomainEvent = z.discriminatedUnion('type', [AgentStatusEvent]);
export type DomainEvent = z.infer<typeof DomainEvent>;
