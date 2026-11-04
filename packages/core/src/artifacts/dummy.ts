import type { ArtifactKindDefinition } from './artifact-kind.js';

/** Placeholder until `html` arrives in M1. */
export const dummyArtifactKind: ArtifactKindDefinition = {
  id: 'dummy',
  name: 'Dummy',
  renderer: 'dummy',
  validate(content) {
    if (content.length === 0) throw new Error('A version needs content');
  },
};
