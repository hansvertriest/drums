import type { ArtifactKindId } from '@drums/protocol';

/** How a kind's versions are validated and which frontend renderer shows them. */
export interface ArtifactKindDefinition {
  id: ArtifactKindId;
  name: string;
  /** Key into the web package's renderer registry. */
  renderer: string;
  /** Throws if the content is not a valid version of this kind. */
  validate(content: string): void;
}
