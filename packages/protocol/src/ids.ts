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

/** Ids that end up in file paths and URLs: no slashes, no dots, no way out of a folder. */
const PathSafeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);

export const WorkspaceId = PathSafeId;
export type WorkspaceId = z.infer<typeof WorkspaceId>;

export const AgentId = PathSafeId;
export type AgentId = z.infer<typeof AgentId>;

export const ArtifactId = PathSafeId;
export type ArtifactId = z.infer<typeof ArtifactId>;

export const VersionNumber = z.number().int().positive();
export type VersionNumber = z.infer<typeof VersionNumber>;
