import type { RoleDefinition } from './role-definition.js';

/** Placeholder until the real roles arrive; M1 replaces it with the Scoper. */
export const dummyRole: RoleDefinition = {
  id: 'dummy',
  name: 'Dummy',
  summary: 'Does nothing. Proves the role registry works.',
  prompt: 'You are a placeholder role.',
  tools: ['dummy'],
  defaultArtifactKind: 'dummy',
};
