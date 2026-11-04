import { z } from 'zod';

export const AgentStatus = z.enum(['running', 'input', 'review', 'idle']);
export type AgentStatus = z.infer<typeof AgentStatus>;
