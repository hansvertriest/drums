import type { ArtifactKindId, RoleId, ToolId } from '@drums/protocol';

/** A role is data plus a prompt, so adding one never touches the core. */
export interface RoleDefinition {
  id: RoleId;
  name: string;
  /** Used by the role picker to choose roles. */
  summary: string;
  /** The role prompt, including its work loop. */
  prompt: string;
  /** Which registered tools it gets. */
  tools: ToolId[];
  needsRepo?: boolean;
  defaultArtifactKind?: ArtifactKindId;
}
