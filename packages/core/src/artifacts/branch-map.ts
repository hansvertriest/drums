import { BranchMapVersion } from '@drums/protocol';
import { InvalidError } from '../errors.js';
import type { ArtifactKindDefinition } from './artifact-kind.js';

function parses(content: string): boolean {
  try {
    return BranchMapVersion.safeParse(JSON.parse(content)).success;
  } catch {
    return false;
  }
}

/** The live dyffle map of a branch. Each version is a checkpoint, and the live branch shows before the first. */
export const branchMapArtifactKind: ArtifactKindDefinition = {
  id: 'branch-map',
  name: 'Branch map',
  renderer: 'branch-map',
  showsWithoutVersions: true,
  managed: 'The branch map follows your code: call checkpoint instead.',
  validate(content) {
    if (!parses(content)) throw new InvalidError('A branch map version is the repos of a checkpoint, as JSON.');
  },
};
