import { z } from 'zod';
import { ArtifactId, VersionNumber } from './ids.js';

/** What the user is looking at when they send a message. The map file and diff lines join with M3. */
export const Focus = z.object({
  artifact: ArtifactId,
  version: VersionNumber,
});
export type Focus = z.infer<typeof Focus>;
