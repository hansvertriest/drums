import { z } from 'zod';
import { WorkspaceId } from './ids.js';

export const Workspace = z.object({
  id: WorkspaceId,
  goal: z.string().min(1),
});
export type Workspace = z.infer<typeof Workspace>;
