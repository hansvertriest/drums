import { z } from 'zod';

/**
 * Open string ids, not closed unions: a new role, tool or artifact kind is one
 * file plus one registry line in `core`, and never touches this package.
 */
export const RoleId = z.string().min(1);
export type RoleId = z.infer<typeof RoleId>;

export const ToolId = z.string().min(1);
export type ToolId = z.infer<typeof ToolId>;

export const ArtifactKindId = z.string().min(1);
export type ArtifactKindId = z.infer<typeof ArtifactKindId>;

export const WorkspaceId = z.string().min(1);
export type WorkspaceId = z.infer<typeof WorkspaceId>;

export const AgentId = z.string().min(1);
export type AgentId = z.infer<typeof AgentId>;
