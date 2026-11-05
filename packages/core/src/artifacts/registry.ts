import { createRegistry, type Registry } from '../registry/registry.js';
import type { ArtifactKindDefinition } from './artifact-kind.js';
import { branchMapArtifactKind } from './branch-map.js';
import { htmlArtifactKind } from './html.js';

/** Add a kind: one new file in this folder, one line here, and a renderer in `web`. */
export const artifactKinds: readonly ArtifactKindDefinition[] = [htmlArtifactKind, branchMapArtifactKind];

export type ArtifactKindRegistry = Registry<ArtifactKindDefinition>;

export function createArtifactKindRegistry(
  entries: readonly ArtifactKindDefinition[] = artifactKinds,
): ArtifactKindRegistry {
  return createRegistry('artifact kind', entries);
}
