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

/**
 * The live dyffle map of a branch: the whole branch, each commit and the uncommitted changes, all in
 * dyffle's own viewer. It has no versions of its own; those from before were checkpoints.
 */
export const branchMapArtifactKind: ArtifactKindDefinition = {
  id: 'branch-map',
  name: 'Branch map',
  renderer: 'branch-map',
  showsWithoutVersions: true,
  managed: 'The branch map follows your code: commit your changes instead.',
  validate(content) {
    if (!parses(content)) throw new InvalidError('A branch map has no versions of its own: it shows the commits on the branch.');
  },
};
