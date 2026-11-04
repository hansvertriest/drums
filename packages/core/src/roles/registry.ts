import { createRegistry, type Registry } from '../registry/registry.js';
import { designerRole } from './designer.js';
import { researcherRole } from './researcher.js';
import { reviewerRole } from './reviewer.js';
import type { RoleDefinition } from './role-definition.js';
import { scoperRole } from './scoper.js';

/** Add a role: one new file in this folder, one line here. */
export const roles: readonly RoleDefinition[] = [scoperRole, researcherRole, designerRole, reviewerRole];

export type RoleRegistry = Registry<RoleDefinition>;

export function createRoleRegistry(entries: readonly RoleDefinition[] = roles): RoleRegistry {
  return createRegistry('role', entries);
}
