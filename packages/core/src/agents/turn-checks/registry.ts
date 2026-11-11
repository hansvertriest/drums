import { createRegistry, type Registry } from '../../registry/registry.js';
import { artifactFileWritten } from './artifact-file-written.js';
import type { TurnCheck } from './turn-check.js';
import { uncommittedChanges } from './uncommitted-changes.js';

/** Add a check: one new file in this folder, one line here. */
export const turnChecks: readonly TurnCheck[] = [uncommittedChanges, artifactFileWritten];

export type TurnCheckRegistry = Registry<TurnCheck>;

export function createTurnCheckRegistry(entries: readonly TurnCheck[] = turnChecks): TurnCheckRegistry {
  return createRegistry('turn check', entries);
}
