import { z } from 'zod';
import { ArtifactKindId, RoleId, ToolId } from './ids.js';

/** `GET /api/health` */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  time: z.iso.datetime(),
  roles: z.array(RoleId),
  tools: z.array(ToolId),
  artifactKinds: z.array(ArtifactKindId),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
