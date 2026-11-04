import { createRegistry, type Registry } from '../registry/registry.js';
import { dummyRole } from './dummy.js';
import type { RoleDefinition } from './role-definition.js';

/** Add a role: one new file in this folder, one line here. */
export const roles: readonly RoleDefinition[] = [dummyRole];

export type RoleRegistry = Registry<RoleDefinition>;

export function createRoleRegistry(entries: readonly RoleDefinition[] = roles): RoleRegistry {
  return createRegistry('role', entries);
}
